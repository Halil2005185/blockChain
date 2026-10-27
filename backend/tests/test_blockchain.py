import pytest

from app.core import Block, Blockchain, InvalidBlockError, MiningCancelled, Transaction
from app.core.block import MAX_DIFFICULTY


def codes(chain: Blockchain) -> set[str]:
    return {issue.code for issue in chain.validate_chain().issues}


# ---------------------------------------------------------------------- mining
def test_mining_appends_block_and_clears_pending(chain: Blockchain) -> None:
    tx = chain.add_transaction(Transaction("alice", "bob", 5))
    block, result = chain.mine_pending_transactions("miner")

    assert chain.height == 1
    assert chain.get_latest_block() is block
    assert chain.pending_transactions == []
    assert block.index == 1
    assert block.previous_hash == chain.chain[0].hash
    assert block.hash.startswith("00")
    assert result.hash == block.hash
    assert tx in block.transactions


def test_reward_is_first_transaction(chain: Blockchain) -> None:
    chain.add_transaction(Transaction("alice", "bob", 5))
    block, _ = chain.mine_pending_transactions("miner")
    reward = block.transactions[0]
    assert reward.is_reward
    assert reward.receiver == "miner"
    assert reward.amount == chain.mining_reward


def test_mining_with_no_pending_transactions_still_produces_a_block(chain: Blockchain) -> None:
    block, _ = chain.mine_pending_transactions("miner")
    assert len(block.transactions) == 1  # just the reward


def test_zero_reward_produces_no_reward_transaction() -> None:
    chain = Blockchain(difficulty=1, mining_reward=0)
    block, _ = chain.mine_pending_transactions("miner")
    assert block.transactions == []


def test_cancelled_mining_keeps_pending_and_chain(chain: Blockchain) -> None:
    chain.difficulty = MAX_DIFFICULTY
    chain.add_transaction(Transaction("alice", "bob", 5))
    with pytest.raises(MiningCancelled):
        chain.mine_pending_transactions("miner", should_stop=lambda: True)
    assert chain.height == 0
    assert len(chain.pending_transactions) == 1


def test_transactions_added_during_mining_wait_for_next_block(chain: Blockchain) -> None:
    chain.difficulty = 3
    chain.add_transaction(Transaction("alice", "bob", 1))
    late: list[Transaction] = []

    def on_progress(_progress) -> None:
        if not late:
            late.append(chain.add_transaction(Transaction("carol", "dave", 2)))

    block, _ = chain.mine_pending_transactions("miner", progress_callback=on_progress)
    assert late and late[0] not in block.transactions
    assert chain.pending_transactions == late


def test_difficulty_change_applies_to_next_block_only(chain: Blockchain) -> None:
    chain.mine_pending_transactions("miner")
    chain.difficulty = 3
    block, _ = chain.mine_pending_transactions("miner")
    assert chain.chain[1].difficulty == 2
    assert block.difficulty == 3
    assert block.hash.startswith("000")
    assert chain.is_chain_valid()


@pytest.mark.parametrize("value", [0, MAX_DIFFICULTY + 1, 2.5])
def test_invalid_difficulty_rejected(chain: Blockchain, value) -> None:
    with pytest.raises(InvalidBlockError):
        chain.difficulty = value


def test_balances(mined_chain: Blockchain) -> None:
    assert mined_chain.get_balance("miner") == 30
    assert mined_chain.get_balance("alice") == -(5 + 6 + 7)
    assert mined_chain.get_balance("bob") == (5 + 6 + 7) - (1 + 2 + 3)
    assert mined_chain.get_balance("carol") == 6


def test_get_block(mined_chain: Blockchain) -> None:
    assert mined_chain.get_block(2) is mined_chain.chain[2]
    with pytest.raises(IndexError):
        mined_chain.get_block(99)


# ------------------------------------------------------------------ validation
def test_fresh_and_mined_chains_are_valid(chain: Blockchain, mined_chain: Blockchain) -> None:
    assert Blockchain(difficulty=1).is_chain_valid()
    assert mined_chain.is_chain_valid()
    assert mined_chain.validate_chain().untrusted_indices == []


def test_tampering_with_transaction_is_detected(mined_chain: Blockchain) -> None:
    mined_chain.chain[2].transactions[1].amount = 1_000_000
    result = mined_chain.validate_chain()

    assert not result.is_valid
    assert result.first_invalid_index == 2
    assert "hash_mismatch" in codes(mined_chain)
    # Blocks 2 and 3 can no longer be trusted, even though block 3 itself is untouched.
    assert result.untrusted_indices == [2, 3]


def test_remining_tampered_block_breaks_the_next_link(mined_chain: Blockchain) -> None:
    """Re-mining hides the tampering in block 2, but block 3 still points to the old hash.

    To get away with it, an attacker would have to re-mine every later block
    too, faster than the rest of the network keeps extending the honest chain.
    """
    tampered = mined_chain.chain[2]
    tampered.transactions[1].amount = 1_000_000
    tampered.mine_block()

    result = mined_chain.validate_chain()
    assert tampered.validate_hash()  # block 2 looks fine on its own...
    assert result.invalid_indices == [3]  # ...but block 3's link is broken
    assert {i.code for i in result.issues} == {"broken_link"}


