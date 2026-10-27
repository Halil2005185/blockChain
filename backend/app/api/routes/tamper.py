"""Tampering simulation: edit history and watch validation catch it.

For learning only - a real node would never let anyone edit its stored blocks.
"""

import asyncio

from fastapi import APIRouter, Path

from app.api.dependencies import ChainServiceDep
from app.models.common import ErrorResponse
from app.models.tamper import RemineRequest, RemineResponse, TamperRequest, TamperResponse

router = APIRouter(prefix="/tamper", tags=["tampering simulation"])

BlockIndex = Path(ge=0, description="Block position in the chain (genesis = 0)")


@router.patch(
    "/blocks/{index}",
    response_model=TamperResponse,
    summary="Modify a block that is already in the chain",
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def tamper_block(body: TamperRequest, service: ChainServiceDep, index: int = BlockIndex):
    """Changes data without re-mining, so the stored hash no longer matches the contents."""
    return service.tamper_block(index, **body.model_dump(exclude_none=True))


@router.post(
    "/blocks/{index}/remine",
    response_model=RemineResponse,
    summary="Re-do proof of work for a block",
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
async def remine_block(
    service: ChainServiceDep,
    index: int = BlockIndex,
    body: RemineRequest | None = None,
):
    """Makes a tampered block valid again - and breaks the link of the block after it."""
    relink = body.relink if body else True
    return await asyncio.to_thread(service.remine_block, index, relink)
