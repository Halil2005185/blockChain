"""Service layer: owns application state and coordinates the blockchain core.

Routes never touch a ``Blockchain`` object directly; they call a service, which
takes care of locking, background mining and error translation.
"""

from app.services.chain_service import ChainService
from app.services.errors import ConflictError, NotFoundError, ServiceError
from app.services.mining_job import MiningJob, MiningJobStatus

__all__ = [
    "ChainService",
    "ConflictError",
    "MiningJob",
    "MiningJobStatus",
    "NotFoundError",
    "ServiceError",
]
