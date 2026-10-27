"""Shared pytest fixtures.

Tests use low difficulty (1-2) so mining finishes in milliseconds.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core import Blockchain, Transaction
from app.main import create_app
from app.services import ChainService

TEST_SETTINGS = Settings(difficulty=2, mining_reward=10, cors_origins=[])


@pytest.fixture
def client() -> Iterator[TestClient]:
    """An HTTP client talking to a fresh app (fresh chain) for every test."""
    with TestClient(create_app(TEST_SETTINGS)) as test_client:
        yield test_client


@pytest.fixture
def service(client: TestClient) -> ChainService:
    """The ChainService behind ``client`` - for assertions that skip HTTP."""
    return client.app.state.chain_service


@pytest.fixture
def mined_client(client: TestClient) -> TestClient:
    """A client whose chain holds genesis + 2 mined blocks (2 txs + reward each)."""
    for i in range(2):
        client.post("/api/transactions", json={"sender": "alice", "receiver": "bob", "amount": 5 + i})
        client.post("/api/transactions", json={"sender": "bob", "receiver": "carol", "amount": 1})
        assert client.post("/api/mining/mine", json={"miner_address": "miner"}).status_code == 200
    return client


@pytest.fixture
def chain() -> Blockchain:
    return Blockchain(difficulty=2, mining_reward=10)


@pytest.fixture
def mined_chain(chain: Blockchain) -> Blockchain:
    """A chain with genesis + 3 mined blocks."""
    for i in range(3):
        chain.add_transaction(Transaction("alice", "bob", 5 + i))
        chain.add_transaction(Transaction("bob", "carol", 1 + i))
        chain.mine_pending_transactions("miner")
    return chain
