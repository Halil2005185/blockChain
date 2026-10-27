"""A simulated node: its own Blockchain plus the rules for what it accepts.

Every decision reuses the core's validation (``Blockchain.validate_block`` and
``Blockchain.validate_chain``). The only extra rule is a network policy: blocks
must be mined at least at the network's difficulty.

Nodes never share objects. Whatever arrives here (a block or a whole chain) is
already a private copy made by the network layer.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Literal

from app.core import Block, Blockchain, BlockValidationIssue, InvalidTransactionError, Transaction

Outcome = Literal["accepted", "rejected", "duplicate", "orphan", "stale"]

# Issues that depend on *which* block came before. Everything else (hash,
# proof of work, transactions, reward) can be judged from the block alone.
LINK_CODES = {"bad_index", "broken_link", "bad_timestamp"}

HISTORY_SIZE = 40


@dataclass(frozen=True)
class BlockDecision:
    """What a node did with a block it received."""

    outcome: Outcome
    reasons: list[BlockValidationIssue]
    height: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "outcome": self.outcome,
            "reasons": [r.to_dict() for r in self.reasons],
            "height": self.height,
        }


@dataclass(frozen=True)
class SyncResult:
    """What a node did with a whole chain offered by a peer."""

    adopted: bool
    reason: Literal["more_work", "not_more_work", "invalid_chain", "different_genesis", "low_difficulty"]
    old_height: int
    new_height: int
    reorg_depth: int = 0
    returned_transactions: int = 0
    issues: list[BlockValidationIssue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "adopted": self.adopted,
            "reason": self.reason,
            "old_height": self.old_height,
            "new_height": self.new_height,
            "reorg_depth": self.reorg_depth,
            "returned_transactions": self.returned_transactions,
            "issues": [i.to_dict() for i in self.issues],
        }


class Node:
    def __init__(
        self,
        node_id: str,
        name: str,
        *,
        difficulty: int,
        mining_reward: float,
        chain: Blockchain | None = None,
    ) -> None:
        self.id = node_id
        self.name = name
        self.required_difficulty = difficulty
        # Same difficulty => the hard-coded genesis block is identical on every
        # node. Pass a private copy in `chain` to avoid re-mining it.
        self.chain = chain or Blockchain(difficulty=difficulty, mining_reward=mining_reward)
        self.online = True
        self.group = "main"
        self.mining = False
        self.history: deque[dict[str, Any]] = deque(maxlen=HISTORY_SIZE)

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #
    @property
    def height(self) -> int:
        return self.chain.height

    @property
    def tip_hash(self) -> str:
        return self.chain.get_latest_block().hash

    def has_block(self, block_hash: str) -> bool:
        return any(b.hash == block_hash for b in self.chain.chain)

    def record(self, kind: str, /, **details: Any) -> dict[str, Any]:
        """Add a history entry. `kind` is positional-only so details can't clash with it."""
        entry = {**details, "at": time.time(), "kind": kind}
        self.history.appendleft(entry)
        return entry

    # ------------------------------------------------------------------ #
    # Network policy (on top of the core rules)
    # ------------------------------------------------------------------ #
    def _policy_issues(self, block: Block) -> list[BlockValidationIssue]:
        if block.index > 0 and block.difficulty < self.required_difficulty:
            return [
                BlockValidationIssue(
                    block.index,
                    "difficulty_too_low",
                    f"block {block.index} was mined at difficulty {block.difficulty}, "
                    f"but this network requires {self.required_difficulty}",
                )
            ]
        return []

    # ------------------------------------------------------------------ #
    # Receiving one block
    # ------------------------------------------------------------------ #
    def receive_block(self, block: Block) -> BlockDecision:
        """Validate a block from a peer and append it if it extends our chain.

        * duplicate - we already have it
        * rejected  - it breaks a rule (bad hash, no proof of work, ...)
        * accepted  - valid and builds on our tip: appended
        * stale     - valid, but we already have a block at that height
                      (a competing fork; resolved later by total work)
        * orphan    - valid, but its parent is unknown to us (we're behind or
                      it's another fork): the network asks the sender for its chain
        """
        if self.has_block(block.hash):
            return BlockDecision("duplicate", [], self.height)

        tip = self.chain.get_latest_block()
        issues = Blockchain.validate_block(block, tip, max_reward=self.chain.mining_reward)
        own_issues = [i for i in issues if i.code not in LINK_CODES] + self._policy_issues(block)
        if own_issues:
            return BlockDecision("rejected", own_issues, self.height)

        if block.index == tip.index + 1 and block.previous_hash == tip.hash:
            if issues:  # e.g. a timestamp earlier than our tip
                return BlockDecision("rejected", issues, self.height)
            self.chain.add_block(block)  # core re-validates once more
            included = {tx.tx_id for tx in block.transactions}
            self.chain.pending_transactions = [
                tx for tx in self.chain.pending_transactions if tx.tx_id not in included
            ]
            return BlockDecision("accepted", [], self.height)

        if block.index <= tip.index:
            reason = BlockValidationIssue(
                block.index,
                "stale_block",
                f"already have a block at height {block.index}; keeping the one seen first",
            )
            return BlockDecision("stale", [reason], self.height)

        reason = BlockValidationIssue(
            block.index,
            "unknown_parent",
            f"block {block.index}'s previous block is unknown here (our height is {tip.index}); "
            "asking the sender for its chain",
        )
        return BlockDecision("orphan", [reason], self.height)

    # ------------------------------------------------------------------ #
    # Considering a whole chain (fork choice)
    # ------------------------------------------------------------------ #
    def consider_chain(self, candidate: Blockchain) -> SyncResult:
        """Replace our chain with ``candidate`` only if it is valid and has more work.

        ``candidate`` must be a private copy; it is adopted as-is.
        """
        old_height = self.height

        def kept(reason, issues=()) -> SyncResult:
            return SyncResult(False, reason, old_height, old_height, issues=list(issues))

        if not candidate.chain or candidate.chain[0].hash != self.chain.chain[0].hash:
            return kept("different_genesis")

        # Judge the candidate by OUR rules, not by settings it carries along.
        candidate.mining_reward = self.chain.mining_reward
        report = candidate.validate_chain()
        if not report.is_valid:
            return kept("invalid_chain", report.issues)

        policy = [issue for block in candidate.chain for issue in self._policy_issues(block)]
        if policy:
            return kept("low_difficulty", policy)

        if candidate.total_work() <= self.chain.total_work():
            return kept("not_more_work")  # ties: keep the chain we saw first

        # Adopt. Find where the chains diverge.
        mine, theirs = self.chain.chain, candidate.chain
        fork = next(
            (i for i, (a, b) in enumerate(zip(mine, theirs)) if a.hash != b.hash),
            min(len(mine), len(theirs)),
        )
        discarded = mine[fork:]
        in_new_chain = {tx.tx_id for block in theirs for tx in block.transactions}

        # Transactions from discarded blocks aren't lost: back to the pending pool.
        returned = [
            tx for block in discarded for tx in block.transactions
            if not tx.is_reward and tx.tx_id not in in_new_chain
        ]
        pending: list[Transaction] = []
        seen: set[str] = set()
        for tx in [*returned, *self.chain.pending_transactions]:
            if tx.tx_id not in in_new_chain and tx.tx_id not in seen:
                seen.add(tx.tx_id)
                pending.append(tx)

        self.chain.chain = theirs
        self.chain.pending_transactions = pending
        return SyncResult(True, "more_work", old_height, self.height, len(discarded), len(returned))

    # ------------------------------------------------------------------ #
    # Transactions
    # ------------------------------------------------------------------ #
    def receive_transaction(self, tx: Transaction) -> bool:
        """Add a gossiped transaction; False if we already have it."""
        try:
            self.chain.add_transaction(tx)
            return True
        except InvalidTransactionError:
            return False
