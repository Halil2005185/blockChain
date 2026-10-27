import pytest

from app.core import Block, InvalidBlockError, MiningCancelled, MiningProgress, Transaction
from app.core.block import MAX_DIFFICULTY

PREV = "a" * 64


def make_block(difficulty: int = 2, **overrides) -> Block:
    fields = dict(
        index=1,
        transactions=[Transaction("alice", "bob", 5, timestamp=10.0)],
        previous_hash=PREV,
        difficulty=difficulty,
        timestamp=20.0,
    )
    fields.update(overrides)
    return Block(**fields)


# --------------------------------------------------------------------- hashing
def test_hash_is_deterministic() -> None:
    assert make_block().calculate_hash() == make_block().calculate_hash()


def test_new_block_hash_is_calculated_automatically() -> None:
    block = make_block()
    assert block.hash == block.calculate_hash()


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: setattr(b, "nonce", b.nonce + 1),
        lambda b: setattr(b, "timestamp", 21.0),
        lambda b: setattr(b, "previous_hash", "b" * 64),
        lambda b: setattr(b, "data", "changed"),
        lambda b: setattr(b.transactions[0], "amount", 500),
        lambda b: b.transactions.append(Transaction("x", "y", 1, timestamp=1.0)),
    ],
)
def test_any_change_changes_the_hash(mutate) -> None:
    block = make_block()
    before = block.calculate_hash()
    mutate(block)
    assert block.calculate_hash() != before


def test_merkle_root_tracks_transactions() -> None:
    block = make_block()
    root = block.merkle_root
    block.transactions[0].amount = 99
    assert block.merkle_root != root


# ---------------------------------------------------------------------- mining
@pytest.mark.parametrize("difficulty", [1, 2, 3])
def test_mining_meets_difficulty(difficulty: int) -> None:
    block = make_block(difficulty)
    result = block.mine_block()

    assert block.hash.startswith("0" * difficulty)
    assert block.hash == block.calculate_hash()
    assert block.validate_hash()
    assert result.nonce == block.nonce
    assert result.hash == block.hash
    assert result.attempts == block.nonce + 1  # nonces 0..n were tried
    assert result.duration_seconds >= 0


def test_mining_is_reproducible() -> None:
    a, b = make_block(), make_block()
    assert a.mine_block().nonce == b.mine_block().nonce
    assert a.hash == b.hash


def test_progress_callback_reports_progress() -> None:
    updates: list[MiningProgress] = []
    block = make_block(3)
    block.mine_block(progress_callback=updates.append, progress_interval=50)

    assert updates, "expected at least the final progress update"
    assert updates[-1].current_hash == block.hash
    attempts = [u.attempts for u in updates]
    assert attempts == sorted(attempts)
    assert updates[-1].expected_attempts == 16**3


def test_mining_can_be_cancelled() -> None:
    block = make_block(MAX_DIFFICULTY)
    original_hash = block.hash
    with pytest.raises(MiningCancelled):
        block.mine_block(progress_interval=10, should_stop=lambda: True)
    assert block.hash == original_hash  # untouched on cancel


def test_invalid_progress_interval() -> None:
    with pytest.raises(ValueError):
        make_block().mine_block(progress_interval=0)


# ------------------------------------------------------------------ validation
def test_unmined_block_fails_target() -> None:
    block = make_block(MAX_DIFFICULTY)
    # Practically never true for an unmined block at difficulty 6.
    assert block.hash_matches_contents()
    assert not block.validate_hash()


def test_tampering_breaks_validate_hash() -> None:
    block = make_block()
    block.mine_block()
    block.transactions[0].amount = 1_000
    assert not block.hash_matches_contents()
    assert not block.validate_hash()


@pytest.mark.parametrize(
    "overrides",
    [{"difficulty": 0}, {"difficulty": MAX_DIFFICULTY + 1}, {"index": -1}, {"previous_hash": "abc"}],
)
def test_invalid_construction(overrides) -> None:
    with pytest.raises(InvalidBlockError):
        make_block(**overrides)


def test_block_round_trip_preserves_stored_hash() -> None:
    block = make_block()
    block.mine_block()
    data = block.to_dict()
    assert data["hash_valid"] is True

    data["transactions"][0]["amount"] = 999  # tamper with the serialized copy
    restored = Block.from_dict(data)
    assert restored.hash == block.hash
    assert not restored.validate_hash()
