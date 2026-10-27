"""Schemas for the multi-node network simulation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.block import BlockOut, ValidationReportOut
from app.models.common import AccountName, ApiModel
from app.models.transaction import TransactionOut

NodeId = Field(pattern=r"^node-\d{1,3}$", examples=["node-1"])


class NodeSummaryOut(BaseModel):
    id: str
    name: str
    online: bool
    group: str = Field(description="Partition group; nodes only reach nodes in the same group")
    height: int
    tip_hash: str
    total_work: int = Field(description="Sum of 16^difficulty over all blocks (expected hashes)")
    chain_valid: bool
    pending_count: int
    mining: bool
    behind_by: int = Field(description="Blocks behind the network's most-work chain")
    in_sync: bool = Field(description="Same tip as the network's most-work chain")


class NodeDetailOut(NodeSummaryOut):
    chain: list[BlockOut]
    validation: ValidationReportOut
    pending_transactions: list[TransactionOut]
    history: list[dict[str, Any]] = Field(description="Recent things this node did or received, newest first")


class NetworkStatusOut(BaseModel):
    nodes: list[NodeSummaryOut]
    difficulty: int
    mining_reward: float
    latency_ms: float
    jitter_ms: float
    max_nodes: int
    best_height: int
    best_tip_hash: str
    in_consensus: bool = Field(description="All online nodes have the same tip")
    partitioned: bool
    rules: list[str]
    limitations: list[str]


class CreateNodeRequest(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=24, examples=["Node E"])


class ConnectionUpdate(ApiModel):
    online: bool


class LatencyUpdate(ApiModel):
    latency_ms: float = Field(ge=0, le=5_000, examples=[800])
    jitter_ms: float = Field(default=0, ge=0, le=2_000, examples=[300])


class PartitionRequest(ApiModel):
    groups: list[list[str]] = Field(
        min_length=2, examples=[[["node-1", "node-2"], ["node-3", "node-4"]]],
        description="Every node in exactly one group",
    )


class NetworkResetRequest(ApiModel):
    node_count: int = Field(default=4, ge=1, le=8)
    difficulty: int | None = Field(default=None, ge=1, le=5)


class NodeMineRequest(ApiModel):
    miner_address: AccountName | None = Field(default=None, description="Defaults to the node id")


class InvalidBlockRequest(ApiModel):
    kind: Literal["tampered", "no_work", "inflated_reward", "unknown_parent"]


class MiningTicketOut(BaseModel):
    node_id: str
    block_index: int
    difficulty: int


class InvalidBlockOut(BaseModel):
    node_id: str
    kind: str
    block_index: int
    expected_rejection: str
