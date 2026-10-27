"""Mining request/response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.block import BlockOut
from app.models.common import AccountName, ApiModel


class MineRequest(ApiModel):
    miner_address: AccountName = Field(
        description="Fictional account that receives the mining reward",
        examples=["miner-1"],
    )


class MiningProgressOut(BaseModel):
    nonce: int
    current_hash: str
    attempts: int
    elapsed_seconds: float
    hashes_per_second: float


class MiningResultOut(BaseModel):
    nonce: int
    hash: str
    attempts: int
    duration_seconds: float
    difficulty: int
    hashes_per_second: float


class MiningJobOut(BaseModel):
    id: str
    status: Literal["running", "completed", "cancelled", "failed"]
    miner_address: str
    block_index: int = Field(description="Index the block will have once added")
    difficulty: int
    target_prefix: str = Field(description="What the hash must start with, e.g. '000'")
    expected_attempts: int = Field(description="Average attempts needed: 16^difficulty")
    transaction_count: int
    progress: MiningProgressOut | None
    result: MiningResultOut | None
    block: BlockOut | None
    error: str | None
    started_at: float
    finished_at: float | None
