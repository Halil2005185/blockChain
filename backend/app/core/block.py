"""Block model and proof-of-work mining.

A block bundles transactions together with a *header*:

* ``index``         - position in the chain (genesis is 0)
* ``timestamp``     - when the block was created
* ``previous_hash`` - hash of the block before it: this is the "chain" link
* ``merkle_root``   - one hash that commits to all transactions
* ``data``          - an optional free-text note (e.g. the genesis message)
* ``difficulty``    - how many leading zeros the hash must have
* ``nonce``         - the number miners change while searching for a valid hash

The block's ``hash`` is the SHA-256 of the header. Because the header contains
``previous_hash``, each block's hash depends on every block before it.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import BlockchainError, InvalidBlockError
from app.core.hashing import hash_payload, meets_difficulty
from app.core.merkle import compute_merkle_root
from app.core.transaction import Transaction

MIN_DIFFICULTY = 1
# Pure-Python SHA-256 manages roughly 10^5-10^6 hashes per second. Each extra
# zero multiplies the expected work by 16, so 6 zeros (~16.7 million attempts
# on average) is already a long wait - a good place to stop.
MAX_DIFFICULTY = 6

HASH_LENGTH = 64


@dataclass(frozen=True)
class MiningProgress:
    """A snapshot of an in-progress mining attempt, used for live UI updates."""

    nonce: int
    current_hash: str
    attempts: int
    elapsed_seconds: float
    difficulty: int

    @property
    def hashes_per_second(self) -> float:
        return self.attempts / self.elapsed_seconds if self.elapsed_seconds > 0 else 0.0

    @property
    def expected_attempts(self) -> int:
        """Average attempts needed: each hex digit matches '0' with chance 1/16."""
        return 16**self.difficulty


@dataclass(frozen=True)
class MiningResult:
    """Statistics about a successful mining run."""

    nonce: int
    hash: str
    attempts: int
    duration_seconds: float
    difficulty: int

    @property
    def hashes_per_second(self) -> float:
        return self.attempts / self.duration_seconds if self.duration_seconds > 0 else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "nonce": self.nonce,
            "hash": self.hash,
            "attempts": self.attempts,
            "duration_seconds": self.duration_seconds,
            "difficulty": self.difficulty,
            "hashes_per_second": self.hashes_per_second,
        }


class MiningCancelled(BlockchainError):
    """Raised when a caller asks a running mining loop to stop."""


ProgressCallback = Callable[[MiningProgress], None]
StopCondition = Callable[[], bool]


def validate_difficulty(difficulty: int) -> None:
    if isinstance(difficulty, bool) or not isinstance(difficulty, int):
        raise InvalidBlockError("difficulty must be an integer")
    if not MIN_DIFFICULTY <= difficulty <= MAX_DIFFICULTY:
        raise InvalidBlockError(
            f"difficulty must be between {MIN_DIFFICULTY} and {MAX_DIFFICULTY}"
        )


@dataclass
class Block:
    """One block in the chain.

    ``hash`` is *stored*, not derived. That is deliberate: when someone tampers
    with a block's contents, the stored hash no longer matches a freshly
    calculated one, which is exactly how tampering gets detected.
    """

    index: int
    transactions: list[Transaction]
    previous_hash: str
    difficulty: int
    timestamp: float = field(default_factory=time.time)
    nonce: int = 0
    data: str = ""
    hash: str = ""

    def __post_init__(self) -> None:
        if isinstance(self.index, bool) or not isinstance(self.index, int) or self.index < 0:
            raise InvalidBlockError("index must be a non-negative integer")
        if len(self.previous_hash) != HASH_LENGTH:
            raise InvalidBlockError(f"previous_hash must be {HASH_LENGTH} hex characters")
        validate_difficulty(self.difficulty)
        if not self.hash:
            self.hash = self.calculate_hash()

    # ------------------------------------------------------------------ #
    # Hashing
    # ------------------------------------------------------------------ #
    @property
    def merkle_root(self) -> str:
        """Merkle root of the current transactions (recomputed on each access)."""
        return compute_merkle_root([tx.tx_id for tx in self.transactions])

    def header(self, merkle_root: str | None = None) -> dict[str, Any]:
        """The fields that are hashed. Transactions enter via the Merkle root."""
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "previous_hash": self.previous_hash,
            "merkle_root": self.merkle_root if merkle_root is None else merkle_root,
            "data": self.data,
            "difficulty": self.difficulty,
            "nonce": self.nonce,
        }

    def calculate_hash(self) -> str:
        """Compute the SHA-256 hash of the block header *as it is right now*."""
        return hash_payload(self.header())

    def meets_target(self) -> bool:
        """Does the stored hash have the required number of leading zeros?"""
        return meets_difficulty(self.hash, self.difficulty)

    def hash_matches_contents(self) -> bool:
        """Does the stored hash still match the block's current contents?"""
        return self.hash == self.calculate_hash()

    def validate_hash(self) -> bool:
        """A block's hash is valid when it matches the contents AND meets the target."""
        return self.hash_matches_contents() and self.meets_target()

    # ------------------------------------------------------------------ #
    # Mining
    # ------------------------------------------------------------------ #
    def mine_block(
        self,
        progress_callback: ProgressCallback | None = None,
        progress_interval: int = 5_000,
        should_stop: StopCondition | None = None,
    ) -> MiningResult:
        """Search for a nonce that makes the hash meet the difficulty target.

        Proof of work is simple brute force: set ``nonce = 0``, hash the header,
        and if the hash doesn't start with enough zeros, increment the nonce and
        try again. There is no shortcut, which is what makes a valid hash
        "proof" that work was done.

        Args:
            progress_callback: Called every ``progress_interval`` attempts with a
                :class:`MiningProgress` snapshot (used to stream live updates).
            progress_interval: How many attempts between progress callbacks.
            should_stop: Polled at each progress interval; returning ``True``
                aborts mining with :class:`MiningCancelled`.

        This method is synchronous and CPU-bound. The API layer runs it in a
        worker thread so the web server stays responsive.
        """
        if progress_interval < 1:
            raise ValueError("progress_interval must be at least 1")

        # The Merkle root doesn't depend on the nonce, so compute it once
        # instead of re-hashing every transaction on every attempt.
        merkle_root = self.merkle_root
        header = self.header(merkle_root)

        start = time.perf_counter()
        attempts = 0
        nonce = 0
        while True:
            header["nonce"] = nonce
            candidate = hash_payload(header)
            attempts += 1

            if meets_difficulty(candidate, self.difficulty):
                self.nonce = nonce
                self.hash = candidate
                duration = time.perf_counter() - start
                if progress_callback is not None:
                    progress_callback(
                        MiningProgress(nonce, candidate, attempts, duration, self.difficulty)
                    )
                return MiningResult(nonce, candidate, attempts, duration, self.difficulty)

            if attempts % progress_interval == 0:
                if should_stop is not None and should_stop():
                    raise MiningCancelled(f"mining stopped after {attempts} attempts")
                if progress_callback is not None:
                    elapsed = time.perf_counter() - start
                    progress_callback(
                        MiningProgress(nonce, candidate, attempts, elapsed, self.difficulty)
                    )

            nonce += 1

    # ------------------------------------------------------------------ #
    # Serialization
    # ------------------------------------------------------------------ #
    def to_dict(self) -> dict[str, Any]:
        """Representation for APIs/UI, including derived validity flags."""
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "transactions": [tx.to_dict() for tx in self.transactions],
            "previous_hash": self.previous_hash,
            "merkle_root": self.merkle_root,
            "data": self.data,
            "difficulty": self.difficulty,
            "nonce": self.nonce,
            "hash": self.hash,
            "is_genesis": self.index == 0,
            "hash_valid": self.validate_hash(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Block:
        """Rebuild a block, keeping its *stored* hash so validity can be checked."""
        try:
            return cls(
                index=data["index"],
                timestamp=data["timestamp"],
                transactions=[Transaction.from_dict(tx) for tx in data["transactions"]],
                previous_hash=data["previous_hash"],
                difficulty=data["difficulty"],
                nonce=data["nonce"],
                data=data.get("data", ""),
                hash=data["hash"],
            )
        except KeyError as exc:
            raise InvalidBlockError(f"missing block field: {exc.args[0]}") from exc
