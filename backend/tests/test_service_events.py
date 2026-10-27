"""ChainService event publishing, with a recording publisher instead of WebSockets."""

from __future__ import annotations

import threading
from typing import Any

import pytest

from app.core.block import MAX_DIFFICULTY
from app.services import ChainService
from app.services.events import current_origin


class Recorder:
    """Records events and checks the service lock is NOT held while publishing."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any], str | None]] = []
        self.lock_held: list[str] = []
        self.service: ChainService | None = None
        self._mutex = threading.Lock()

    def publish(self, event_type: str, data: dict[str, Any], origin: str | None = None) -> None:
        if self.service is not None and self.service._lock._is_owned():
            self.lock_held.append(event_type)
        with self._mutex:
            self.events.append((event_type, data, origin))

    def types(self) -> list[str]:
        return [t for t, _, _ in self.events]


@pytest.fixture
def recorded():
    recorder = Recorder()
    service = ChainService(difficulty=2, mining_reward=10, events=recorder)
    recorder.service = service
    yield service, recorder
    service.shutdown()


def test_lock_is_never_held_while_publishing(recorded) -> None:
    service, rec = recorded
    service.add_transaction("alice", "bob", 1)
    service.set_difficulty(2)
    service.start_mining("m").future.result(timeout=10)
    service.validate()
    service.tamper_block(1, data="x")
    service.remine_block(1)
    service.reset(difficulty=1)

    assert rec.types() == [
        "transaction.created",
        "difficulty.changed",
        "mining.started",
        *[t for t in rec.types() if t == "mining.progress"],
        "mining.completed",
        "chain.validated",
        "block.tampered",
        "block.remined",
        "chain.reset",
    ]
    assert rec.lock_held == []


def test_origin_comes_from_the_request_context(recorded) -> None:
    service, rec = recorded
    token = current_origin.set("tab-1")
    try:
        service.add_transaction("alice", "bob", 1)
        job = service.start_mining("m")
    finally:
        current_origin.reset(token)
    job.future.result(timeout=10)

    origins = {t: o for t, _, o in rec.events}
    assert origins["transaction.created"] == "tab-1"
    # Mining events are published from the worker thread, but keep the starter's origin.
    assert origins["mining.started"] == origins["mining.completed"] == "tab-1"


def test_progress_events_are_throttled(recorded) -> None:
    service, rec = recorded
    service.set_difficulty(MAX_DIFFICULTY)
    job = service.start_mining("m")
    threading.Event().wait(1.0)  # let it mine for ~1 second
    service.cancel_mining()
    job.future.result(timeout=10)

    progress = [d for t, d, _ in rec.events if t == "mining.progress"]
    assert 1 <= len(progress) <= 13  # ~10 per second at most
    attempts = [p["progress"]["attempts"] for p in progress]
    assert attempts == sorted(attempts)
    assert rec.types()[-1] == "mining.cancelled"


def test_publisher_failure_never_breaks_the_service() -> None:
    class Broken:
        def publish(self, *args, **kwargs):
            raise RuntimeError("socket layer exploded")

    service = ChainService(difficulty=1, mining_reward=1, events=Broken())
    try:
        service.add_transaction("a", "b", 1)  # must not raise
        job = service.start_mining("m")
        job.future.result(timeout=10)
        assert job.status.value == "completed"
        assert service.get_chain()["height"] == 1
    finally:
        service.shutdown()
