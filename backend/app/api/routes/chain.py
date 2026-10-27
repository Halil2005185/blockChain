"""Reading, validating and configuring the chain."""

import asyncio

from fastapi import APIRouter, Path

from app.api.dependencies import ChainServiceDep
from app.models.block import (
    BlockOut,
    ChainOut,
    DifficultyUpdate,
    ResetRequest,
    ValidationReportOut,
)
from app.models.common import ErrorResponse

router = APIRouter(prefix="/chain", tags=["chain"])

BlockIndex = Path(ge=0, description="Block position in the chain (genesis = 0)")


@router.get("", response_model=ChainOut, summary="Get the whole blockchain")
def get_chain(service: ChainServiceDep):
    """All blocks, pending transactions, and a validation report."""
    return service.get_chain()


@router.get(
    "/blocks/{index}",
    response_model=BlockOut,
    summary="Get one block",
    responses={404: {"model": ErrorResponse}},
)
def get_block(service: ChainServiceDep, index: int = BlockIndex):
    return service.get_block(index)


@router.get("/validate", response_model=ValidationReportOut, summary="Validate the chain")
def validate_chain(service: ChainServiceDep):
    """Re-checks every hash, link and proof of work, and lists every problem found."""
    return service.validate()


@router.put("/difficulty", summary="Set the difficulty for future blocks")
def set_difficulty(body: DifficultyUpdate, service: ChainServiceDep) -> dict[str, int]:
    """Blocks already mined keep the difficulty they were mined with."""
    return {"difficulty": service.set_difficulty(body.difficulty)}


@router.post(
    "/reset",
    response_model=ChainOut,
    summary="Start over with a fresh chain",
    responses={409: {"model": ErrorResponse}},
)
async def reset_chain(service: ChainServiceDep, body: ResetRequest | None = None):
    """Discards all blocks and pending transactions and mines a new genesis block."""
    difficulty = body.difficulty if body else None
    # Mining the new genesis is CPU work, so keep it off the event loop.
    return await asyncio.to_thread(service.reset, difficulty)
