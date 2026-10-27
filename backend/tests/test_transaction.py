import math

import pytest

from app.core import Blockchain, InvalidTransactionError, Transaction
from app.core.transaction import NETWORK_SENDER


def test_valid_transaction_fields() -> None:
    tx = Transaction("alice", "bob", 12.5, timestamp=100.0)
    assert (tx.sender, tx.receiver, tx.amount, tx.timestamp) == ("alice", "bob", 12.5, 100.0)
    assert len(tx.tx_id) == 64


@pytest.mark.parametrize(
    ("sender", "receiver", "amount"),
    [
        ("", "bob", 1),
        ("alice", "   ", 1),
        ("alice", "alice", 1),
        ("alice", "bob", 0),
        ("alice", "bob", -5),
        ("alice", "bob", math.nan),
        ("alice", "bob", True),
        ("alice", "bob", "10"),
        ("a" * 65, "bob", 1),
        ("alice", "bob", 10**10),
    ],
)
def test_invalid_transactions_are_rejected(sender, receiver, amount) -> None:
    with pytest.raises(InvalidTransactionError):
        Transaction(sender, receiver, amount)


def test_tx_id_is_deterministic_and_changes_with_content() -> None:
    a = Transaction("alice", "bob", 5, timestamp=1.0)
    b = Transaction("alice", "bob", 5, timestamp=1.0)
    assert a.tx_id == b.tx_id

    b.amount = 6
    assert a.tx_id != b.tx_id


def test_int_and_float_amounts_hash_identically() -> None:
    # JSON writes 10 as "10" but 10.0 as "10.0"; without normalization the
    # same transaction would get two different hashes on different nodes.
    as_int = Transaction("alice", "bob", 10, timestamp=1.0)
    as_float = Transaction("alice", "bob", 10.0, timestamp=1.0)
    assert as_int.tx_id == as_float.tx_id
    assert isinstance(as_int.amount, float)


def test_round_trip_serialization() -> None:
    tx = Transaction("alice", "bob", 3, timestamp=42.0)
    data = tx.to_dict()
    assert data["tx_id"] == tx.tx_id
    assert Transaction.from_dict(data) == tx


def test_from_dict_missing_field() -> None:
    with pytest.raises(InvalidTransactionError, match="amount"):
        Transaction.from_dict({"sender": "a", "receiver": "b", "timestamp": 1.0})


def test_reward_transaction() -> None:
    tx = Transaction.reward("miner", 10)
    assert tx.sender == NETWORK_SENDER
    assert tx.is_reward


def test_add_transaction_goes_to_pending(chain: Blockchain) -> None:
    tx = chain.add_transaction(Transaction("alice", "bob", 5))
    assert chain.pending_transactions == [tx]


def test_duplicate_pending_transaction_rejected(chain: Blockchain) -> None:
    tx = Transaction("alice", "bob", 5, timestamp=1.0)
    chain.add_transaction(tx)
    with pytest.raises(InvalidTransactionError, match="already pending"):
        chain.add_transaction(Transaction("alice", "bob", 5, timestamp=1.0))


def test_duplicate_confirmed_transaction_rejected(chain: Blockchain) -> None:
    chain.add_transaction(Transaction("alice", "bob", 5, timestamp=1.0))
    chain.mine_pending_transactions("miner")
    with pytest.raises(InvalidTransactionError, match="already in the chain"):
        chain.add_transaction(Transaction("alice", "bob", 5, timestamp=1.0))


def test_users_cannot_impersonate_network(chain: Blockchain) -> None:
    with pytest.raises(InvalidTransactionError, match="reserved"):
        chain.add_transaction(Transaction(NETWORK_SENDER, "eve", 1000))
