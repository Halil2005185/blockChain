"""Schemas for stateless hashing tools used by the learning UI."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.common import AccountName, Amount, ApiModel, Difficulty, HashHex


class Sha256Request(ApiModel):
    # No whitespace stripping here: "abc" and "abc " must hash differently.
    # (Pydantic merges this with the parent's config, so extra="forbid" stays.)
    model_config = ConfigDict(str_strip_whitespace=False)

    text: str = Field(max_length=10_000, examples=["hello"])


class Sha256Response(BaseModel):
    text: str
    hash: str


class PreviewTransaction(ApiModel):
    sender: AccountName
    receiver: AccountName
    amount: Amount
    timestamp: float = Field(default=0.0, examples=[0.0])


class BlockHashPreviewRequest(ApiModel):
    """A hypothetical block. Nothing is stored; only the hash is computed."""

    index: int = Field(default=1, ge=0)
    timestamp: float = Field(default=0.0)
    previous_hash: HashHex = Field(default="0" * 64)
    data: str = Field(default="", max_length=1_000)
    nonce: int = Field(default=0, ge=0)
    difficulty: Difficulty = 3
    transactions: list[PreviewTransaction] = Field(default_factory=list, max_length=100)


class BlockHashPreviewResponse(BaseModel):
    hash: str
    merkle_root: str
    target_prefix: str
    meets_target: bool


class MerkleRequest(ApiModel):
    """Hypothetical transactions; returns every level of their Merkle tree."""

    transactions: list[PreviewTransaction] = Field(min_length=1, max_length=64)


class MerkleResponse(BaseModel):
    leaves: list[str] = Field(description="Transaction ids (the tree's bottom level)")
    levels: list[list[str]] = Field(description="Leaves first, root last")
    root: str


class MinePreviewRequest(ApiModel):
    """A sandbox block to mine. Nothing is stored and the real chain is untouched."""

    data: str = Field(default="hello, proof of work", max_length=200)
    # Capped at 5: ~1 million attempts on average is a few seconds in Python.
    difficulty: int = Field(default=3, ge=1, le=5)


class NonceAttempt(BaseModel):
    nonce: int
    hash: str
    meets_target: bool


class MinePreviewResponse(BaseModel):
    found: bool = Field(description="False if the attempt limit was reached first (bad luck)")
    nonce: int | None
    hash: str | None
    attempts: int
    duration_seconds: float
    hashes_per_second: float
    difficulty: int
    target_prefix: str
    expected_attempts: int
    first_attempts: list[NonceAttempt] = Field(description="The first nonces tried, to show the search")
