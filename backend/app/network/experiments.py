"""Invalid-block experiments: craft a bad block that peers should refuse.

The block is built on a *copy* of the sender's data and is never added to the
sender's own chain. Each kind breaks exactly one rule.
"""

from __future__ import annotations

from typing import Literal

from app.core import Block, Blockchain, Transaction, sha256_hex

InvalidKind = Literal["tampered", "no_work", "inflated_reward", "unknown_parent"]

# What a careful peer will say, shown in the UI before sending.
EXPECTED_REJECTION: dict[str, str] = {
    "tampered": "hash_mismatch: the data was edited after mining, so the hash no longer matches",
    "no_work": "insufficient_work: the hash doesn't start with the required zeros",
    "inflated_reward": "bad_reward: the miner paid itself more than the allowed reward",
    "unknown_parent": "unknown_parent: it builds on a block nobody has; the sender can't prove its history",
}


def craft_invalid_block(chain: Blockchain, kind: InvalidKind, miner: str) -> Block:
    tip = chain.get_latest_block()
    reward = chain.mining_reward * (1000 if kind == "inflated_reward" else 1)
    # Copies of pending transactions, so the sender's own pool is untouched.
    transactions = [Transaction.reward(miner, reward)] + [
        Transaction.from_dict(tx.to_dict()) for tx in chain.pending_transactions
    ]
    previous_hash = sha256_hex(f"a block that does not exist {tip.hash}") if kind == "unknown_parent" else tip.hash
    block = Block(
        index=tip.index + 1,
        transactions=transactions,
        previous_hash=previous_hash,
        difficulty=chain.difficulty,
        data=f"invalid-block experiment: {kind}",
    )

    if kind == "no_work":
        # Make sure the (unmined) hash doesn't meet the target by sheer luck.
        while block.meets_target():
            block.nonce += 1
            block.hash = block.calculate_hash()
        return block

    block.mine_block()
    if kind == "tampered":
        block.data = "tampered after mining"  # stored hash no longer matches
    return block
