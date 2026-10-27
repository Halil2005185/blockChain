"""Transaction model.

A transaction records that one fictional account sent an amount to another.
In this educational project there are no wallets, keys or real money: accounts
are just names like ``"alice"`` and amounts are made-up "EDU" units.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import InvalidTransactionError
from app.core.hashing import hash_payload

# Special sender used for the mining reward. Real blockchains call this a
# "coinbase" transaction: new units are created rather than moved.
NETWORK_SENDER = "NETWORK"

MAX_ACCOUNT_NAME_LENGTH = 64
MAX_AMOUNT = 1_000_000_000


@dataclass
class Transaction:
    """A transfer of fictional units between two fictional accounts."""

    sender: str
    receiver: str
    amount: float
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        self.validate()
        # Canonical form: JSON writes int 10 as "10" but float 10.0 as "10.0",
        # which would give the *same* transaction two different hashes.
        self.amount = float(self.amount)

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    def validate(self) -> None:
        """Raise :class:`InvalidTransactionError` if the transaction is malformed."""
        for label, name in (("sender", self.sender), ("receiver", self.receiver)):
            if not isinstance(name, str) or not name.strip():
                raise InvalidTransactionError(f"{label} must be a non-empty string")
            if len(name) > MAX_ACCOUNT_NAME_LENGTH:
                raise InvalidTransactionError(
                    f"{label} must be at most {MAX_ACCOUNT_NAME_LENGTH} characters"
                )

        if self.sender == self.receiver:
            raise InvalidTransactionError("sender and receiver must be different accounts")

        # bool is a subclass of int in Python, so exclude it explicitly.
        if isinstance(self.amount, bool) or not isinstance(self.amount, (int, float)):
            raise InvalidTransactionError("amount must be a number")
        if not self.amount > 0:  # also rejects NaN
            raise InvalidTransactionError("amount must be greater than zero")
        if self.amount > MAX_AMOUNT:
            raise InvalidTransactionError(f"amount must not exceed {MAX_AMOUNT}")

    @property
    def is_reward(self) -> bool:
        """True for the mining-reward transaction created by the network."""
        return self.sender == NETWORK_SENDER

    # ------------------------------------------------------------------ #
    # Identity & serialization
    # ------------------------------------------------------------------ #
    @property
    def tx_id(self) -> str:
        """A unique fingerprint of this transaction (the hash of its contents).

        It is recomputed on every access, so if someone tampers with a field
        the ID changes too - this is also what feeds the Merkle root.
        """
        return hash_payload(self.to_hashable_dict())

    def to_hashable_dict(self) -> dict[str, Any]:
        """Only the fields that define the transaction (no derived values)."""
        return {
            "sender": self.sender,
            "receiver": self.receiver,
            "amount": self.amount,
            "timestamp": self.timestamp,
        }

    def to_dict(self) -> dict[str, Any]:
        """Full representation for APIs and the UI, including the derived ID."""
        return {**self.to_hashable_dict(), "tx_id": self.tx_id}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Transaction:
        """Rebuild a transaction from :meth:`to_dict` output (``tx_id`` is ignored)."""
        try:
            return cls(
                sender=data["sender"],
                receiver=data["receiver"],
                amount=data["amount"],
                timestamp=data["timestamp"],
            )
        except KeyError as exc:
            raise InvalidTransactionError(f"missing transaction field: {exc.args[0]}") from exc

    @classmethod
    def reward(cls, miner: str, amount: float, timestamp: float | None = None) -> Transaction:
        """Create the mining-reward ("coinbase") transaction for ``miner``."""
        return cls(
            sender=NETWORK_SENDER,
            receiver=miner,
            amount=amount,
            timestamp=time.time() if timestamp is None else timestamp,
        )
