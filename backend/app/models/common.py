"""Reusable field types and the shared error response shape."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.block import HASH_LENGTH, MAX_DIFFICULTY, MIN_DIFFICULTY
from app.core.transaction import MAX_ACCOUNT_NAME_LENGTH, MAX_AMOUNT

# Limits come from the core so the API and the core can never disagree.
AccountName = Annotated[
    str,
    Field(
        min_length=1,
        max_length=MAX_ACCOUNT_NAME_LENGTH,
        description="Fictional account name, e.g. 'alice'",
        examples=["alice"],
    ),
]
Amount = Annotated[
    float,
    Field(
        gt=0,
        le=MAX_AMOUNT,
        allow_inf_nan=False,
        description="Fictional units (no real value)",
        examples=[25],
    ),
]
Difficulty = Annotated[
    int,
    Field(
        ge=MIN_DIFFICULTY,
        le=MAX_DIFFICULTY,
        description="Number of leading zeros the block hash must have",
        examples=[3],
    ),
]
HashHex = Annotated[
    str,
    Field(
        pattern=rf"^[0-9a-f]{{{HASH_LENGTH}}}$",
        description="64-character lowercase hex SHA-256 hash",
    ),
]


class ApiModel(BaseModel):
    """Base for request models: trim whitespace and reject unknown fields."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class ErrorBody(BaseModel):
    code: str = Field(examples=["invalid_transaction"])
    message: str = Field(examples=["sender and receiver must be different accounts"])
    details: Any | None = None


class ErrorResponse(BaseModel):
    """Every error the API returns has this shape."""

    error: ErrorBody
