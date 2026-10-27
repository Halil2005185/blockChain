"""Transaction request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, model_validator

from app.core.transaction import NETWORK_SENDER
from app.models.common import AccountName, Amount, ApiModel


class TransactionCreate(ApiModel):
    """Body of ``POST /api/transactions``. The server sets the timestamp."""

    sender: AccountName
    receiver: AccountName
    amount: Amount

    @model_validator(mode="after")
    def check_accounts(self) -> TransactionCreate:
        if self.sender == self.receiver:
            raise ValueError("sender and receiver must be different accounts")
        if self.sender == NETWORK_SENDER:
            raise ValueError(f"'{NETWORK_SENDER}' is reserved for mining rewards")
        return self


class TransactionOut(BaseModel):
    tx_id: str
    sender: str
    receiver: str
    amount: float
    timestamp: float
