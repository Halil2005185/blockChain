"""Delayed delivery of network messages (this is how latency is simulated).

``ThreadScheduler`` runs callbacks on one background thread at the right time.
``ManualScheduler`` has a fake clock that tests advance by hand, so tests about
latency, ordering and partitions are exact and never flaky.
"""

from __future__ import annotations

import heapq
import itertools
import logging
import threading
import time
from collections.abc import Callable
from typing import Protocol

logger = logging.getLogger(__name__)

Callback = Callable[[], None]


class Scheduler(Protocol):
    def call_later(self, delay: float, fn: Callback) -> None:
        """Run ``fn`` after ``delay`` seconds. Must be thread-safe."""

    def shutdown(self) -> None: ...


class ThreadScheduler:
    """A single timer thread with a priority queue of due callbacks."""

    def __init__(self) -> None:
        self._heap: list[tuple[float, int, Callback]] = []
        self._ids = itertools.count()
        self._cond = threading.Condition()
        self._stopped = False
        self._thread = threading.Thread(target=self._run, name="network-scheduler", daemon=True)
        self._thread.start()

    def call_later(self, delay: float, fn: Callback) -> None:
        with self._cond:
            if self._stopped:
                return
            heapq.heappush(self._heap, (time.monotonic() + max(0.0, delay), next(self._ids), fn))
            self._cond.notify()

    def _run(self) -> None:
        while True:
            with self._cond:
                while not self._stopped:
                    if self._heap and self._heap[0][0] <= time.monotonic():
                        break
                    timeout = self._heap[0][0] - time.monotonic() if self._heap else None
                    self._cond.wait(timeout)
                if self._stopped:
                    return
                _, _, fn = heapq.heappop(self._heap)
            try:  # run outside the condition so callbacks can schedule more work
                fn()
            except Exception:
                logger.exception("network message handler failed")

    def shutdown(self) -> None:
        with self._cond:
            self._stopped = True
            self._heap.clear()
            self._cond.notify()
        self._thread.join(timeout=2)


class ManualScheduler:
    """Fake clock for tests: nothing happens until ``advance()`` is called."""

    def __init__(self) -> None:
        self.now = 0.0
        self._heap: list[tuple[float, int, Callback]] = []
        self._ids = itertools.count()
        self._lock = threading.Lock()

    def call_later(self, delay: float, fn: Callback) -> None:
        with self._lock:
            heapq.heappush(self._heap, (self.now + max(0.0, delay), next(self._ids), fn))

    @property
    def pending(self) -> int:
        with self._lock:
            return len(self._heap)

    def advance(self, seconds: float) -> None:
        """Move the clock forward, running every callback that becomes due, in order."""
        target = self.now + seconds
        while True:
            with self._lock:
                if not self._heap or self._heap[0][0] > target:
                    break
                due, _, fn = heapq.heappop(self._heap)
                self.now = due
            fn()  # may schedule further messages; the loop picks them up
        self.now = target

    def run_until_idle(self, max_seconds: float = 3600) -> None:
        """Deliver everything, including messages that cause new messages."""
        self.advance(max_seconds)

    def shutdown(self) -> None:
        with self._lock:
            self._heap.clear()
