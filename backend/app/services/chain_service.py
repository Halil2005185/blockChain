"""ChainService: the single owner of the in-memory blockchain.

Concurrency model
-----------------
* One ``RLock`` guards the ``Blockchain`` object. Every read or write takes it,
  but only for short, fast operations (snapshots, appends, edits).
* Mining runs on a dedicated worker thread and does its slow hashing *without*
  the lock, using the core's three steps:

      with lock:  candidate = chain.create_candidate_block(miner)   # fast
      no lock:    candidate.mine_block(...)                         # slow
      with lock:  chain.commit_block(candidate)                     # fast

  So other requests (reading the chain, adding transactions) never wait for
  mining to finish.
* Only one mining job runs at a time; starting another raises ConflictError.

Events
------
Every change is announced through an ``EventPublisher`` (the WebSocket
manager in production). Payloads are built under the lock, but ``publish`` is
always called *after* the lock is released. Publishing never blocks anyway,
but this keeps the lock's critical sections as small as possible.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from threading import RLock
from typing import Any

from app.core import (
    Block,
    Blockchain,
    InvalidBlockError,
    MiningCancelled,
    MiningProgress,
    MiningResult,
    Transaction,
)
from app.services.errors import ConflictError, NotFoundError
from app.services.events import EventPublisher, NullPublisher, current_origin
from app.services.mining_job import MiningJob, MiningJobStatus

logger = logging.getLogger(__name__)

# Mining reports progress up to ~60x/s; 10 updates/s is plenty for a UI.
PROGRESS_EVENT_INTERVAL = 0.1


class ChainService:
    def __init__(
        self,
        difficulty: int,
        mining_reward: float,
        events: EventPublisher | None = None,
    ) -> None:
        self._default_difficulty = difficulty
        self._mining_reward = mining_reward
        self._chain = Blockchain(difficulty=difficulty, mining_reward=mining_reward)
        self._lock = RLock()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="miner")
        self._current_job: MiningJob | None = None
        self._events: EventPublisher = events or NullPublisher()

    def _publish(self, event_type: str, data: dict[str, Any], origin: str | None = None) -> None:
        """Announce an event. Must be called WITHOUT holding self._lock."""
        try:
            self._events.publish(event_type, data, origin)
        except Exception:  # an event problem must never break a request or mining
            logger.exception("failed to publish %s", event_type)

    # ------------------------------------------------------------------ #
    # Reads
    # ------------------------------------------------------------------ #
    def get_chain(self) -> dict[str, Any]:
        """The whole chain plus a validation report, as one consistent snapshot."""
        with self._lock:
            return {**self._chain.to_dict(), "validation": self._chain.validate_chain().to_dict()}

    def get_block(self, index: int) -> dict[str, Any]:
        with self._lock:
            return self._get_block(index).to_dict()

    def validate(self) -> dict[str, Any]:
        """Explicit validation request; also tells every client the result."""
        with self._lock:
            report = self._chain.validate_chain().to_dict()
        self._publish("chain.validated", {"report": report}, current_origin.get())
        return report

    def get_pending_transactions(self) -> list[dict[str, Any]]:
        with self._lock:
            return [tx.to_dict() for tx in self._chain.pending_transactions]

    # ------------------------------------------------------------------ #
    # Writes
    # ------------------------------------------------------------------ #
    def add_transaction(self, sender: str, receiver: str, amount: float) -> dict[str, Any]:
        tx = Transaction(sender, receiver, amount)  # core validation runs here
        with self._lock:
            self._chain.add_transaction(tx)
            pending_count = len(self._chain.pending_transactions)
        created = tx.to_dict()
        self._publish(
            "transaction.created",
            {"transaction": created, "pending_count": pending_count},
            current_origin.get(),
        )
        return created

    def set_difficulty(self, difficulty: int) -> int:
        """Change the difficulty for future blocks (a running job keeps its own)."""
        with self._lock:
            self._chain.difficulty = difficulty
            value = self._chain.difficulty
        self._publish("difficulty.changed", {"difficulty": value}, current_origin.get())
        return value

    def reset(self, difficulty: int | None = None) -> dict[str, Any]:
        """Replace the chain with a brand-new one (fresh genesis, no pending txs).

        Blocking: the new genesis is mined here, so call it from a worker thread.
        """
        if self._is_mining():
            raise ConflictError("cannot reset while a block is being mined; cancel it first")
        # Build (and mine the genesis of) the new chain outside the lock.
        new_chain = Blockchain(
            difficulty=difficulty or self._default_difficulty,
            mining_reward=self._mining_reward,
        )
        with self._lock:
            if self._is_mining():
                raise ConflictError("a mining job started during the reset; cancel it first")
            self._chain = new_chain
        snapshot = self.get_chain()
        self._publish(
            "chain.reset",
            {"height": snapshot["height"], "difficulty": snapshot["difficulty"]},
            current_origin.get(),
        )
        return snapshot

    # ------------------------------------------------------------------ #
    # Mining
    # ------------------------------------------------------------------ #
    def start_mining(self, miner_address: str) -> MiningJob:
        """Create a candidate block and start mining it on the worker thread."""
        with self._lock:
            if self._is_mining():
                raise ConflictError(f"mining job {self._current_job.id} is already running")
            # Step 1 (fast, under the lock). Validates miner_address via the reward tx.
            candidate = self._chain.create_candidate_block(miner_address)
            job = MiningJob(candidate, miner_address, origin=current_origin.get())
            self._current_job = job
            # Publish "started" before the worker can publish progress for it.
            started = job.to_dict()
        self._publish("mining.started", {"job": started}, job.origin)
        job.future = self._executor.submit(self._run_job, job)
        logger.info("mining job %s started for block %d", job.id, candidate.index)
        return job

    def get_current_job(self) -> MiningJob | None:
        """The running job, or the most recent finished one."""
        return self._current_job

    def cancel_mining(self) -> MiningJob:
        job = self._current_job
        if job is None or not job.is_running:
            raise ConflictError("no mining job is running")
        job.cancel()
        return job

    def _run_job(self, job: MiningJob) -> None:
        """Worker-thread body: mine without the lock, then commit with it."""
        last_sent = 0.0

        def on_progress(progress: MiningProgress) -> None:
            nonlocal last_sent
            job.record_progress(progress)
            now = time.monotonic()
            if now - last_sent >= PROGRESS_EVENT_INTERVAL:
                last_sent = now
                self._publish("mining.progress", _progress_event(job, progress))

        try:
            result = job.block.mine_block(  # Step 2 (slow, no lock)
                progress_callback=on_progress,
                should_stop=job.cancel_event.is_set,
            )
            with self._lock:  # Step 3 (fast, under the lock)
                self._chain.commit_block(job.block)
            job.finish(MiningJobStatus.COMPLETED, result=result)
            logger.info("mining job %s completed: %s", job.id, result.hash)
        except MiningCancelled as exc:
            job.finish(MiningJobStatus.CANCELLED, error=str(exc))
        except InvalidBlockError as exc:
            # E.g. the tip block was re-mined during the tampering simulation,
            # so our candidate now points to a hash that no longer exists.
            job.finish(MiningJobStatus.FAILED, error=f"block rejected by the chain: {exc}")
        except Exception:  # never let a worker crash silently
            logger.exception("mining job %s crashed", job.id)
            # Details stay in the server log; clients only get a generic message.
            job.finish(MiningJobStatus.FAILED, error="internal error while mining")

        self._publish(f"mining.{job.status.value}", {"job": job.to_dict()}, job.origin)

    def _is_mining(self) -> bool:
        return self._current_job is not None and self._current_job.is_running

    # ------------------------------------------------------------------ #
    # Tampering simulation
    # ------------------------------------------------------------------ #
    def tamper_block(
        self,
        index: int,
        *,
        data: str | None = None,
        transaction_index: int | None = None,
        sender: str | None = None,
        receiver: str | None = None,
        amount: float | None = None,
    ) -> dict[str, Any]:
        """Edit a confirmed block in place WITHOUT re-mining it.

        The stored hash stays the same, so it stops matching the contents:
        exactly what ``validate_chain`` detects as ``hash_mismatch``.
        """
        with self._lock:
            block = self._get_block(index)
            if transaction_index is not None:
                if not 0 <= transaction_index < len(block.transactions):
                    raise NotFoundError(
                        f"block {index} has no transaction {transaction_index} "
                        f"(it has {len(block.transactions)})"
                    )
                tx = block.transactions[transaction_index]
                if sender is not None:
                    tx.sender = sender
                if receiver is not None:
                    tx.receiver = receiver
                if amount is not None:
                    tx.amount = amount
            if data is not None:
                block.data = data

            response = {
                "block": block.to_dict(),
                "stored_hash": block.hash,
                "recalculated_hash": block.calculate_hash(),
                "validation": self._chain.validate_chain().to_dict(),
            }
        self._publish("block.tampered", {"index": index, **response}, current_origin.get())
        return response

    def remine_block(self, index: int, relink: bool = True) -> dict[str, Any]:
        """Re-do proof of work for a block already in the chain.

        Blocking: call it from a worker thread. Mining happens on a *copy*
        outside the lock; the new nonce/hash are applied afterwards.
        """
        with self._lock:
            original = self._get_block(index)
            work_copy = Block.from_dict(original.to_dict())
            if relink and index > 0:
                work_copy.previous_hash = self._chain.chain[index - 1].hash

        result: MiningResult = work_copy.mine_block()

        with self._lock:
            still_there = index < len(self._chain.chain) and self._chain.chain[index] is original
            if not still_there or _contents(original) != _contents(work_copy):
                raise ConflictError(f"block {index} changed while it was being re-mined; retry")
            original.previous_hash = work_copy.previous_hash
            original.nonce = work_copy.nonce
            original.hash = work_copy.hash
            response = {
                "block": original.to_dict(),
                "result": result.to_dict(),
                "validation": self._chain.validate_chain().to_dict(),
            }
        self._publish("block.remined", {"index": index, **response}, current_origin.get())
        return response

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def shutdown(self) -> None:
        """Stop any running job and the worker thread (called on app shutdown)."""
        job = self._current_job
        if job is not None and job.is_running:
            job.cancel()
        self._executor.shutdown(wait=True, cancel_futures=True)

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _get_block(self, index: int) -> Block:
        try:
            return self._chain.get_block(index)
        except IndexError as exc:
            raise NotFoundError(str(exc)) from exc


def _progress_event(job: MiningJob, progress: MiningProgress) -> dict[str, Any]:
    return {
        "job_id": job.id,
        "block_index": job.block.index,
        "difficulty": job.block.difficulty,
        "target_prefix": "0" * job.block.difficulty,
        "expected_attempts": progress.expected_attempts,
        "progress": {
            "nonce": progress.nonce,
            "current_hash": progress.current_hash,
            "attempts": progress.attempts,
            "elapsed_seconds": progress.elapsed_seconds,
            "hashes_per_second": progress.hashes_per_second,
        },
    }


def _contents(block: Block) -> dict[str, Any]:
    """Header fields that re-mining must not change (everything but link and nonce)."""
    header = block.header()
    del header["nonce"], header["previous_hash"]
    return header
