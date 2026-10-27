"""Network simulation over HTTP and WebSocket, with the real (threaded) scheduler."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

N = "/api/network"


def wait_until(predicate, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        time.sleep(0.02)


def heights(client: TestClient) -> list[int]:
    return [n["height"] for n in client.get(N).json()["nodes"]]


def fast(client: TestClient) -> None:
    client.put(f"{N}/latency", json={"latency_ms": 20, "jitter_ms": 0})


def test_status_shape(client: TestClient) -> None:
    status = client.get(N).json()
    assert [n["id"] for n in status["nodes"]] == ["node-1", "node-2", "node-3", "node-4"]
    assert status["in_consensus"] and not status["partitioned"]
    assert status["best_height"] == 0
    assert any("NOT Byzantine fault tolerant" in line for line in status["limitations"])
    assert any("MORE total proof of work" in line for line in status["rules"])
    assert set(status["nodes"][0]) >= {"online", "height", "chain_valid", "behind_by", "in_sync", "total_work"}


def test_mine_and_propagate_over_http(client: TestClient) -> None:
    fast(client)
    ticket = client.post(f"{N}/nodes/node-2/mine", json={})
    assert ticket.status_code == 202 and ticket.json()["block_index"] == 1
    wait_until(lambda: heights(client) == [1, 1, 1, 1])

    detail = client.get(f"{N}/nodes/node-3").json()
    assert detail["chain"][1]["transactions"][0]["receiver"] == "node-2"  # node-2 got the reward
    assert detail["history"][0]["outcome"] == "accepted"


def test_disconnect_and_reconnect_over_http(client: TestClient) -> None:
    fast(client)
    assert client.put(f"{N}/nodes/node-4/connection", json={"online": False}).json()["online"] is False
    client.post(f"{N}/nodes/node-1/mine")
    wait_until(lambda: heights(client)[:3] == [1, 1, 1])
    assert heights(client)[3] == 0
    assert client.get(N).json()["nodes"][3]["behind_by"] == 1

    client.put(f"{N}/nodes/node-4/connection", json={"online": True})
    wait_until(lambda: heights(client) == [1, 1, 1, 1])


def test_invalid_block_over_http(client: TestClient) -> None:
    fast(client)
    info = client.post(f"{N}/nodes/node-1/invalid-block", json={"kind": "no_work"})
    assert info.status_code == 202
    assert info.json()["expected_rejection"].startswith("insufficient_work")
    wait_until(lambda: client.get(f"{N}/nodes/node-2").json()["history"] != [])
    entry = client.get(f"{N}/nodes/node-2").json()["history"][0]
    assert entry["outcome"] == "rejected"
    assert entry["reasons"][0]["code"] == "insufficient_work"
    assert heights(client) == [0, 0, 0, 0]


def test_partition_and_heal_over_http(client: TestClient) -> None:
    fast(client)
    split = client.post(f"{N}/partition", json={"groups": [["node-1", "node-2"], ["node-3", "node-4"]]})
    assert split.json()["partitioned"] is True
    client.post(f"{N}/nodes/node-3/mine")
    wait_until(lambda: heights(client) == [0, 0, 1, 1])
    assert client.post(f"{N}/heal").json()["partitioned"] is False
    wait_until(lambda: heights(client) == [1, 1, 1, 1])


def test_websocket_carries_network_events(client: TestClient) -> None:
    fast(client)
    with client.websocket_connect("/api/ws") as ws:
        ws.receive_json()  # hello
        client.post(f"{N}/nodes/node-1/mine")
        seen: set[str] = set()
        while "network.block_received" not in seen:
            seen.add(ws.receive_json()["type"])
    assert {"network.mining_started", "network.block_mined", "network.message_sent"} <= seen


def test_errors(client: TestClient) -> None:
    assert client.get(f"{N}/nodes/node-99").status_code == 404
    assert client.get(f"{N}/nodes/../chain").status_code in {404, 422}
    assert client.post(f"{N}/nodes/node-1/invalid-block", json={"kind": "evil"}).status_code == 422
    bad = client.post(f"{N}/partition", json={"groups": [["node-1"], ["node-2"]]})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "bad_request"
    assert client.put(f"{N}/latency", json={"latency_ms": -1}).status_code == 422
    assert client.post(f"{N}/nodes/node-1/broadcast").status_code == 409  # nothing to broadcast yet


def test_reset_and_add_node(client: TestClient) -> None:
    status = client.post(f"{N}/reset", json={"node_count": 2, "difficulty": 1}).json()
    assert [n["id"] for n in status["nodes"]] == ["node-1", "node-2"] and status["difficulty"] == 1
    created = client.post(f"{N}/nodes", json={"name": "Lab Node"})
    assert created.status_code == 201 and created.json()["name"] == "Lab Node"
    assert client.delete(f"{N}/nodes/{created.json()['id']}").status_code == 204
