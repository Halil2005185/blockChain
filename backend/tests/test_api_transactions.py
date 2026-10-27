import pytest
from fastapi.testclient import TestClient


def test_create_transaction(client: TestClient) -> None:
    response = client.post(
        "/api/transactions", json={"sender": "alice", "receiver": "bob", "amount": 25}
    )
    assert response.status_code == 201
    tx = response.json()
    assert (tx["sender"], tx["receiver"], tx["amount"]) == ("alice", "bob", 25)
    assert len(tx["tx_id"]) == 64
    assert tx["timestamp"] > 0

    pending = client.get("/api/transactions/pending").json()
    assert [p["tx_id"] for p in pending] == [tx["tx_id"]]


def test_account_names_are_trimmed(client: TestClient) -> None:
    tx = client.post(
        "/api/transactions", json={"sender": "  alice ", "receiver": "bob", "amount": 1}
    ).json()
    assert tx["sender"] == "alice"


@pytest.mark.parametrize(
    ("body", "fragment"),
    [
        ({"sender": "alice", "receiver": "bob", "amount": -5}, "amount"),
        ({"sender": "alice", "receiver": "bob", "amount": 0}, "amount"),
        ({"sender": "alice", "receiver": "bob", "amount": "lots"}, "amount"),
        ({"sender": "alice", "receiver": "bob", "amount": 1e12}, "amount"),
        ({"sender": "alice", "amount": 5}, "receiver"),
        ({"sender": "", "receiver": "bob", "amount": 5}, "sender"),
        ({"sender": "a" * 65, "receiver": "bob", "amount": 5}, "sender"),
        ({"sender": "alice", "receiver": "alice", "amount": 5}, "different accounts"),
        ({"sender": "NETWORK", "receiver": "bob", "amount": 5}, "reserved"),
        ({"sender": "alice", "receiver": "bob", "amount": 5, "fee": 1}, "fee"),
    ],
)
def test_invalid_transactions_return_422(client: TestClient, body, fragment) -> None:
    response = client.post("/api/transactions", json=body)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert fragment in error["message"]
    assert client.get("/api/transactions/pending").json() == []


def test_malformed_json_returns_422(client: TestClient) -> None:
    response = client.post(
        "/api/transactions", content="{not json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
