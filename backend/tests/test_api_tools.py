import pytest
from fastapi.testclient import TestClient


def test_sha256_tool(client: TestClient) -> None:
    body = client.post("/api/tools/sha256", json={"text": "abc"}).json()
    assert body["hash"] == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_sha256_tool_keeps_whitespace(client: TestClient) -> None:
    plain = client.post("/api/tools/sha256", json={"text": "abc"}).json()["hash"]
    spaced = client.post("/api/tools/sha256", json={"text": "abc "}).json()["hash"]
    assert plain != spaced


def test_block_hash_preview_changes_with_nonce(client: TestClient) -> None:
    a = client.post("/api/tools/block-hash", json={"nonce": 0}).json()
    b = client.post("/api/tools/block-hash", json={"nonce": 1}).json()
    assert a["hash"] != b["hash"]
    assert a["merkle_root"] == b["merkle_root"]
    assert a["target_prefix"] == "000"
    assert a["meets_target"] == a["hash"].startswith("000")


def test_block_hash_preview_matches_real_block(mined_client: TestClient) -> None:
    """The preview uses the exact same hashing code as the real chain."""
    block = mined_client.get("/api/chain/blocks/1").json()
    preview = mined_client.post(
        "/api/tools/block-hash",
        json={
            "index": block["index"],
            "timestamp": block["timestamp"],
            "previous_hash": block["previous_hash"],
            "data": block["data"],
            "nonce": block["nonce"],
            "difficulty": block["difficulty"],
            "transactions": [
                {k: tx[k] for k in ("sender", "receiver", "amount", "timestamp")}
                for tx in block["transactions"]
            ],
        },
    ).json()
    assert preview["hash"] == block["hash"]
    assert preview["merkle_root"] == block["merkle_root"]
    assert preview["meets_target"] is True


def test_block_hash_preview_validation(client: TestClient) -> None:
    assert client.post("/api/tools/block-hash", json={"previous_hash": "xyz"}).status_code == 422
    assert client.post("/api/tools/block-hash", json={"difficulty": 9}).status_code == 422


# --------------------------------------------------------------- merkle tool
def test_merkle_tool_matches_the_real_block(mined_client: TestClient) -> None:
    block = mined_client.get("/api/chain/blocks/1").json()
    txs = [{k: tx[k] for k in ("sender", "receiver", "amount", "timestamp")} for tx in block["transactions"]]
    tree = mined_client.post("/api/tools/merkle", json={"transactions": txs}).json()
    assert tree["leaves"] == [tx["tx_id"] for tx in block["transactions"]]
    assert tree["root"] == block["merkle_root"]
    assert len(tree["levels"][0]) == 3 and len(tree["levels"]) == 3  # 3 leaves -> 2 -> 1

    txs[1]["amount"] = 999  # change one transaction: its leaf and the root change
    changed = mined_client.post("/api/tools/merkle", json={"transactions": txs}).json()
    assert changed["leaves"][0] == tree["leaves"][0]
    assert changed["leaves"][1] != tree["leaves"][1]
    assert changed["root"] != tree["root"]


def test_merkle_tool_validation(client: TestClient) -> None:
    assert client.post("/api/tools/merkle", json={"transactions": []}).status_code == 422


# ----------------------------------------------------------- sandbox mining
@pytest.mark.parametrize("difficulty", [1, 2, 3])
def test_mine_preview_finds_a_valid_nonce(client: TestClient, difficulty: int) -> None:
    before = client.get("/api/chain").json()
    result = client.post("/api/tools/mine-preview", json={"data": "lesson", "difficulty": difficulty}).json()

    assert result["found"] is True
    assert result["hash"].startswith("0" * difficulty)
    assert result["attempts"] == result["nonce"] + 1
    assert result["expected_attempts"] == 16**difficulty
    first = result["first_attempts"]
    assert [a["nonce"] for a in first] == list(range(8))
    assert all(a["meets_target"] == a["hash"].startswith("0" * difficulty) for a in first)
    # Sandbox only: the real chain is untouched.
    assert client.get("/api/chain").json() == before


def test_mine_preview_is_reproducible_and_matches_block_hash(client: TestClient) -> None:
    a = client.post("/api/tools/mine-preview", json={"data": "same", "difficulty": 2}).json()
    b = client.post("/api/tools/mine-preview", json={"data": "same", "difficulty": 2}).json()
    assert (a["nonce"], a["hash"]) == (b["nonce"], b["hash"])
    preview = client.post(
        "/api/tools/block-hash",
        json={"index": 1, "timestamp": 0, "data": "same", "difficulty": 2, "nonce": a["nonce"]},
    ).json()
    assert preview["hash"] == a["hash"] and preview["meets_target"]


def test_mine_preview_limits(client: TestClient) -> None:
    assert client.post("/api/tools/mine-preview", json={"difficulty": 6}).status_code == 422
    assert client.post("/api/tools/mine-preview", json={"difficulty": 0}).status_code == 422


def test_mine_preview_gives_up_after_the_attempt_limit(client: TestClient, monkeypatch) -> None:
    import app.api.routes.tools as tools

    monkeypatch.setattr(tools, "MAX_PREVIEW_ATTEMPTS", 20_000)
    # Mining is deterministic: this block's first valid nonce is 2,129,052,
    # far beyond the (patched) limit, so the search must give up.
    result = client.post("/api/tools/mine-preview", json={"data": "unlucky?", "difficulty": 5}).json()
    assert result["found"] is False
    assert result["nonce"] is None and result["hash"] is None
    assert 20_000 <= result["attempts"] < 2_129_052
