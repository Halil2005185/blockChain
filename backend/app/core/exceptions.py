"""Domain-specific exceptions.

Using our own exception types (instead of bare ValueError) lets the API layer
map each failure to a precise HTTP status code later on.
"""


class BlockchainError(Exception):
    """Base class for every error raised by the blockchain core."""


class InvalidTransactionError(BlockchainError):
    """A transaction failed validation (e.g. negative amount, empty sender)."""


class InvalidBlockError(BlockchainError):
    """A block could not be accepted into a chain (bad hash, wrong link, ...)."""
