"""NetworkService: runs the multi-node simulation.

How independent node state is kept
----------------------------------
* Each ``Node`` owns its own ``Blockchain`` (chain + pending pool).
* Nodes only talk through messages. Every block/chain/transaction that crosses
  the "wire" is a snapshot dict, turned back into fresh objects on arrival, so
  no two nodes ever share a Python object.
* A message arrives after the simulated latency, and only if the receiver is
  online and in the same partition group as the sender; otherwise it's dropped.

Concurrency: one RLock guards all network state, held only for short steps.
Mining runs in a thread pool *without* the lock (create candidate -> mine ->
commit, like ChainService). Events are collected under the lock and
published after releasing it.

Simplifications (also shown in the UI): full mesh, no relaying, a sync is a
single one-way "here is my chain" message, no signatures or node identities,
everything in one process. Not Byzantine fault tolerant.
"""

from __future__ import annotations

import itertools
import logging
import random
import threading
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from threading import RLock
from typing import Any

from app.core import Block, Blockchain, MiningCancelled, Transaction
from app.core.block import MAX_DIFFICULTY, MIN_DIFFICULTY
from app.network.experiments import EXPECTED_REJECTION, InvalidKind, craft_invalid_block
from app.network.node import Node
from app.network.scheduler import Scheduler, ThreadScheduler
from app.services.errors import BadRequestError, ConflictError, NotFoundError
from app.services.events import EventPublisher, NullPublisher, current_origin

logger = logging.getLogger(__name__)

MAX_NODES = 8
MAX_LATENCY_MS = 5_000
MAX_JITTER_MS = 2_000

CONSENSUS_RULES = [
    "Every node validates every block it receives with the same rules: correct hash, "
    "enough proof of work, valid link to its parent, valid transactions, reward not above the limit.",
    "A valid block that extends a node's chain is appended immediately.",
    "A valid block whose parent is unknown makes the node ask the sender for its whole chain.",
    "A node switches to another chain only if that chain is completely valid, starts from the "
    "same genesis block and has MORE total proof of work (sum of 16^difficulty). On a tie it keeps "
    "the chain it saw first.",
    "When a node switches chains, transactions from its discarded blocks go back to its pending pool.",
]

LIMITATIONS = [
    "Educational simulation in one process, not a real distributed system.",
    "Messages are delivered honestly; there are no signatures, node identities or encryption.",
    "Every node talks directly to every other node (full mesh); nothing is relayed.",
    "Difficulty never adjusts itself, and there are no incentives or fees.",
    "This is NOT Byzantine fault tolerant and NOT production-grade consensus.",
]

Outbox = list[tuple[str, dict[str, Any], str | None]]
Deliver = Callable[[Outbox, str, Node, Node], None]


@dataclass
class MiningTicket:
    node_id: str
    block_index: int
    difficulty: int
    future: Future[None]

    def to_dict(self) -> dict[str, Any]:
        return {"node_id": self.node_id, "block_index": self.block_index, "difficulty": self.difficulty}


