"""A single background mining run and its live status.

The worker thread writes progress into the job; request handlers read it.
A small per-job lock keeps those reads and writes consistent.
"""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import Future
from enum import StrEnum
from typing import Any

from app.core.block import Block, MiningProgress, MiningResult


class MiningJobStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class MiningJob:
    """Tracks one candidate block while a worker thread mines it."""

    def __init__(self, block: Block, miner_address: str, origin: str | None = None) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.block = block
        self.miner_address = miner_address
        # The browser tab that started the job; stamped on its events.
        self.origin = origin
        self.started_at = time.time()
        self.finished_at: float | None = None
        self.status = MiningJobStatus.RUNNING
        self.progress: MiningProgress | None = None
        self.result: MiningResult | None = None
        self.error: str | None = None

        # Set by cancel(); polled by Block.mine_block() through should_stop.
        self.cancel_event = threading.Event()
        # Completed by the worker thread; lets async request handlers await it.
        self.future: Future[None] | None = None
        self._lock = threading.Lock()

    # Called from the worker thread ------------------------------------- #
    def record_progress(self, progress: MiningProgress) -> None:
        with self._lock:
            self.progress = progress

    def finish(
        self,
        status: MiningJobStatus,
        result: MiningResult | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            self.status = status
            self.result = result
            self.error = error
            self.finished_at = time.time()

    # Called from request handlers -------------------------------------- #
    @property
    def is_running(self) -> bool:
        return self.status is MiningJobStatus.RUNNING

    def cancel(self) -> None:
        self.cancel_event.set()

    def to_dict(self) -> dict[str, Any]:
        with self._lock:
            progress = self.progress
            completed = self.status is MiningJobStatus.COMPLETED
            return {
                "id": self.id,
                "status": self.status.value,
                "miner_address": self.miner_address,
                "block_index": self.block.index,
                "difficulty": self.block.difficulty,
                "target_prefix": "0" * self.block.difficulty,
                "expected_attempts": 16**self.block.difficulty,
                "transaction_count": len(self.block.transactions),
                "progress": None
                if progress is None
                else {
                    "nonce": progress.nonce,
                    "current_hash": progress.current_hash,
                    "attempts": progress.attempts,
                    "elapsed_seconds": progress.elapsed_seconds,
                    "hashes_per_second": progress.hashes_per_second,
                },
                "result": self.result.to_dict() if self.result else None,
                # Only expose the block once it is final and in the chain.
                "block": self.block.to_dict() if completed else None,
                "error": self.error,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
            }
