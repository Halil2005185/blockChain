"""Mining: either wait for the result, or start a job and poll its progress."""

import asyncio

from fastapi import APIRouter, status

from app.api.dependencies import ChainServiceDep
from app.models.common import ErrorResponse
from app.models.mining import MineRequest, MiningJobOut

router = APIRouter(prefix="/mining", tags=["mining"])

_CONFLICT = {409: {"model": ErrorResponse}}


@router.post(
    "/mine",
    response_model=MiningJobOut,
    summary="Mine a block and wait for the result",
    responses={400: {"model": ErrorResponse}, **_CONFLICT},
)
async def mine_and_wait(body: MineRequest, service: ChainServiceDep):
    """Mines pending transactions into a new block and returns when it finishes.

    The hashing runs on the miner thread; this handler just awaits it, so the
    server keeps answering other requests in the meantime.
    """
    job = service.start_mining(body.miner_address)
    # shield(): if the client disconnects, mining still completes normally.
    await asyncio.shield(asyncio.wrap_future(job.future))
    return job.to_dict()


@router.post(
    "/start",
    response_model=MiningJobOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start mining in the background",
    responses={400: {"model": ErrorResponse}, **_CONFLICT},
)
def start_mining(body: MineRequest, service: ChainServiceDep):
    """Returns immediately. Poll ``GET /api/mining/status`` to watch progress."""
    return service.start_mining(body.miner_address).to_dict()


@router.get(
    "/status",
    response_model=MiningJobOut | None,
    summary="Progress of the current (or last) mining job",
)
def mining_status(service: ChainServiceDep):
    """Returns ``null`` if nothing has been mined since the server started."""
    job = service.get_current_job()
    return job.to_dict() if job else None


@router.post(
    "/cancel",
    response_model=MiningJobOut,
    summary="Cancel the running mining job",
    responses=_CONFLICT,
)
async def cancel_mining(service: ChainServiceDep):
    """Pending transactions stay in the pool, ready for the next attempt."""
    job = service.cancel_mining()
    await asyncio.wrap_future(job.future)  # returns quickly once the miner notices
    return job.to_dict()
