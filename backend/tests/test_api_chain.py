from fastapi.testclient import TestClient

from app.core.block import MAX_DIFFICULTY


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_fresh_chain_has_only_genesis(client: TestClient) -> None:
    chain = client.get("/api/chain").json()
    assert chain["height"] == 0
    assert chain["difficulty"] == 2
    assert chain["pending_transactions"] == []
    genesis = chain["chain"][0]
    assert genesis["is_genesis"] is True
    assert genesis["previous_hash"] == "0" * 64
    assert genesis["hash_valid"] is True
    assert chain["validation"]["is_valid"] is True


def test_get_block(mined_client: TestClient) -> None:
    block = mined_client.get("/api/chain/blocks/2").json()
    assert block["index"] == 2
    assert len(block["transactions"]) == 3
    assert block["merkle_root"] and block["hash"]


def test_get_missing_block_returns_404(client: TestClient) -> None:
    response = client.get("/api/chain/blocks/99")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_negative_block_index_returns_422(client: TestClient) -> None:
    assert client.get("/api/chain/blocks/-1").status_code == 422


def test_unknown_route_uses_error_shape(client: TestClient) -> None:
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_validate_valid_chain(mined_client: TestClient) -> None:
    report = mined_client.get("/api/chain/validate").json()
    assert report == {
        "is_valid": True,
        "chain_length": 3,
        "first_invalid_index": None,
        "invalid_indices": [],
        "untrusted_indices": [],
        "issues": [],
    }


def test_reset_chain(mined_client: TestClient) -> None:
    mined_client.post("/api/transactions", json={"sender": "a", "receiver": "b", "amount": 1})
    chain = mined_client.post("/api/chain/reset").json()
    assert chain["height"] == 0
    assert chain["pending_transactions"] == []
    assert chain["difficulty"] == 2


def test_reset_with_difficulty(client: TestClient) -> None:
    chain = client.post("/api/chain/reset", json={"difficulty": 1}).json()
    assert chain["difficulty"] == 1
    assert chain["chain"][0]["difficulty"] == 1


def test_reset_rejected_while_mining(client: TestClient) -> None:
    client.put("/api/chain/difficulty", json={"difficulty": MAX_DIFFICULTY})
    client.post("/api/mining/start", json={"miner_address": "m"})
    try:
        response = client.post("/api/chain/reset")
        assert response.status_code == 409
    finally:
        client.post("/api/mining/cancel")
