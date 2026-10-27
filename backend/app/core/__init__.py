"""Blockchain core: pure Python domain logic with no web/framework dependencies.

Everything in this package can be used (and tested) without FastAPI. The API
layer added in later phases only wraps these classes.
"""

from app.core.block import Block, MiningCancelled, MiningProgress, MiningResult
from app.core.blockchain import Blockchain, BlockValidationIssue, ChainValidationResult
from app.core.exceptions import (
    BlockchainError,
    InvalidBlockError,
    InvalidTransactionError,
)
from app.core.hashing import sha256_hex
from app.core.merkle import compute_merkle_root
from app.core.transaction import Transaction

__all__ = [
    "Block",
    "Blockchain",
    "BlockValidationIssue",
    "BlockchainError",
    "ChainValidationResult",
    "InvalidBlockError",
    "InvalidTransactionError",
    "MiningCancelled",
    "MiningProgress",
    "MiningResult",
    "Transaction",
    "compute_merkle_root",
    "sha256_hex",
]
