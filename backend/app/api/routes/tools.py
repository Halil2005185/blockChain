"""Stateless sandbox tools for the lessons. Nothing here touches any chain."""

import asyncio
import threading

from fastapi import APIRouter

from app.core import Block, MiningCancelled, MiningProgress, Transaction, sha256_hex
from app.core.hashing import meets_difficulty
from app.core.merkle import merkle_levels
from app.models.common import ErrorResponse
from app.models.tools import (
    BlockHashPreviewRequest,
    BlockHashPreviewResponse,
    MerkleRequest,
    MerkleResponse,
    MinePreviewRequest,
    MinePreviewResponse,
    Sha256Request,
    Sha256Response,
)
from app.services.errors import ConflictError

# Bad luck can make a search run long; stop after ~6x the difficulty-5 average.
MAX_PREVIEW_ATTEMPTS = 6_000_000
SAMPLE_ATTEMPTS = 8
# One sandbox search at a time, so a busy lesson can't starve the real miners.
_preview_slot = threading.Semaphore(1)

router = APIRouter(prefix="/tools", tags=["hashing tools"])


@router.post("/sha256", response_model=Sha256Response, summary="Hash any text with SHA-256")
def hash_text(body: Sha256Request):
    return {"text": body.text, "hash": sha256_hex(body.text)}


@router.post(
    "/block-hash",
    response_model=BlockHashPreviewResponse,
    summary="Preview the hash of a hypothetical block",
    responses={400: {"model": ErrorResponse}},
)
def preview_block_hash(body: BlockHashPreviewRequest):
    """Change any field (or the nonce) and see how the hash reacts. Nothing is stored."""
    block = Block(
        index=body.index,
        timestamp=body.timestamp,
        transactions=[Transaction(**tx.model_dump()) for tx in body.transactions],
        previous_hash=body.previous_hash,
        difficulty=body.difficulty,
        nonce=body.nonce,
        data=body.data,
    )
    return {
        "hash": block.hash,
        "merkle_root": block.merkle_root,
        "target_prefix": "0" * block.difficulty,
        "meets_target": meets_difficulty(block.hash, block.difficulty),
    }


@router.post("/merkle", response_model=MerkleResponse, summary="Build a Merkle tree")
def merkle_tree(body: MerkleRequest):
    """Every level of the tree for these (hypothetical) transactions."""
    leaves = [Transaction(**tx.model_dump()).tx_id for tx in body.transactions]
    levels = merkle_levels(leaves)
    return {"leaves": leaves, "levels": levels, "root": levels[-1][0]}


@router.post(
    "/mine-preview",
    response_model=MinePreviewResponse,
    summary="Mine a sandbox block (nothing is stored)",
    responses={409: {"model": ErrorResponse}},
)
async def mine_preview(body: MinePreviewRequest):
    """Proof of work on a throwaway block: shows attempts and time per difficulty."""
    if not _preview_slot.acquire(blocking=False):
        raise ConflictError("another sandbox search is running; try again in a moment")
    try:
        return await asyncio.to_thread(_mine_sandbox, body.data, body.difficulty)
    finally:
        _preview_slot.release()


def _mine_sandbox(data: str, difficulty: int) -> dict:
    block = Block(index=1, transactions=[], previous_hash="0" * 64, difficulty=difficulty, timestamp=0.0, data=data)

    # The first few attempts, exactly as the miner tries them (nonce 0, 1, 2, ...).
    samples = []
    for nonce in range(SAMPLE_ATTEMPTS):
        block.nonce = nonce
        candidate = block.calculate_hash()
        samples.append({"nonce": nonce, "hash": candidate, "meets_target": meets_difficulty(candidate, difficulty)})
    block.nonce = 0

    attempts = 0

    def track(progress: MiningProgress) -> None:
        nonlocal attempts
        attempts = progress.attempts

    try:
        result = block.mine_block(
            progress_callback=track,
            progress_interval=20_000,
            should_stop=lambda: attempts >= MAX_PREVIEW_ATTEMPTS,
        )
    except MiningCancelled:
        return {
            "found": False, "nonce": None, "hash": None, "attempts": attempts,
            "duration_seconds": 0.0, "hashes_per_second": 0.0, "difficulty": difficulty,
            "target_prefix": "0" * difficulty, "expected_attempts": 16**difficulty,
            "first_attempts": samples,
        }
    return {
        "found": True,
        "nonce": result.nonce,
        "hash": result.hash,
        "attempts": result.attempts,
        "duration_seconds": result.duration_seconds,
        "hashes_per_second": result.hashes_per_second,
        "difficulty": difficulty,
        "target_prefix": "0" * difficulty,
        "expected_attempts": 16**difficulty,
        "first_attempts": samples,
    }
