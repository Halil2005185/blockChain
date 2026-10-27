"""Schemas for the tampering simulation."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.models.block import BlockOut, ValidationReportOut
from app.models.common import AccountName, Amount, ApiModel
from app.models.mining import MiningResultOut


class TamperRequest(ApiModel):
    """Change a block that is already in the chain.

    Edit the block's free-text ``data``, and/or one transaction chosen by
    ``transaction_index`` (its position inside the block, starting at 0).
    """

    data: str | None = Field(default=None, max_length=1_000, examples=["rewritten history"])
    transaction_index: int | None = Field(default=None, ge=0, examples=[1])
    sender: AccountName | None = None
    receiver: AccountName | None = None
    amount: Amount | None = Field(default=None, examples=[1_000_000])

    @model_validator(mode="after")
    def check_something_changes(self) -> TamperRequest:
        tx_fields = (self.sender, self.receiver, self.amount)
        if any(value is not None for value in tx_fields) and self.transaction_index is None:
            raise ValueError("transaction_index is required when editing a transaction")
        if self.data is None and all(value is None for value in tx_fields):
            raise ValueError("nothing to change: provide data and/or transaction fields")
        return self


class TamperResponse(BaseModel):
    block: BlockOut
    stored_hash: str = Field(description="The hash saved when the block was mined")
    recalculated_hash: str = Field(description="The hash of the block's contents right now")
    validation: ValidationReportOut


class RemineRequest(ApiModel):
    relink: bool = Field(
        default=True,
        description=(
            "Point the block at its predecessor's *current* hash before mining. "
            "This is what an attacker does to repair links after tampering."
        ),
    )


class RemineResponse(BaseModel):
    block: BlockOut
    result: MiningResultOut
    validation: ValidationReportOut
