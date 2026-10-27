"""Block and chain response schemas, plus validation reports."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.common import ApiModel, Difficulty
from app.models.transaction import TransactionOut


class BlockOut(BaseModel):
    index: int
    timestamp: float
    transactions: list[TransactionOut]
    previous_hash: str
    merkle_root: str
    data: str
    difficulty: int
    nonce: int
    hash: str
    is_genesis: bool
    hash_valid: bool = Field(
        description="Stored hash matches the contents AND meets the difficulty target"
    )


class ValidationIssueOut(BaseModel):
    index: int
    code: str = Field(examples=["hash_mismatch"])
    message: str


class ValidationReportOut(BaseModel):
    is_valid: bool
    chain_length: int
    first_invalid_index: int | None
    invalid_indices: list[int] = Field(description="Blocks that fail a check themselves")
    untrusted_indices: list[int] = Field(
        description="Every block from the first invalid one onward"
    )
    issues: list[ValidationIssueOut]


class ChainOut(BaseModel):
    difficulty: int = Field(description="Difficulty that the next mined block will use")
    mining_reward: float
    height: int
    chain: list[BlockOut]
    pending_transactions: list[TransactionOut]
    validation: ValidationReportOut


class DifficultyUpdate(ApiModel):
    difficulty: Difficulty


class ResetRequest(ApiModel):
    difficulty: Difficulty | None = Field(
        default=None, description="Difficulty for the new chain (defaults to server setting)"
    )
