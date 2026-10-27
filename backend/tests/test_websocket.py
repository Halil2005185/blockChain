"""WebSocket endpoint tests, end to end through the real FastAPI app."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import Settings
from app.core import Block
from app.core.block import MAX_DIFFICULTY
from app.main import create_app

WS = "/api/ws"


def next_of(ws, event_type: str, limit: int = 500) -> dict[str, Any]:
    """Read messages until one of `event_type` arrives (skipping others)."""
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == event_type:
            return message
    raise AssertionError(f"no {event_type} within {limit} messages")


def collect_until(ws, final_types: set[str], limit: int = 500) -> list[dict[str, Any]]:
    messages = []
    for _ in range(limit):
        message = ws.receive_json()
        messages.append(message)
        if message["type"] in final_types:
            return messages
    raise AssertionError(f"none of {final_types} within {limit} messages")


def wait_until(predicate, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        time.sleep(0.01)


def post_tx(client: TestClient, origin: str | None = "tab-a", amount: float = 5):
    headers = {"X-Client-Id": origin} if origin else {}
    return client.post(
        "/api/transactions",
        json={"sender": "alice", "receiver": "bob", "amount": amount},
        headers=headers,
    )


# ----------------------------------------------------------- connection
def test_hello_on_connect(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        hello = ws.receive_json()
    assert hello["type"] == "hello"
    assert isinstance(hello["seq"], int)
    assert hello["data"]["heartbeat_interval"] > 0
    assert hello["origin"] is None


def test_ping_pong_carries_latest_seq(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        ws.receive_json()  # hello
        post_tx(client)
        event = next_of(ws, "transaction.created")
        ws.send_json({"type": "ping"})
        pong = next_of(ws, "pong")
    assert pong["seq"] == event["seq"]  # control messages don't increment seq


def test_unknown_client_messages_are_ignored(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        ws.send_text("not json")
        ws.send_json({"type": "mine-for-me"})
        ws.send_json({"type": "ping"})
        assert next_of(ws, "pong")["type"] == "pong"  # still connected


def test_oversized_client_message_closes_connection(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        ws.send_text("x" * 2000)
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 1009


def test_foreign_origin_is_rejected() -> None:
    app = create_app(Settings(difficulty=1, mining_reward=1, cors_origins=["http://localhost:3000"]))
    with TestClient(app) as c:
        with pytest.raises(WebSocketDisconnect) as exc:
            with c.websocket_connect(WS, headers={"Origin": "https://evil.example"}) as ws:
                ws.receive_json()
        assert exc.value.code == 1008
        # The real frontend origin is accepted.
        with c.websocket_connect(WS, headers={"Origin": "http://localhost:3000"}) as ws:
            assert ws.receive_json()["type"] == "hello"


# --------------------------------------------------------------- events
def test_transaction_event(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        hello = ws.receive_json()
        created = post_tx(client, origin="tab-a").json()
        event = next_of(ws, "transaction.created")
    assert event["seq"] == hello["seq"] + 1
    assert event["origin"] == "tab-a"
    assert event["data"]["transaction"]["tx_id"] == created["tx_id"]
    assert event["data"]["pending_count"] == 1
    assert event["ts"] > 0


@pytest.mark.parametrize("bad", ["has space", "x" * 65, "<script>"])
def test_suspicious_client_ids_become_anonymous(client: TestClient, bad: str) -> None:
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        post_tx(client, origin=bad)
        assert next_of(ws, "transaction.created")["origin"] is None


def test_mining_lifecycle_events(client: TestClient) -> None:
    client.put("/api/chain/difficulty", json={"difficulty": 3})
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        response = client.post(
            "/api/mining/mine", json={"miner_address": "m"}, headers={"X-Client-Id": "tab-m"}
        ).json()
        messages = collect_until(ws, {"mining.completed"})

    types = [m["type"] for m in messages]
    assert types[0] == "mining.started"
    assert types[-1] == "mining.completed"
    assert set(types) <= {"mining.started", "mining.progress", "mining.completed"}

    seqs = [m["seq"] for m in messages]
    assert seqs == list(range(seqs[0], seqs[0] + len(seqs)))  # gap-free, in order

    started, completed = messages[0], messages[-1]
    assert started["origin"] == completed["origin"] == "tab-m"
    assert started["data"]["job"]["status"] == "running"
    assert completed["data"]["job"]["id"] == response["id"]
    assert completed["data"]["job"]["block"]["hash"] == response["block"]["hash"]
    for progress in messages[1:-1]:
        assert progress["data"]["job_id"] == response["id"]


def test_progress_and_cancel_events(client: TestClient) -> None:
    client.put("/api/chain/difficulty", json={"difficulty": MAX_DIFFICULTY})
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        job = client.post("/api/mining/start", json={"miner_address": "m"}).json()
        progress = next_of(ws, "mining.progress")
        client.post("/api/mining/cancel")
        cancelled = next_of(ws, "mining.cancelled")

    data = progress["data"]
    assert data["job_id"] == job["id"]
    assert data["target_prefix"] == "0" * MAX_DIFFICULTY
    assert data["expected_attempts"] == 16**MAX_DIFFICULTY
    assert set(data["progress"]) == {
        "nonce", "current_hash", "attempts", "elapsed_seconds", "hashes_per_second"
    }
    assert cancelled["data"]["job"]["status"] == "cancelled"
    assert cancelled["data"]["job"]["block"] is None


def test_failed_mining_does_not_leak_internal_errors(client: TestClient, monkeypatch) -> None:
    def explode(self, *args, **kwargs):
        raise RuntimeError("secret internal detail: /etc/passwd")

    monkeypatch.setattr(Block, "mine_block", explode)
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        client.post("/api/mining/start", json={"miner_address": "m"})
        failed = next_of(ws, "mining.failed")

    assert failed["data"]["job"]["error"] == "internal error while mining"
    assert "secret" not in str(failed)
    status = client.get("/api/mining/status").json()
    assert "secret" not in str(status)


def test_validation_tamper_remine_reset_and_difficulty_events(mined_client: TestClient) -> None:
    c = mined_client
    with c.websocket_connect(WS) as ws:
        ws.receive_json()

        c.patch("/api/tamper/blocks/1", json={"data": "rewritten"})
        tampered = next_of(ws, "block.tampered")
        assert tampered["data"]["index"] == 1
        assert tampered["data"]["stored_hash"] != tampered["data"]["recalculated_hash"]
        assert tampered["data"]["validation"]["is_valid"] is False

        c.get("/api/chain/validate")
        validated = next_of(ws, "chain.validated")
        assert validated["data"]["report"]["first_invalid_index"] == 1

        c.post("/api/tamper/blocks/1/remine")
        remined = next_of(ws, "block.remined")
        assert remined["data"]["block"]["hash_valid"] is True
        assert remined["data"]["validation"]["invalid_indices"] == [2]

        c.put("/api/chain/difficulty", json={"difficulty": 1})
        assert next_of(ws, "difficulty.changed")["data"] == {"difficulty": 1}

        c.post("/api/chain/reset", json={"difficulty": 1})
        assert next_of(ws, "chain.reset")["data"] == {"height": 0, "difficulty": 1}


def test_reads_do_not_emit_events(client: TestClient) -> None:
    events = client.app.state.events
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        before = events.last_seq
        client.get("/api/chain")
        client.get("/api/chain/blocks/0")
        client.get("/api/transactions/pending")
        client.get("/api/mining/status")
        assert events.last_seq == before


# -------------------------------------------------------- many clients
def test_every_client_receives_the_same_event(client: TestClient) -> None:
    with client.websocket_connect(WS) as a, client.websocket_connect(WS) as b, client.websocket_connect(WS) as c:
        for ws in (a, b, c):
            ws.receive_json()
        post_tx(client)
        received = [next_of(ws, "transaction.created") for ws in (a, b, c)]
    assert len({e["seq"] for e in received}) == 1
    assert len({e["data"]["transaction"]["tx_id"] for e in received}) == 1


def test_disconnected_client_is_removed_and_others_keep_working(client: TestClient) -> None:
    events = client.app.state.events
    with client.websocket_connect(WS) as stays:
        stays.receive_json()
        with client.websocket_connect(WS) as leaves:
            leaves.receive_json()
            wait_until(lambda: events.client_count == 2)
        wait_until(lambda: events.client_count == 1)

        post_tx(client)
        assert next_of(stays, "transaction.created")["data"]["pending_count"] == 1
    wait_until(lambda: events.client_count == 0)


def test_reconnecting_client_gets_a_fresh_hello_with_current_seq(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        ws.receive_json()
        post_tx(client, amount=1)
        last = next_of(ws, "transaction.created")["seq"]
    # Missed while disconnected:
    post_tx(client, amount=2)
    with client.websocket_connect(WS) as ws:
        hello = ws.receive_json()
    assert hello["type"] == "hello"
    assert hello["seq"] == last + 1  # the client can tell it missed one event
