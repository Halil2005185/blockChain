"""Concurrency tests for ChainService, without HTTP in the way."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from app.core.block import MAX_DIFFICULTY
from app.services import ChainService, ConflictError, MiningJobStatus


@pytest.fixture
def svc():
    service = ChainService(difficulty=3, mining_reward=10)
    yield service
    service.shutdown()


def test_no_transaction_is_lost_during_concurrent_mining(svc: ChainService) -> None:
    """8 threads add 200 transactions while blocks are mined back to back."""

    def submit(worker: int) -> None:
        for i in range(25):
            svc.add_transaction(f"user-{worker}", "shop", i + 1)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(submit, w) for w in range(8)]
        while not all(f.done() for f in futures):
            svc.start_mining("miner").future.result(timeout=30)
        for f in futures:
            f.result()  # re-raise any error from the worker threads
    svc.start_mining("miner").future.result(timeout=30)  # sweep up the rest

    chain = svc.get_chain()
    confirmed = [
        tx["tx_id"]
        for block in chain["chain"]
        for tx in block["transactions"]
        if tx["sender"] != "NETWORK"
    ]
    assert len(confirmed) == 200
    assert len(set(confirmed)) == 200  # nothing duplicated
    assert chain["pending_transactions"] == []
    assert chain["validation"]["is_valid"]


def test_concurrent_start_requests_only_one_wins(svc: ChainService) -> None:
    svc.set_difficulty(MAX_DIFFICULTY)

    def try_start():
        try:
            return svc.start_mining("m")
        except ConflictError:
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: try_start(), range(8)))

    started = [job for job in results if job is not None]
    assert len(started) == 1
    svc.cancel_mining().future.result(timeout=5)
    assert started[0].status is MiningJobStatus.CANCELLED


def test_shutdown_cancels_running_job() -> None:
    # Start low: the constructor mines the genesis block at this difficulty.
    service = ChainService(difficulty=2, mining_reward=1)
    service.set_difficulty(MAX_DIFFICULTY)
    job = service.start_mining("m")
    service.shutdown()
    assert job.status is MiningJobStatus.CANCELLED
