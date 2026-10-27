"""The WebSocket message contract.

Every message the server sends has the same envelope:

    {"type": "mining.progress", "seq": 42, "ts": 1793030400.12,
     "origin": "tab-3f9c...", "data": {...}}

* ``type``   - what happened (see ``EventType``)
* ``seq``    - increases by one for every *event*. Control messages (hello,
               heartbeat, pong) carry the latest seq without incrementing it,
               so a client can always detect that it missed something.
* ``ts``     - server time (Unix seconds)
* ``origin`` - the X-Client-Id of the browser tab that caused the event, or
               null (e.g. mining progress has no single requester)
* ``data``   - a payload validated against ``EVENT_PAYLOADS[type]``

Payloads reuse the REST response models, so a block or a job looks exactly the
same whether it arrives over REST or over the WebSocket.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, SerializeAsAny

from app.models.block import BlockOut, ValidationReportOut
from app.models.mining import MiningJobOut, MiningProgressOut, MiningResultOut
from app.models.transaction import TransactionOut

ControlType = Literal["hello", "heartbeat", "pong"]
EventType = Literal[
    "transaction.created",
    "difficulty.changed",
    "chain.reset",
    "chain.validated",
    "mining.started",
    "mining.progress",
    "mining.completed",
    "mining.cancelled",
    "mining.failed",
    "block.tampered",
    "block.remined",
    # Multi-node network simulation
    "network.changed",
    "network.node_status",
    "network.mining_started",
    "network.block_mined",
    "network.mining_stale",
    "network.message_sent",
    "network.message_dropped",
    "network.block_received",
    "network.sync",
    "network.transaction_received",
    "network.invalid_block_created",
]


# ------------------------------------------------------------------ payloads
class HelloData(BaseModel):
    heartbeat_interval: float
    """Seconds between heartbeats; a client may treat ~2.5x this as a dead link."""


class EmptyData(BaseModel):
    pass


class TransactionCreatedData(BaseModel):
    transaction: TransactionOut
    pending_count: int


class DifficultyChangedData(BaseModel):
    difficulty: int


class ChainResetData(BaseModel):
    height: int
    difficulty: int


class ChainValidatedData(BaseModel):
    report: ValidationReportOut


class MiningJobData(BaseModel):
    """mining.started / completed / cancelled / failed carry the full job."""

    job: MiningJobOut


class MiningProgressData(BaseModel):
    job_id: str
    block_index: int
    difficulty: int
    target_prefix: str
    expected_attempts: int
    progress: MiningProgressOut


class BlockTamperedData(BaseModel):
    index: int
    stored_hash: str
    recalculated_hash: str
    block: BlockOut
    validation: ValidationReportOut


class BlockReminedData(BaseModel):
    index: int
    block: BlockOut
    result: MiningResultOut
    validation: ValidationReportOut


# ------------------------------------------------------------ network payloads
class ValidationIssueData(BaseModel):
    index: int
    code: str
    message: str


class NetworkChangedData(BaseModel):
    """Topology or settings changed; clients should reload GET /api/network."""

    change: Literal["node_added", "node_removed", "partitioned", "healed", "latency", "reset"]
    node_id: str | None = None


class NodeStatusData(BaseModel):
    node_id: str
    online: bool
    group: str


class NodeMiningStartedData(BaseModel):
    node_id: str
    block_index: int
    difficulty: int


class NodeBlockMinedData(BaseModel):
    node_id: str
    block_index: int
    block_hash: str
    attempts: int
    duration_seconds: float


class NodeMiningStaleData(BaseModel):
    node_id: str
    block_index: int
    reason: str


MessageKind = Literal["block", "chain", "transaction"]


class MessageSentData(BaseModel):
    """A message left a node; it arrives after `latency_ms` (drives the animation)."""

    message_id: str
    kind: MessageKind
    from_node: str
    to_node: str
    latency_ms: int
    block_index: int | None = None
    block_hash: str | None = None
    tx_id: str | None = None
    invalid_kind: str | None = None


class MessageDroppedData(BaseModel):
    message_id: str
    kind: MessageKind
    from_node: str
    to_node: str
    reason: Literal["sender_offline", "receiver_offline", "partitioned"]


class BlockReceivedData(BaseModel):
    message_id: str
    from_node: str
    to_node: str
    block_index: int
    block_hash: str
    outcome: Literal["accepted", "rejected", "duplicate", "orphan", "stale"]
    reasons: list[ValidationIssueData]
    height: int


class NodeSyncData(BaseModel):
    message_id: str
    node_id: str
    peer_id: str
    adopted: bool
    reason: Literal["more_work", "not_more_work", "invalid_chain", "different_genesis", "low_difficulty"]
    old_height: int
    new_height: int
    reorg_depth: int
    returned_transactions: int
    issues: list[ValidationIssueData]
    trigger_block_hash: str | None = None
    resolved: bool | None = None


class TransactionReceivedData(BaseModel):
    message_id: str
    from_node: str
    to_node: str
    tx_id: str
    accepted: bool


class InvalidBlockCreatedData(BaseModel):
    node_id: str
    kind: str
    block_index: int
    block_hash: str
    expected_rejection: str


EVENT_PAYLOADS: dict[str, type[BaseModel]] = {
    "network.changed": NetworkChangedData,
    "network.node_status": NodeStatusData,
    "network.mining_started": NodeMiningStartedData,
    "network.block_mined": NodeBlockMinedData,
    "network.mining_stale": NodeMiningStaleData,
    "network.message_sent": MessageSentData,
    "network.message_dropped": MessageDroppedData,
    "network.block_received": BlockReceivedData,
    "network.sync": NodeSyncData,
    "network.transaction_received": TransactionReceivedData,
    "network.invalid_block_created": InvalidBlockCreatedData,
    "transaction.created": TransactionCreatedData,
    "difficulty.changed": DifficultyChangedData,
    "chain.reset": ChainResetData,
    "chain.validated": ChainValidatedData,
    "mining.started": MiningJobData,
    "mining.progress": MiningProgressData,
    "mining.completed": MiningJobData,
    "mining.cancelled": MiningJobData,
    "mining.failed": MiningJobData,
    "block.tampered": BlockTamperedData,
    "block.remined": BlockReminedData,
}


class EventEnvelope(BaseModel):
    type: EventType | ControlType
    seq: int
    ts: float
    origin: str | None = None
    # SerializeAsAny: serialize the actual payload model's fields. With a plain
    # `BaseModel` annotation, Pydantic v2 would serialize it as {}.
    data: SerializeAsAny[BaseModel]
