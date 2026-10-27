"""The Blockchain: an ordered list of blocks plus a pool of pending transactions.

Responsibilities:

* Create the genesis block.
* Collect pending transactions until a miner packages them into a block.
* Mine new blocks (proof of work) and append them.
* Validate the whole chain, reporting *which* block broke and *why*.
* Accept blocks produced elsewhere (used by the network simulation later).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from app.core.block import (
    Block,
    MiningResult,
    ProgressCallback,
    StopCondition,
    validate_difficulty,
)
from app.core.exceptions import InvalidBlockError, InvalidTransactionError
from app.core.transaction import NETWORK_SENDER, Transaction

DEFAULT_DIFFICULTY = 3
DEFAULT_MINING_REWARD = 10.0

# The genesis block has no predecessor, so by convention it points to a hash of
# all zeros. Bitcoin uses the same convention.
GENESIS_PREVIOUS_HASH = "0" * 64

# The genesis block is *hard-coded*: every node must create exactly the same
# first block, otherwise they would be on different blockchains from the start.
# A fixed timestamp (2025-01-01T00:00:00Z) and message make it reproducible.
GENESIS_TIMESTAMP = 1735689600.0
GENESIS_DATA = "Genesis block - Interactive 3D Blockchain Explorer (educational, no real value)"


@dataclass(frozen=True)
class BlockValidationIssue:
    """One reason why a particular block is invalid."""

    index: int
    code: str
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {"index": self.index, "code": self.code, "message": self.message}


@dataclass
class ChainValidationResult:
    """Detailed outcome of :meth:`Blockchain.validate_chain`."""

    chain_length: int
    issues: list[BlockValidationIssue] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.issues

    @property
    def first_invalid_index(self) -> int | None:
        return min((issue.index for issue in self.issues), default=None)

    @property
    def invalid_indices(self) -> list[int]:
        """Blocks that themselves fail a check."""
        return sorted({issue.index for issue in self.issues})

    @property
    def untrusted_indices(self) -> list[int]:
        """Every block from the first broken one onward.

        Even if a later block passes its own checks, it builds on a broken
        history, so it cannot be trusted either. The UI highlights these.
        """
        first = self.first_invalid_index
        return [] if first is None else list(range(first, self.chain_length))

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "chain_length": self.chain_length,
            "first_invalid_index": self.first_invalid_index,
            "invalid_indices": self.invalid_indices,
            "untrusted_indices": self.untrusted_indices,
            "issues": [issue.to_dict() for issue in self.issues],
        }


class Blockchain:
    """An in-memory blockchain using proof of work."""

    def __init__(
        self,
        difficulty: int = DEFAULT_DIFFICULTY,
        mining_reward: float = DEFAULT_MINING_REWARD,
    ) -> None:
        validate_difficulty(difficulty)
        if mining_reward < 0:
            raise ValueError("mining_reward must not be negative")

        self._difficulty = difficulty
        self.mining_reward = mining_reward
        self.pending_transactions: list[Transaction] = []
        self.chain: list[Block] = [self.create_genesis_block()]

    # ------------------------------------------------------------------ #
    # Difficulty
    # ------------------------------------------------------------------ #
    @property
    def difficulty(self) -> int:
        """Difficulty used for the *next* block mined.

        Each block records the difficulty it was mined with, so changing this
        value never invalidates blocks that already exist.
        """
        return self._difficulty

    @difficulty.setter
    def difficulty(self, value: int) -> None:
        validate_difficulty(value)
        self._difficulty = value

    # ------------------------------------------------------------------ #
    # Genesis & lookup
    # ------------------------------------------------------------------ #
    def create_genesis_block(self) -> Block:
        """Build and mine the hard-coded first block.

        All inputs are constants, so the mined hash is the same on every run
        and on every node that uses the same difficulty.
        """
        genesis = Block(
            index=0,
            timestamp=GENESIS_TIMESTAMP,
            transactions=[],
            previous_hash=GENESIS_PREVIOUS_HASH,
            difficulty=self._difficulty,
            data=GENESIS_DATA,
        )
        genesis.mine_block()
        return genesis

    def get_latest_block(self) -> Block:
        return self.chain[-1]

    def get_block(self, index: int) -> Block:
        if not 0 <= index < len(self.chain):
            raise IndexError(f"block {index} does not exist (chain height is {self.height})")
        return self.chain[index]

    @property
    def height(self) -> int:
        """Index of the latest block (genesis-only chain has height 0)."""
        return len(self.chain) - 1

    # ------------------------------------------------------------------ #
    # Transactions
    # ------------------------------------------------------------------ #
    def add_transaction(self, transaction: Transaction) -> Transaction:
        """Validate a transaction and place it in the pending pool.

        Pending transactions wait there until a miner includes them in a block.
        """
        transaction.validate()
        if transaction.sender == NETWORK_SENDER:
            raise InvalidTransactionError(
                f"'{NETWORK_SENDER}' is reserved for mining rewards and cannot send transactions"
            )

        tx_id = transaction.tx_id
        if any(tx.tx_id == tx_id for tx in self.pending_transactions):
            raise InvalidTransactionError("transaction is already pending")
        if any(tx.tx_id == tx_id for block in self.chain for tx in block.transactions):
            raise InvalidTransactionError("transaction is already in the chain")

        self.pending_transactions.append(transaction)
        return transaction

    # ------------------------------------------------------------------ #
    # Mining
    # ------------------------------------------------------------------ #
    def mine_pending_transactions(
        self,
        miner_address: str,
        progress_callback: ProgressCallback | None = None,
        should_stop: StopCondition | None = None,
    ) -> tuple[Block, MiningResult]:
        """Package pending transactions into a new block, mine it and append it.

        The miner receives a reward transaction (fictional units only) which is
        placed first in the block. Pending transactions are only removed after
        mining succeeds; if mining is cancelled they stay in the pool.

        Returns the new block and statistics about the mining run.

        This is the three steps below run back to back. Callers that need to
        hold a lock (like the API's chain service) call the steps separately,
        so the slow middle step runs without the lock.
        """
        block = self.create_candidate_block(miner_address)
        result = block.mine_block(progress_callback=progress_callback, should_stop=should_stop)
        self.commit_block(block)
        return block, result

    def create_candidate_block(self, miner_address: str) -> Block:
        """Step 1: build an (unmined) block from a snapshot of the pending pool.

        Transactions submitted after this call wait for the next block instead
        of silently changing this one while it is being mined.
        """
        transactions = list(self.pending_transactions)
        if self.mining_reward > 0:
            transactions.insert(0, Transaction.reward(miner_address, self.mining_reward))

        previous = self.get_latest_block()
        return Block(
            index=previous.index + 1,
            transactions=transactions,
            previous_hash=previous.hash,
            difficulty=self._difficulty,
        )

    def commit_block(self, block: Block) -> None:
        """Step 3: append a mined block and drop its transactions from the pool.

        Transactions are matched by object identity: the candidate block holds
        the very same objects that were in ``pending_transactions``.
        """
        self.add_block(block)
        included_ids = {id(tx) for tx in block.transactions}
        self.pending_transactions = [
            tx for tx in self.pending_transactions if id(tx) not in included_ids
        ]

    def add_block(self, block: Block) -> None:
        """Append a block after checking it against the current chain tip.

        This is what a node does when it receives a block from a peer: it never
        trusts the block, it re-checks everything itself.
        """
        issues = self.validate_block(block, self.get_latest_block(), max_reward=self.mining_reward)
        if issues:
            raise InvalidBlockError("; ".join(issue.message for issue in issues))
        self.chain.append(block)

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    @staticmethod
    def validate_block(
        block: Block, previous: Block, *, max_reward: float | None = None
    ) -> list[BlockValidationIssue]:
        """Check a single block against the block that precedes it.

        ``max_reward`` is the largest mining reward the chain allows. Without
        this rule a miner could simply award itself any amount.
        """
        issues: list[BlockValidationIssue] = []

        def issue(code: str, message: str) -> None:
            issues.append(BlockValidationIssue(block.index, code, message))

        if block.index != previous.index + 1:
            issue(
                "bad_index",
                f"block index {block.index} should be {previous.index + 1}",
            )
        if block.previous_hash != previous.hash:
            issue(
                "broken_link",
                f"block {block.index} points to previous hash {block.previous_hash[:12]}... "
                f"but block {previous.index} has hash {previous.hash[:12]}...",
            )
        if not block.hash_matches_contents():
            issue(
                "hash_mismatch",
                f"block {block.index}'s stored hash does not match its contents "
                "(the data was changed after mining)",
            )
        if not block.meets_target():
            issue(
                "insufficient_work",
                f"block {block.index}'s hash does not start with {block.difficulty} zero(s)",
            )
        if block.timestamp < previous.timestamp:
            issue(
                "bad_timestamp",
                f"block {block.index} is timestamped before block {previous.index}",
            )

        issues.extend(Blockchain._validate_block_transactions(block, max_reward))
        return issues

    @staticmethod
    def _validate_block_transactions(
        block: Block, max_reward: float | None
    ) -> Iterable[BlockValidationIssue]:
        rewards = [tx for tx in block.transactions if tx.is_reward]
        if len(rewards) > 1:
            yield BlockValidationIssue(
                block.index, "multiple_rewards", f"block {block.index} has more than one reward"
            )
        if max_reward is not None:
            for reward in rewards:
                if reward.amount > max_reward:
                    yield BlockValidationIssue(
                        block.index,
                        "bad_reward",
                        f"block {block.index} pays a reward of {reward.amount:g}, "
                        f"but the maximum is {max_reward:g}",
                    )
        if rewards and not block.transactions[0].is_reward:
            yield BlockValidationIssue(
                block.index,
                "misplaced_reward",
                f"block {block.index}'s reward must be its first transaction",
            )
        for tx in block.transactions:
            try:
                tx.validate()
            except InvalidTransactionError as exc:
                yield BlockValidationIssue(
                    block.index, "invalid_transaction", f"block {block.index}: {exc}"
                )

    @staticmethod
    def validate_genesis(genesis: Block) -> list[BlockValidationIssue]:
        issues: list[BlockValidationIssue] = []
        if genesis.index != 0:
            issues.append(BlockValidationIssue(genesis.index, "bad_index", "genesis index must be 0"))
        if genesis.previous_hash != GENESIS_PREVIOUS_HASH:
            issues.append(
                BlockValidationIssue(0, "broken_link", "genesis previous_hash must be all zeros")
            )
        if not genesis.hash_matches_contents():
            issues.append(
                BlockValidationIssue(0, "hash_mismatch", "genesis hash does not match its contents")
            )
        if not genesis.meets_target():
            issues.append(
                BlockValidationIssue(0, "insufficient_work", "genesis hash does not meet its target")
            )
        return issues

    def validate_chain(self) -> ChainValidationResult:
        """Re-check every block and every link, collecting all problems found."""
        result = ChainValidationResult(chain_length=len(self.chain))
        if not self.chain:
            result.issues.append(BlockValidationIssue(0, "empty_chain", "chain has no blocks"))
            return result

        result.issues.extend(self.validate_genesis(self.chain[0]))
        for previous, block in zip(self.chain, self.chain[1:]):
            result.issues.extend(self.validate_block(block, previous, max_reward=self.mining_reward))
        return result

    def is_chain_valid(self) -> bool:
        return self.validate_chain().is_valid

    def total_work(self) -> int:
        """Expected number of hashes needed to produce this whole chain.

        Each block at difficulty d takes ~16^d attempts on average. Comparing
        total work (not just length) means a long chain of cheap, low-difficulty
        blocks can't beat a shorter chain that took more effort to build.
        """
        return sum(16**block.difficulty for block in self.chain)

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #
    def get_balance(self, account: str) -> float:
        """Sum of fictional units received minus sent, from confirmed blocks only.

        This project does not enforce balances (anyone may "send" any amount);
        the balance is shown purely for illustration.
        """
        balance = 0.0
        for block in self.chain:
            for tx in block.transactions:
                if tx.receiver == account:
                    balance += tx.amount
                if tx.sender == account:
                    balance -= tx.amount
        return balance

    # ------------------------------------------------------------------ #
    # Serialization
    # ------------------------------------------------------------------ #
    def to_dict(self) -> dict[str, Any]:
        return {
            "difficulty": self._difficulty,
            "mining_reward": self.mining_reward,
            "height": self.height,
            "chain": [block.to_dict() for block in self.chain],
            "pending_transactions": [tx.to_dict() for tx in self.pending_transactions],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Blockchain:
        """Rebuild a chain *without* validating it, so broken chains can be inspected.

        Call :meth:`validate_chain` afterwards to decide whether to trust it.
        """
        chain = cls.__new__(cls)
        chain._difficulty = data["difficulty"]
        validate_difficulty(chain._difficulty)
        chain.mining_reward = data.get("mining_reward", DEFAULT_MINING_REWARD)
        chain.chain = [Block.from_dict(block) for block in data["chain"]]
        chain.pending_transactions = [
            Transaction.from_dict(tx) for tx in data.get("pending_transactions", [])
        ]
        return chain
