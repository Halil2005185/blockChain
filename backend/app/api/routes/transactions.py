"""Creating and listing pending transactions."""

from fastapi import APIRouter, status

from app.api.dependencies import ChainServiceDep
from app.models.common import ErrorResponse
from app.models.transaction import TransactionCreate, TransactionOut

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("/pending", response_model=list[TransactionOut], summary="List pending transactions")
def list_pending(service: ChainServiceDep):
    """Transactions waiting to be included in the next mined block."""
    return service.get_pending_transactions()


@router.post(
    "",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a transaction",
    responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def create_transaction(body: TransactionCreate, service: ChainServiceDep):
    """Adds a transaction between two fictional accounts to the pending pool."""
    return service.add_transaction(body.sender, body.receiver, body.amount)