class NetworkService:
    def __init__(
        self,
        *,
        difficulty: int = 3,
        mining_reward: float = 10.0,
        node_count: int = 4,
        latency_ms: float = 800,
        jitter_ms: float = 300,
        events: EventPublisher | None = None,
        scheduler: Scheduler | None = None,
        rng: random.Random | None = None,
        mining_workers: int = 4,
    ) -> None:
        self._lock = RLock()
        self._events: EventPublisher = events or NullPublisher()
        self._owns_scheduler = scheduler is None
        self._scheduler: Scheduler = scheduler or ThreadScheduler()
        self._rng = rng or random.Random()
        self._executor = ThreadPoolExecutor(max_workers=mining_workers, thread_name_prefix="node-miner")
        self._message_ids = itertools.count(1)
        self._mining_reward = mining_reward
        self.latency_ms = latency_ms
        self.jitter_ms = jitter_ms
        self._jobs: dict[str, threading.Event] = {}
        self._build(node_count, difficulty)

    # ------------------------------------------------------------------ #
    # Setup
    # ------------------------------------------------------------------ #
    def _build(self, node_count: int, difficulty: int) -> None:
        if not 1 <= node_count <= MAX_NODES:
            raise BadRequestError(f"node_count must be between 1 and {MAX_NODES}")
        if not MIN_DIFFICULTY <= difficulty <= MAX_DIFFICULTY:
            raise BadRequestError(f"difficulty must be between {MIN_DIFFICULTY} and {MAX_DIFFICULTY}")
        self._difficulty = difficulty
        self._numbers = itertools.count(1)
        self._nodes: dict[str, Node] = {}
        # Every node starts from the same hard-coded genesis. Mine it once and
        # give each node its own deep copy (from_dict) instead of re-mining.
        self._genesis_template = Blockchain(difficulty=difficulty, mining_reward=self._mining_reward).to_dict()
        # Epoch changes on every reset; messages from an older epoch are ignored,
        # so in-flight messages can't reach brand-new nodes that reuse old ids.
        self._epoch = getattr(self, "_epoch", 0) + 1
        for _ in range(node_count):
            self._create_node(None)

    def _create_node(self, name: str | None) -> Node:
        number = next(self._numbers)
        node_id = f"node-{number}"
        label = name or (f"Node {chr(64 + number)}" if number <= 26 else f"Node {number}")
        node = Node(
            node_id, label,
            difficulty=self._difficulty,
            mining_reward=self._mining_reward,
            chain=Blockchain.from_dict(self._genesis_template),
        )
        self._nodes[node_id] = node
        return node

    def _get(self, node_id: str) -> Node:
        node = self._nodes.get(node_id)
        if node is None:
            raise NotFoundError(f"node {node_id!r} does not exist")
        return node

    def _flush(self, out: Outbox) -> None:
        """Publish collected events. Called WITHOUT holding the lock."""
        for event_type, data, origin in out:
            try:
                self._events.publish(event_type, data, origin)
            except Exception:
                logger.exception("failed to publish %s", event_type)

    def _changed(self, out: Outbox, change: str, node_id: str | None = None) -> None:
        out.append(("network.changed", {"change": change, "node_id": node_id}, current_origin.get()))

    # ------------------------------------------------------------------ #
    # Reads
    # ------------------------------------------------------------------ #
    def _best(self) -> Node:
        return max(self._nodes.values(), key=lambda n: (n.chain.total_work(), -int(n.id.split("-")[1])))

    def _summary(self, node: Node, best: Node) -> dict[str, Any]:
        return {
            "id": node.id,
            "name": node.name,
            "online": node.online,
            "group": node.group,
            "height": node.height,
            "tip_hash": node.tip_hash,
            "total_work": node.chain.total_work(),
            "chain_valid": node.chain.is_chain_valid(),
            "pending_count": len(node.chain.pending_transactions),
            "mining": node.mining,
            "behind_by": max(0, best.height - node.height),
            "in_sync": node.tip_hash == best.tip_hash,
        }

    def status(self) -> dict[str, Any]:
        with self._lock:
            best = self._best()
            nodes = [self._summary(n, best) for n in self._nodes.values()]
            online_tips = {n.tip_hash for n in self._nodes.values() if n.online}
            return {
                "nodes": nodes,
                "difficulty": self._difficulty,
                "mining_reward": self._mining_reward,
                "latency_ms": self.latency_ms,
                "jitter_ms": self.jitter_ms,
                "max_nodes": MAX_NODES,
                "best_height": best.height,
                "best_tip_hash": best.tip_hash,
                "in_consensus": len(online_tips) <= 1,
                "partitioned": len({n.group for n in self._nodes.values()}) > 1,
                "rules": CONSENSUS_RULES,
                "limitations": LIMITATIONS,
            }

    def list_nodes(self) -> list[dict[str, Any]]:
        return self.status()["nodes"]

    def node_detail(self, node_id: str) -> dict[str, Any]:
        with self._lock:
            node = self._get(node_id)
            return {
                **self._summary(node, self._best()),
                "chain": [block.to_dict() for block in node.chain.chain],
                "validation": node.chain.validate_chain().to_dict(),
                "pending_transactions": [tx.to_dict() for tx in node.chain.pending_transactions],
                "history": list(node.history),
            }

    # ------------------------------------------------------------------ #
    # Topology
    # ------------------------------------------------------------------ #
    def add_node(self, name: str | None = None) -> dict[str, Any]:
        out: Outbox = []
        with self._lock:
            if len(self._nodes) >= MAX_NODES:
                raise ConflictError(f"the simulation supports at most {MAX_NODES} nodes")
            node = self._create_node(name)
            self._changed(out, "node_added", node.id)
            # A new node starts with only the genesis block and downloads peers' chains.
            for peer in self._peers(node):
                self._send_chain(out, peer, node)
            summary = self._summary(node, self._best())
        self._flush(out)
        return summary

    def remove_node(self, node_id: str) -> None:
        out: Outbox = []
        with self._lock:
            self._get(node_id)
            if len(self._nodes) == 1:
                raise ConflictError("the network needs at least one node")
            cancel = self._jobs.pop(node_id, None)
            if cancel:
                cancel.set()
            del self._nodes[node_id]
            self._changed(out, "node_removed", node_id)
        self._flush(out)

    def set_online(self, node_id: str, online: bool) -> dict[str, Any]:
        out: Outbox = []
        with self._lock:
            node = self._get(node_id)
            if node.online != online:
                node.online = online
                node.record("connection", online=online)
                out.append(("network.node_status", {"node_id": node.id, "online": online, "group": node.group}, current_origin.get()))
                if online:
                    self._exchange_chains(out, node)
            summary = self._summary(node, self._best())
        self._flush(out)
        return summary

    def partition(self, groups: list[list[str]]) -> dict[str, Any]:
        """Split the network: nodes only reach nodes in the same group."""
        flat = [node_id for group in groups for node_id in group]
        if len(groups) < 2 or any(not g for g in groups):
            raise BadRequestError("give at least two non-empty groups")
        out: Outbox = []
        with self._lock:
            unknown = [n for n in flat if n not in self._nodes]
            if unknown:
                raise NotFoundError(f"unknown node(s): {', '.join(unknown)}")
            if len(set(flat)) != len(flat) or set(flat) != set(self._nodes):
                raise BadRequestError("every node must appear in exactly one group")
            for number, group in enumerate(groups, start=1):
                for node_id in group:
                    self._nodes[node_id].group = f"group-{number}"
            self._changed(out, "partitioned")
        self._flush(out)
        return self.status()

    def heal(self) -> dict[str, Any]:
        """Remove the partition; everyone exchanges chains and converges."""
        out: Outbox = []
        with self._lock:
            for node in self._nodes.values():
                node.group = "main"
            self._changed(out, "healed")
            for node in self._nodes.values():
                for peer in self._peers(node):
                    self._send_chain(out, node, peer)
        self._flush(out)
        return self.status()

    def set_latency(self, latency_ms: float, jitter_ms: float) -> dict[str, Any]:
        if not 0 <= latency_ms <= MAX_LATENCY_MS or not 0 <= jitter_ms <= MAX_JITTER_MS:
            raise BadRequestError("latency or jitter out of range")
        out: Outbox = []
        with self._lock:
            self.latency_ms, self.jitter_ms = latency_ms, jitter_ms
            self._changed(out, "latency")
        self._flush(out)
        return self.status()

    def reset(self, node_count: int = 4, difficulty: int | None = None) -> dict[str, Any]:
        out: Outbox = []
        with self._lock:
            for cancel in self._jobs.values():
                cancel.set()
            self._jobs.clear()
            self._build(node_count, difficulty or self._difficulty)
            self._changed(out, "reset")
        self._flush(out)
        return self.status()

    # ------------------------------------------------------------------ #
    # Node actions
    # ------------------------------------------------------------------ #
    def submit_transaction(self, node_id: str, sender: str, receiver: str, amount: float) -> dict[str, Any]:
        out: Outbox = []
        tx = Transaction(sender, receiver, amount)
        with self._lock:
            node = self._get(node_id)
            node.chain.add_transaction(tx)
            data = tx.to_dict()
            node.record("transaction", tx_id=tx.tx_id, source="local")
            for peer in self._others(node):
                self._send(out, "transaction", node, peer, self._deliver_transaction(data), tx_id=tx.tx_id)
        self._flush(out)
        return data

    def start_mining(self, node_id: str, miner_address: str | None = None) -> MiningTicket:
        out: Outbox = []
        with self._lock:
            node = self._get(node_id)
            if node.mining:
                raise ConflictError(f"{node.name} is already mining")
            candidate = node.chain.create_candidate_block(miner_address or node.id)
            node.mining = True
            cancel = threading.Event()
            self._jobs[node.id] = cancel
            epoch = self._epoch
            out.append((
                "network.mining_started",
                {"node_id": node.id, "block_index": candidate.index, "difficulty": candidate.difficulty},
                current_origin.get(),
            ))
        self._flush(out)
        future = self._executor.submit(self._mine, epoch, node_id, candidate, cancel)
        return MiningTicket(node_id, candidate.index, candidate.difficulty, future)

    def _mine(self, epoch: int, node_id: str, candidate: Block, cancel: threading.Event) -> None:
        out: Outbox = []
        try:
            result = candidate.mine_block(should_stop=cancel.is_set)  # slow, no lock
        except MiningCancelled:
            result = None
        except Exception:
            logger.exception("mining on %s crashed", node_id)
            result = None

        with self._lock:
            node = self._nodes.get(node_id)
            if epoch != self._epoch or node is None:
                return  # network was reset or node removed meanwhile
            node.mining = False
            self._jobs.pop(node_id, None)
            if result is None:
                return
            tip = node.chain.get_latest_block()
            if candidate.previous_hash != tip.hash:
                # Another block arrived first; this one no longer builds on our tip.
                node.record("mining_stale", block_index=candidate.index, block_hash=candidate.hash)
                out.append((
                    "network.mining_stale",
                    {"node_id": node.id, "block_index": candidate.index,
                     "reason": "another block at this height arrived first, so this one was discarded"},
                    None,
                ))
            else:
                node.chain.commit_block(candidate)  # core validates it once more
                node.record("mined", block_index=candidate.index, block_hash=candidate.hash,
                            attempts=result.attempts)
                out.append((
                    "network.block_mined",
                    {"node_id": node.id, "block_index": candidate.index, "block_hash": candidate.hash,
                     "attempts": result.attempts, "duration_seconds": result.duration_seconds},
                    None,
                ))
                self._broadcast_block(out, node, candidate.to_dict())
        self._flush(out)

    def broadcast_tip(self, node_id: str) -> dict[str, Any]:
        """Re-send this node's latest block to every peer."""
        out: Outbox = []
        with self._lock:
            node = self._get(node_id)
            if node.height == 0:
                raise ConflictError("only the genesis block exists; mine a block first")
            self._broadcast_block(out, node, node.chain.get_latest_block().to_dict())
        self._flush(out)
        return {"node_id": node_id, "block_index": node.height}

    def sync_node(self, node_id: str) -> dict[str, Any]:
        """Ask every reachable peer for its chain."""
        out: Outbox = []
        with self._lock:
            node = self._get(node_id)
            for peer in self._peers(node):
                self._send_chain(out, peer, node)
        self._flush(out)
        return {"node_id": node_id, "requested_from": len([e for e in out if e[0] == "network.message_sent"])}

    def send_invalid_block(self, node_id: str, kind: InvalidKind) -> tuple[dict[str, Any], Future[None]]:
        with self._lock:
            node = self._get(node_id)
            snapshot = Blockchain.from_dict(node.chain.to_dict())  # never touch the real chain
            epoch = self._epoch
        future = self._executor.submit(self._craft_and_send, epoch, node_id, snapshot, kind)
        info = {
            "node_id": node_id,
            "kind": kind,
            "block_index": snapshot.height + 1,
            "expected_rejection": EXPECTED_REJECTION[kind],
        }
        return info, future

    def _craft_and_send(self, epoch: int, node_id: str, snapshot: Blockchain, kind: InvalidKind) -> None:
        block = craft_invalid_block(snapshot, kind, miner=node_id)  # may mine: no lock
        out: Outbox = []
        with self._lock:
            node = self._nodes.get(node_id)
            if epoch != self._epoch or node is None:
                return
            node.record("invalid_sent", invalid_kind=kind, block_index=block.index, block_hash=block.hash)
            out.append((
                "network.invalid_block_created",
                {"node_id": node_id, "kind": kind, "block_index": block.index, "block_hash": block.hash,
                 "expected_rejection": EXPECTED_REJECTION[kind]},
                None,
            ))
            self._broadcast_block(out, node, block.to_dict(), invalid_kind=kind)
        self._flush(out)

    # ------------------------------------------------------------------ #
    # Messaging
    # ------------------------------------------------------------------ #
    def _others(self, node: Node) -> list[Node]:
        return [n for n in self._nodes.values() if n.id != node.id]

    def _peers(self, node: Node) -> list[Node]:
        """Nodes this node can currently reach."""
        return [n for n in self._others(node) if self._unreachable(node, n) is None]

    @staticmethod
    def _unreachable(sender: Node, receiver: Node) -> str | None:
        if not sender.online:
            return "sender_offline"
        if not receiver.online:
            return "receiver_offline"
        if sender.group != receiver.group:
            return "partitioned"
        return None

    def _sample_latency(self) -> float:
        ms = self.latency_ms + self._rng.uniform(-self.jitter_ms, self.jitter_ms)
        return max(0.0, ms) / 1000

    def _send(self, out: Outbox, kind: str, sender: Node, receiver: Node, deliver: Deliver, **meta: Any) -> None:
        message_id = f"m{next(self._message_ids)}"
        base = {"message_id": message_id, "kind": kind, "from_node": sender.id, "to_node": receiver.id}
        reason = self._unreachable(sender, receiver)
        if reason:
            out.append(("network.message_dropped", {**base, "reason": reason}, None))
            return
        delay = self._sample_latency()
        out.append(("network.message_sent", {**base, "latency_ms": round(delay * 1000), **meta}, None))
        epoch = self._epoch
        self._scheduler.call_later(
            delay, lambda: self._arrive(epoch, message_id, kind, sender.id, receiver.id, deliver)
        )

    def _arrive(self, epoch: int, message_id: str, kind: str, from_id: str, to_id: str, deliver: Deliver) -> None:
        out: Outbox = []
        with self._lock:
            receiver = self._nodes.get(to_id)
            sender = self._nodes.get(from_id)
            if epoch != self._epoch or receiver is None:
                return
            # Conditions may have changed while the message was in flight.
            if not receiver.online or (sender is not None and sender.group != receiver.group):
                reason = "receiver_offline" if not receiver.online else "partitioned"
                out.append(("network.message_dropped",
                            {"message_id": message_id, "kind": kind, "from_node": from_id,
                             "to_node": to_id, "reason": reason}, None))
            elif sender is not None:
                deliver(out, message_id, sender, receiver)
        self._flush(out)

    # -- blocks --------------------------------------------------------- #
    def _broadcast_block(self, out: Outbox, node: Node, block_data: dict[str, Any], invalid_kind: str | None = None) -> None:
        for peer in self._others(node):
            self._send(
                out, "block", node, peer, self._deliver_block(block_data),
                block_index=block_data["index"], block_hash=block_data["hash"], invalid_kind=invalid_kind,
            )

    def _deliver_block(self, block_data: dict[str, Any]) -> Deliver:
        def deliver(out: Outbox, message_id: str, sender: Node, receiver: Node) -> None:
            block = Block.from_dict(block_data)  # a fresh copy for this receiver
            decision = receiver.receive_block(block)
            receiver.record(
                "received", from_node=sender.id, block_index=block.index, block_hash=block.hash,
                **decision.to_dict(),
            )
            out.append((
                "network.block_received",
                {"message_id": message_id, "from_node": sender.id, "to_node": receiver.id,
                 "block_index": block.index, "block_hash": block.hash, **decision.to_dict()},
                None,
            ))
            if decision.outcome == "orphan":
                self._send_chain(out, sender, receiver, trigger_block_hash=block.hash)

        return deliver

    # -- chains (synchronisation) -------------------------------------- #
    def _send_chain(self, out: Outbox, sender: Node, receiver: Node, trigger_block_hash: str | None = None) -> None:
        """`sender` ships a snapshot of its chain to `receiver` (one-way, simplified)."""
        snapshot = sender.chain.to_dict()
        self._send(
            out, "chain", sender, receiver, self._deliver_chain(snapshot, trigger_block_hash),
            block_index=sender.height, block_hash=sender.tip_hash,
        )

    def _deliver_chain(self, snapshot: dict[str, Any], trigger_block_hash: str | None) -> Deliver:
        def deliver(out: Outbox, message_id: str, sender: Node, receiver: Node) -> None:
            candidate = Blockchain.from_dict(snapshot)  # private copy, adopted as-is if better
            result = receiver.consider_chain(candidate)
            resolved = None if trigger_block_hash is None else receiver.has_block(trigger_block_hash)
            receiver.record("sync", from_node=sender.id, trigger_block_hash=trigger_block_hash,
                            resolved=resolved, **result.to_dict())
            out.append((
                "network.sync",
                {"message_id": message_id, "node_id": receiver.id, "peer_id": sender.id,
                 "trigger_block_hash": trigger_block_hash, "resolved": resolved, **result.to_dict()},
                None,
            ))

        return deliver

    def _exchange_chains(self, out: Outbox, node: Node) -> None:
        """After reconnecting: both sides learn about each other's chain."""
        for peer in self._peers(node):
            self._send_chain(out, peer, node)
            self._send_chain(out, node, peer)

    # -- transactions -------------------------------------------------- #
    def _deliver_transaction(self, tx_data: dict[str, Any]) -> Deliver:
        def deliver(out: Outbox, message_id: str, sender: Node, receiver: Node) -> None:
            accepted = receiver.receive_transaction(Transaction.from_dict(tx_data))
            out.append((
                "network.transaction_received",
                {"message_id": message_id, "from_node": sender.id, "to_node": receiver.id,
                 "tx_id": tx_data["tx_id"], "accepted": accepted},
                None,
            ))

        return deliver

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def shutdown(self) -> None:
        with self._lock:
            for cancel in self._jobs.values():
                cancel.set()
        self._executor.shutdown(wait=True, cancel_futures=True)
        if self._owns_scheduler:
            self._scheduler.shutdown()
