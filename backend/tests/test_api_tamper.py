"""The tampering lesson, end to end over HTTP."""

from fastapi.testclient import TestClient


def tamper_amount(client: TestClient, index: int, amount: float = 1_000_000):
    return client.patch(
        f"/api/tamper/blocks/{index}", json={"transaction_index": 1, "amount": amount}
    )


def test_tampering_breaks_the_hash(mined_client: TestClient) -> None:
    before = mined_client.get("/api/chain/blocks/1").json()

    response = tamper_amount(mined_client, 1)
    assert response.status_code == 200
    body = response.json()

    assert body["block"]["transactions"][1]["amount"] == 1_000_000
    assert body["stored_hash"] == before["hash"]  # not re-mined...
    assert body["recalculated_hash"] != before["hash"]  # ...so it no longer matches
    assert body["block"]["hash_valid"] is False

    report = body["validation"]
    assert report["is_valid"] is False
    assert report["first_invalid_index"] == 1
    assert report["untrusted_indices"] == [1, 2]
    assert [i["code"] for i in report["issues"]] == ["hash_mismatch"]
    assert mined_client.get("/api/chain/validate").json() == report


def test_tamper_block_data_and_genesis(mined_client: TestClient) -> None:
    body = mined_client.patch("/api/tamper/blocks/0", json={"data": "rewritten"}).json()
    assert body["block"]["data"] == "rewritten"
    assert body["validation"]["untrusted_indices"] == [0, 1, 2]


def test_remining_moves_the_break_to_the_next_block(mined_client: TestClient) -> None:
    tamper_amount(mined_client, 1)
    response = mined_client.post("/api/tamper/blocks/1/remine")
    assert response.status_code == 200
    body = response.json()

    assert body["block"]["hash_valid"] is True
    assert body["result"]["hash"] == body["block"]["hash"]
    report = body["validation"]
    assert report["invalid_indices"] == [2]
    assert [i["code"] for i in report["issues"]] == ["broken_link"]


def test_remining_every_later_block_rebuilds_a_valid_chain(mined_client: TestClient) -> None:
    original_tip = mined_client.get("/api/chain/blocks/2").json()["hash"]
    tamper_amount(mined_client, 1)
    mined_client.post("/api/tamper/blocks/1/remine")
    report = mined_client.post("/api/tamper/blocks/2/remine").json()["validation"]

    assert report["is_valid"] is True  # a lone attacker CAN rebuild the chain...
    new_tip = mined_client.get("/api/chain/blocks/2").json()["hash"]
    assert new_tip != original_tip  # ...but it differs from every other copy


def test_remine_without_relink_keeps_link_broken(mined_client: TestClient) -> None:
    tamper_amount(mined_client, 1)
    mined_client.post("/api/tamper/blocks/1/remine")
    report = mined_client.post(
        "/api/tamper/blocks/2/remine", json={"relink": False}
    ).json()["validation"]
    assert report["invalid_indices"] == [2]


def test_mining_after_tampering_still_extends_the_chain(mined_client: TestClient) -> None:
    tamper_amount(mined_client, 1)
    job = mined_client.post("/api/mining/mine", json={"miner_address": "m"}).json()
    assert job["status"] == "completed"
    report = mined_client.get("/api/chain/validate").json()
    assert report["untrusted_indices"] == [1, 2, 3]


def test_tamper_errors(mined_client: TestClient) -> None:
    assert mined_client.patch("/api/tamper/blocks/99", json={"data": "x"}).status_code == 404
    assert (
        mined_client.patch(
            "/api/tamper/blocks/1", json={"transaction_index": 9, "amount": 1}
        ).status_code
        == 404
    )
    # Nothing to change.
    assert mined_client.patch("/api/tamper/blocks/1", json={}).status_code == 422
    # Transaction fields without saying which transaction.
    assert mined_client.patch("/api/tamper/blocks/1", json={"amount": 5}).status_code == 422
    assert mined_client.patch(
        "/api/tamper/blocks/1", json={"transaction_index": 1, "amount": -5}
    ).status_code == 422
    assert mined_client.post("/api/tamper/blocks/99/remine").status_code == 404
    # The chain is untouched by the rejected requests.
    assert mined_client.get("/api/chain/validate").json()["is_valid"] is True
