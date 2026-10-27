import time

import pytest
from fastapi.testclient import TestClient

from app.core.block import MAX_DIFFICULTY
from app.services import ChainService


def wait_until(predicate, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        time.sleep(0.01)


@pytest.fixture
def slow_job(client: TestClient):
    """Start a job that practically never finishes (difficulty 6), cancel it afterwards."""
    client.put("/api/chain/difficulty", json={"difficulty": MAX_DIFFICULTY})
    client.post("/api/transactions", json={"sender": "alice", "receiver": "bob", "amount": 3})
    response = client.post("/api/mining/start", json={"miner_address": "miner"})
    assert response.status_code == 202
    yield response.json()
    if client.get("/api/mining/status").json()["status"] == "running":
        client.post("/api/mining/cancel")


# ------------------------------------------------------------ mine and wait
def test_mine_block(client: TestClient) -> None:
    client.post("/api/transactions", json={"sender": "alice", "receiver": "bob", "amount": 25})
    response = client.post("/api/mining/mine", json={"miner_address": "miner-1"})
    assert response.status_code == 200

    job = response.json()
    assert job["status"] == "completed"
    assert job["target_prefix"] == "00"
    assert job["expected_attempts"] == 256
    block = job["block"]
    assert block["index"] == 1
    assert block["hash"].startswith("00")
    assert block["hash_valid"] is True
    assert job["result"]["hash"] == block["hash"]
    assert job["result"]["attempts"] == block["nonce"] + 1

    # The reward comes first, then the user transaction.
    reward, tx = block["transactions"]
    assert (reward["sender"], reward["receiver"], reward["amount"]) == ("NETWORK", "miner-1", 10)
    assert (tx["sender"], tx["amount"]) == ("alice", 25)

    chain = client.get("/api/chain").json()
    assert chain["height"] == 1
    assert chain["pending_transactions"] == []
    assert chain["chain"][1]["previous_hash"] == chain["chain"][0]["hash"]


def test_mine_uses_current_difficulty(client: TestClient) -> None:
    assert client.put("/api/chain/difficulty", json={"difficulty": 3}).json() == {"difficulty": 3}
    block = client.post("/api/mining/mine", json={"miner_address": "m"}).json()["block"]
    assert block["difficulty"] == 3
    assert block["hash"].startswith("000")


@pytest.mark.parametrize("value", [0, MAX_DIFFICULTY + 1, "hard"])
def test_invalid_difficulty_rejected(client: TestClient, value) -> None:
    response = client.put("/api/chain/difficulty", json={"difficulty": value})
    assert response.status_code == 422


def test_invalid_miner_address(client: TestClient) -> None:
    assert client.post("/api/mining/mine", json={"miner_address": ""}).status_code == 422
    # Passes the schema, but the core rejects NETWORK -> NETWORK as a reward.
    response = client.post("/api/mining/mine", json={"miner_address": "NETWORK"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_transaction"


# ------------------------------------------------------- background jobs
def test_status_is_null_before_any_mining(client: TestClient) -> None:
    assert client.get("/api/mining/status").json() is None


def test_background_job_reports_progress_and_completes(
    client: TestClient, service: ChainService
) -> None:
    client.put("/api/chain/difficulty", json={"difficulty": 3})
    job = client.post("/api/mining/start", json={"miner_address": "m"}).json()
    assert job["block_index"] == 1

    service.get_current_job().future.result(timeout=10)
    status = client.get("/api/mining/status").json()
    assert status["id"] == job["id"]
    assert status["status"] == "completed"
    assert status["progress"]["current_hash"] == status["block"]["hash"]
    assert status["finished_at"] >= status["started_at"]


def test_only_one_job_at_a_time(client: TestClient, slow_job) -> None:
    response = client.post("/api/mining/start", json={"miner_address": "other"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    assert client.post("/api/mining/mine", json={"miner_address": "other"}).status_code == 409


def test_server_stays_responsive_while_mining(client: TestClient, slow_job) -> None:
    wait_until(lambda: client.get("/api/mining/status").json()["progress"] is not None)

    started = time.perf_counter()
    assert client.get("/api/chain").status_code == 200
    response = client.post(
        "/api/transactions", json={"sender": "carol", "receiver": "dave", "amount": 1}
    )
    assert response.status_code == 201
    assert time.perf_counter() - started < 1.0

    status = client.get("/api/mining/status").json()
    assert status["status"] == "running"
    assert status["progress"]["attempts"] > 0
    # The late transaction waits for the next block, not the one being mined.
    assert status["transaction_count"] == 2  # reward + alice's tx


def test_cancel_keeps_pending_transactions(client: TestClient, slow_job) -> None:
    response = client.post("/api/mining/cancel")
    assert response.status_code == 200
    job = response.json()
    assert job["status"] == "cancelled"
    assert job["block"] is None

    chain = client.get("/api/chain").json()
    assert chain["height"] == 0
    assert len(chain["pending_transactions"]) == 1

    # A new job can start once the old one is cancelled.
    client.put("/api/chain/difficulty", json={"difficulty": 2})
    assert client.post("/api/mining/mine", json={"miner_address": "m"}).json()["status"] == (
        "completed"
    )


def test_cancel_without_job_returns_409(client: TestClient) -> None:
    assert client.post("/api/mining/cancel").status_code == 409