def test_remining_every_later_block_produces_a_valid_but_different_chain(
    mined_chain: Blockchain,
) -> None:
    """Hashes alone don't make history immutable.

    A lone attacker *can* rebuild a self-consistent chain. What protects real
    blockchains is that other nodes hold the original copy and the honest
    network keeps adding work - the subject of the network phase.
    """
    original_tip = mined_chain.get_latest_block().hash
    mined_chain.chain[1].transactions[1].amount = 1_000_000
    for previous, block in zip(mined_chain.chain, mined_chain.chain[1:]):
        block.previous_hash = previous.hash
        block.mine_block()

    assert mined_chain.is_chain_valid()
    assert mined_chain.get_latest_block().hash != original_tip


def test_insufficient_work_is_detected(chain: Blockchain) -> None:
    previous = chain.get_latest_block()
    # Find a nonce whose hash matches contents but does NOT meet the target.
    block = Block(1, [], previous.hash, difficulty=2, timestamp=previous.timestamp + 1)
    while block.hash.startswith("00"):
        block.nonce += 1
        block.hash = block.calculate_hash()
    chain.chain.append(block)
    assert codes(chain) == {"insufficient_work"}


def test_wrong_index_and_timestamp_detected(mined_chain: Blockchain) -> None:
    block = mined_chain.chain[2]
    block.index = 7
    block.timestamp = 0
    block.mine_block()
    assert {"bad_index", "bad_timestamp"} <= codes(mined_chain)


def test_invalid_reward_layout_detected(mined_chain: Blockchain) -> None:
    block = mined_chain.chain[1]
    block.transactions.reverse()
    block.mine_block()
    assert "misplaced_reward" in codes(mined_chain)

    block.transactions.append(Transaction.reward("miner2", 10, timestamp=1.0))
    block.mine_block()
    assert "multiple_rewards" in codes(mined_chain)


def test_invalid_transaction_inside_block_detected(mined_chain: Blockchain) -> None:
    block = mined_chain.chain[1]
    block.transactions[1].amount = -5  # bypasses __post_init__ by mutating
    block.mine_block()
    assert "invalid_transaction" in codes(mined_chain)


# ----------------------------------------------------------- receiving blocks
def build_next_block(source: Blockchain) -> Block:
    """Mine a block on a copy, as if a peer produced it."""
    peer = Blockchain.from_dict(source.to_dict())
    peer.add_transaction(Transaction("alice", "bob", 1))
    block, _ = peer.mine_pending_transactions("peer-miner")
    return block


def test_add_valid_block_from_peer(mined_chain: Blockchain) -> None:
    block = build_next_block(mined_chain)
    mined_chain.add_block(block)
    assert mined_chain.get_latest_block() is block
    assert mined_chain.is_chain_valid()


def test_add_block_rejects_tampered_block(mined_chain: Blockchain) -> None:
    block = build_next_block(mined_chain)
    block.transactions[1].amount = 999
    with pytest.raises(InvalidBlockError, match="does not match its contents"):
        mined_chain.add_block(block)
    assert mined_chain.height == 3


def test_add_block_rejects_wrong_parent(mined_chain: Blockchain) -> None:
    block = build_next_block(mined_chain)
    mined_chain.mine_pending_transactions("local-miner")  # tip moved on
    with pytest.raises(InvalidBlockError):
        mined_chain.add_block(block)


# --------------------------------------------------------------- serialization
def test_chain_round_trip(mined_chain: Blockchain) -> None:
    mined_chain.add_transaction(Transaction("x", "y", 1))
    data = mined_chain.to_dict()
    restored = Blockchain.from_dict(data)

    assert restored.to_dict() == data
    assert restored.is_chain_valid()
    assert data["height"] == 3
    assert data["chain"][0]["is_genesis"] is True


# ------------------------------------------------------------- reward & work
def test_inflated_reward_is_rejected(chain: Blockchain) -> None:
    """A miner can't simply pay itself more than the chain allows."""
    previous = chain.get_latest_block()
    greedy = Block(
        previous.index + 1,
        [Transaction.reward("greedy-miner", chain.mining_reward * 1000)],
        previous.hash,
        difficulty=chain.difficulty,
        timestamp=previous.timestamp + 1,
    )
    greedy.mine_block()
    with pytest.raises(InvalidBlockError, match="maximum is 10"):
        chain.add_block(greedy)

    chain.chain.append(greedy)  # force it in: validation still flags it
    assert "bad_reward" in codes(chain)


def test_reward_up_to_the_maximum_is_fine(chain: Blockchain) -> None:
    block, _ = chain.mine_pending_transactions("miner")
    assert block.transactions[0].amount == chain.mining_reward
    assert chain.is_chain_valid()


def test_total_work_counts_difficulty_not_just_length() -> None:
    cheap = Blockchain(difficulty=1)
    for _ in range(3):
        cheap.mine_pending_transactions("m")
    costly = Blockchain(difficulty=2)
    costly.mine_pending_transactions("m")

    assert cheap.total_work() == 4 * 16  # genesis + 3 blocks at difficulty 1
    assert costly.total_work() == 2 * 256  # genesis + 1 block at difficulty 2
    assert len(cheap.chain) > len(costly.chain)
    assert costly.total_work() > cheap.total_work()
