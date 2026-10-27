"""Multi-node network simulation tests.

A ManualScheduler (fake clock) makes latency deterministic: nothing is
delivered until the test calls `advance()`.
"""

from __future__ import annotations

import random
import threading
from dataclasses import dataclass
from typing import Any

import pytest

from app.core import Block, Blockchain, Transaction
from app.network import ManualScheduler, Node
from app.services.errors import BadRequestError, ConflictError, NotFoundError
from app.services.network_service import NetworkService
from app.websocket.events import EVENT_PAYLOADS

LATENCY = 0.1  # seconds (100 ms, no jitter)


class Recorder:
    """Collects events; checks each matches its schema and the lock is free."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []
        self.lock_held: list[str] = []
        self.service: NetworkService | None = None
        self._mutex = threading.Lock()

    def publish(self, event_type: str, data: dict[str, Any], origin: str | None = None) -> None:
        EVENT_PAYLOADS[event_type].model_validate(data)  # typed contract
        if self.service is not None and self.service._lock._is_owned():
            self.lock_held.append(event_type)
        with self._mutex:
            self.events.append((event_type, data))

    def of(self, event_type: str) -> list[dict[str, Any]]:
        return [d for t, d in self.events if t == event_type]


@dataclass
class Net:
    svc: NetworkService
    clock: ManualScheduler
    rec: Recorder

    def node(self, node_id: str) -> Node:
        return self.svc._nodes[node_id]

    def mine(self, node_id: str) -> None:
        self.svc.start_mining(node_id).future.result(timeout=10)

    def deliver(self) -> None:
        self.clock.run_until_idle()

    def heights(self) -> dict[str, int]:
        return {n["id"]: n["height"] for n in self.svc.status()["nodes"]}


@pytest.fixture
def net():
    clock, rec = ManualScheduler(), Recorder()
    svc = NetworkService(
        difficulty=2, mining_reward=10, node_count=4, latency_ms=LATENCY * 1000, jitter_ms=0,
        events=rec, scheduler=clock, rng=random.Random(7),
    )
    rec.service = svc
    yield Net(svc, clock, rec)
    assert rec.lock_held == [], "events must never be published while holding the lock"
    svc.shutdown()


ALL = ["node-1", "node-2", "node-3", "node-4"]


# ------------------------------------------------------------------ isolation
def test_nodes_start_identical_but_independent(net: Net) -> None:
    chains = [net.node(n).chain for n in ALL]
    assert len({c.chain[0].hash for c in chains}) == 1  # same hard-coded genesis
    assert len({id(c) for c in chains}) == 4  # ...in four separate Blockchain objects
    assert len({id(c.chain[0]) for c in chains}) == 4
    assert len({id(c.pending_transactions) for c in chains}) == 4


def test_received_blocks_are_private_copies(net: Net) -> None:
    net.mine("node-1")
    net.deliver()
    original = net.node("node-1").chain.chain[1]
    copy = net.node("node-2").chain.chain[1]
    assert copy.hash == original.hash and copy is not original

    original.transactions[0].amount = 999  # tamper with node-1's copy only
    assert not net.node("node-1").chain.is_chain_valid()
    assert net.node("node-2").chain.is_chain_valid()


def test_pending_pools_are_independent_until_gossip_arrives(net: Net) -> None:
    tx = net.svc.submit_transaction("node-1", "alice", "bob", 5)
    pools = lambda: {n: [t.tx_id for t in net.node(n).chain.pending_transactions] for n in ALL}  # noqa: E731
    assert pools() == {"node-1": [tx["tx_id"]], "node-2": [], "node-3": [], "node-4": []}

    net.clock.advance(LATENCY)
    assert pools() == dict.fromkeys(ALL, [tx["tx_id"]])
    assert all(e["accepted"] for e in net.rec.of("network.transaction_received"))


# --------------------------------------------------------------- broadcasting
def test_mined_block_travels_with_latency_and_is_accepted(net: Net) -> None:
    net.mine("node-1")
    sent = net.rec.of("network.message_sent")
    assert sorted(m["to_node"] for m in sent) == ["node-2", "node-3", "node-4"]
    assert {m["kind"] for m in sent} == {"block"} and {m["latency_ms"] for m in sent} == {100}

    net.clock.advance(LATENCY / 2)
    assert net.heights() == {"node-1": 1, "node-2": 0, "node-3": 0, "node-4": 0}  # still in flight

    net.clock.advance(LATENCY / 2)
    assert net.heights() == dict.fromkeys(ALL, 1)
    received = net.rec.of("network.block_received")
    assert [r["outcome"] for r in received] == ["accepted"] * 3
    assert net.svc.status()["in_consensus"]


def test_included_transactions_leave_every_pool(net: Net) -> None:
    net.svc.submit_transaction("node-1", "alice", "bob", 5)
    net.deliver()
    net.mine("node-3")
    net.deliver()
    assert all(not net.node(n).chain.pending_transactions for n in ALL)


def test_rebroadcast_is_a_duplicate(net: Net) -> None:
    net.mine("node-1")
    net.deliver()
    net.svc.broadcast_tip("node-1")
    net.deliver()
    assert [r["outcome"] for r in net.rec.of("network.block_received")[-3:]] == ["duplicate"] * 3


# -------------------------------------------------------------- invalid blocks
@pytest.mark.parametrize(
    ("kind", "code"),
    [("tampered", "hash_mismatch"), ("no_work", "insufficient_work"), ("inflated_reward", "bad_reward")],
)
def test_invalid_blocks_are_rejected_with_reasons(net: Net, kind: str, code: str) -> None:
    net.svc.submit_transaction("node-1", "alice", "bob", 5)
    net.deliver()
    info, future = net.svc.send_invalid_block("node-1", kind)
    future.result(timeout=10)
    net.deliver()

    received = net.rec.of("network.block_received")
    assert len(received) == 3
    for r in received:
        assert r["outcome"] == "rejected"
        assert code in {reason["code"] for reason in r["reasons"]}
    assert net.heights() == dict.fromkeys(ALL, 0)
    # The sender never added the bad block to its own chain or touched its pool.
    assert len(net.node("node-1").chain.pending_transactions) == 1
    assert info["expected_rejection"].startswith(code)


def test_unknown_parent_is_orphaned_and_never_resolved(net: Net) -> None:
    _, future = net.svc.send_invalid_block("node-1", "unknown_parent")
    future.result(timeout=10)
    net.deliver()

    assert {r["outcome"] for r in net.rec.of("network.block_received")} == {"orphan"}
    syncs = net.rec.of("network.sync")
    assert len(syncs) == 3
    assert all(s["adopted"] is False and s["resolved"] is False for s in syncs)
    assert net.heights() == dict.fromkeys(ALL, 0)


def test_low_difficulty_block_is_rejected(net: Net) -> None:
    sender = net.node("node-1").chain
    tip = sender.get_latest_block()
    cheap = Block(1, [Transaction.reward("x", 10)], tip.hash, difficulty=1, timestamp=tip.timestamp + 1)
    cheap.mine_block()
    decision = net.node("node-2").receive_block(cheap)
    assert decision.outcome == "rejected"
    assert decision.reasons[0].code == "difficulty_too_low"


# ----------------------------------------------- offline nodes and reconnection
def test_offline_node_misses_blocks_then_catches_up(net: Net) -> None:
    net.svc.set_online("node-4", False)
    net.mine("node-1")
    net.deliver()
    dropped = net.rec.of("network.message_dropped")
    assert [(d["to_node"], d["reason"]) for d in dropped] == [("node-4", "receiver_offline")]
    assert net.heights()["node-4"] == 0
    assert net.svc.status()["nodes"][3]["behind_by"] == 1

    net.svc.set_online("node-4", True)
    net.deliver()
    assert net.heights()["node-4"] == 1
    assert any(s["node_id"] == "node-4" and s["adopted"] for s in net.rec.of("network.sync"))
    assert net.rec.of("network.node_status")[-1] == {"node_id": "node-4", "online": True, "group": "main"}


def test_message_in_flight_is_dropped_if_receiver_goes_offline(net: Net) -> None:
    net.mine("node-1")
    net.svc.set_online("node-2", False)  # after sending, before arrival
    net.deliver()
    assert ("node-2", "receiver_offline") in {(d["to_node"], d["reason"]) for d in net.rec.of("network.message_dropped")}
    assert net.heights()["node-2"] == 0


def test_blocks_mined_while_offline_spread_after_reconnect(net: Net) -> None:
    net.svc.set_online("node-4", False)
    net.mine("node-4")
    net.mine("node-4")
    net.deliver()
    assert {d["reason"] for d in net.rec.of("network.message_dropped")} == {"sender_offline"}
    assert net.heights() == {"node-1": 0, "node-2": 0, "node-3": 0, "node-4": 2}

    net.svc.set_online("node-4", True)
    net.deliver()
    assert net.heights() == dict.fromkeys(ALL, 2)


def test_new_node_downloads_the_chain(net: Net) -> None:
    net.mine("node-1")
    net.mine("node-1")
    net.deliver()
    summary = net.svc.add_node("Late Node")
    assert summary["height"] == 0
    net.deliver()
    assert net.heights()[summary["id"]] == 2


# ------------------------------------------------ partitions and fork choice
def test_partition_creates_a_fork_and_most_work_wins_after_heal(net: Net) -> None:
    net.svc.partition([["node-1", "node-2"], ["node-3", "node-4"]])
    net.svc.submit_transaction("node-1", "alice", "bob", 7)  # only reaches node-2
    net.deliver()
    net.mine("node-1")  # group 1: one block (includes the tx)
    net.mine("node-3")  # group 2: two blocks
    net.deliver()
    net.mine("node-3")
    net.deliver()
    assert net.heights() == {"node-1": 1, "node-2": 1, "node-3": 2, "node-4": 2}
    assert net.node("node-1").tip_hash != net.node("node-3").tip_hash
    assert not net.svc.status()["in_consensus"]
    assert all(
        d["reason"] == "partitioned" for d in net.rec.of("network.message_dropped")
    ), "messages across the split are dropped"

    net.svc.heal()
    net.deliver()
    assert net.heights() == dict.fromkeys(ALL, 2)
    assert net.svc.status()["in_consensus"]
    reorgs = {s["node_id"]: s for s in net.rec.of("network.sync") if s["adopted"]}
    assert set(reorgs) == {"node-1", "node-2"}
    assert all(r["reorg_depth"] == 1 and r["returned_transactions"] == 1 for r in reorgs.values())
    # The transaction from the discarded block is pending again, not lost.
    for node_id in ("node-1", "node-2"):
        assert [t.sender for t in net.node(node_id).chain.pending_transactions] == ["alice"]


def test_equal_work_keeps_first_seen_until_one_side_extends(net: Net) -> None:
    net.svc.partition([["node-1", "node-2"], ["node-3", "node-4"]])
    net.mine("node-1")
    net.mine("node-3")
    net.deliver()
    net.svc.heal()
    net.deliver()
    assert not any(s["adopted"] for s in net.rec.of("network.sync"))  # tie: nobody switches
    assert not net.svc.status()["in_consensus"]

    net.mine("node-1")  # node-1's side pulls ahead
    net.deliver()
    orphans = [r for r in net.rec.of("network.block_received") if r["outcome"] == "orphan"]
    assert {o["to_node"] for o in orphans} == {"node-3", "node-4"}
    assert net.svc.status()["in_consensus"]
    assert net.heights() == dict.fromkeys(ALL, 2)


def test_partition_validation(net: Net) -> None:
    with pytest.raises(BadRequestError):
        net.svc.partition([["node-1", "node-2"], ["node-3"]])  # node-4 missing
    with pytest.raises(BadRequestError):
        net.svc.partition([["node-1", "node-2", "node-3", "node-4"], ["node-1"]])
    with pytest.raises(NotFoundError):
        net.svc.partition([["node-1", "node-9"], ["node-2", "node-3", "node-4"]])
    assert not net.svc.status()["partitioned"]


# ---------------------------------------------------- conflicting chains
def _extended_copy(chain: Blockchain, blocks: int, difficulty: int | None = None) -> Blockchain:
    copy = Blockchain.from_dict(chain.to_dict())
    if difficulty:
        copy.difficulty = difficulty
    for _ in range(blocks):
        copy.mine_pending_transactions("attacker")
    return copy


def test_longer_but_invalid_chain_never_replaces_a_valid_one(net: Net) -> None:
    node = net.node("node-2")
    attacker = _extended_copy(node.chain, 3)
    attacker.chain[2].transactions[0].amount = 5  # break it, keep it longer
    result = node.consider_chain(attacker)
    assert not result.adopted and result.reason == "invalid_chain"
    assert node.height == 0 and node.chain.is_chain_valid()


def test_chain_from_a_different_genesis_is_refused(net: Net) -> None:
    other = Blockchain(difficulty=3)  # different difficulty => different genesis
    other.mine_pending_transactions("x")
    result = net.node("node-1").consider_chain(other)
    assert result.reason == "different_genesis" and not result.adopted


def test_many_cheap_blocks_are_refused_by_network_policy(net: Net) -> None:
    node = net.node("node-1")
    cheap = _extended_copy(node.chain, 20, difficulty=1)
    assert cheap.total_work() > node.chain.total_work()  # more "work" on paper...
    result = node.consider_chain(cheap)
    assert result.reason == "low_difficulty" and not result.adopted


def test_candidate_cannot_bring_its_own_reward_rules(net: Net) -> None:
    node = net.node("node-1")
    greedy = Blockchain.from_dict(node.chain.to_dict())
    greedy.mining_reward = 1_000_000
    greedy.mine_pending_transactions("greedy")  # reward 1,000,000: valid by its own rules
    result = node.consider_chain(greedy)
    assert result.reason == "invalid_chain"
    assert {i.code for i in result.issues} == {"bad_reward"}


# --------------------------------------------------------------- races
def test_mining_race_loser_discards_its_stale_block(net: Net, monkeypatch) -> None:
    gate = threading.Event()
    original = Block.mine_block

    def slow_for_node_1(self, *args, **kwargs):
        if self.transactions and self.transactions[0].receiver == "node-1":
            gate.wait(timeout=10)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Block, "mine_block", slow_for_node_1)
    slow = net.svc.start_mining("node-1")
    net.mine("node-2")  # finishes first
    net.deliver()  # node-1 accepts node-2's block while still mining
    gate.set()
    slow.future.result(timeout=10)
    net.deliver()

    stale = net.rec.of("network.mining_stale")
    assert [s["node_id"] for s in stale] == ["node-1"]
    assert net.heights() == dict.fromkeys(ALL, 1)
    assert net.node("node-1").tip_hash == net.node("node-2").tip_hash


def test_reset_ignores_messages_still_in_flight(net: Net) -> None:
    net.mine("node-1")
    net.svc.reset(node_count=4)
    net.deliver()
    assert net.heights() == dict.fromkeys(ALL, 0)
    assert net.rec.of("network.block_received") == []


def test_topology_limits(net: Net) -> None:
    for _ in range(4):
        net.svc.add_node()
    with pytest.raises(ConflictError):
        net.svc.add_node()
    net.svc.remove_node("node-8")
    assert len(net.svc.status()["nodes"]) == 7
    with pytest.raises(NotFoundError):
        net.svc.node_detail("node-8")


def test_node_detail_includes_history_and_chain(net: Net) -> None:
    net.mine("node-1")
    net.deliver()
    detail = net.svc.node_detail("node-2")
    assert len(detail["chain"]) == 2
    assert detail["validation"]["is_valid"]
    assert detail["history"][0]["kind"] == "received"
    assert detail["history"][0]["outcome"] == "accepted"
