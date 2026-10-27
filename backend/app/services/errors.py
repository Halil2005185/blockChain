"""Errors raised by the service layer.

The core raises domain errors (InvalidTransactionError, InvalidBlockError).
Services add errors about *application state* that the core knows nothing
about, such as "that block doesn't exist" or "a mining job is already running".
"""

from app.core.exceptions import BlockchainError


class ServiceError(BlockchainError):
    """Base class for service-level errors."""


class NotFoundError(ServiceError):
    """The requested resource (block, transaction, job) does not exist."""


class ConflictError(ServiceError):
    """The request clashes with the current state (e.g. mining already running)."""


class BadRequestError(ServiceError):
    """The request is well-formed JSON but asks for something impossible
    (e.g. a network partition that leaves a node out)."""
