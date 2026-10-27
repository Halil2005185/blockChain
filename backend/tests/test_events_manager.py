"""ConnectionManager unit tests with fake sockets (no HTTP server)."""

from __future__ import annotations

import asyncio
import json
import threading
import time

from app.websocket import ConnectionManager

TX = {
    "transaction": {"tx_id": "a" * 64, "sender": "a", "receiver": "b", "amount": 1.0, "timestamp": 1.0},
    "pending_count": 1,
}


class FakeSocket:
    """Mimics the parts of starlette's WebSocket the manager uses."""

    def __init__(self, *, stuck: bool = False) -> None:
        self.headers: dict[str, str] = {}
        self.sent: list[dict] = []
        self.closed_with: int | None = None
        self.stuck = stuck
        self._incoming: asyncio.Queue[str] = asyncio.Queue()

    async def accept(self) -> None:
        pass

    async def send_text(self, text: str) -> None:
        if self.stuck:
            await asyncio.Event().wait()  # never returns: a frozen client
        self.sent.append(json.loads(text))

    async def receive_text(self) -> str:
        return await self._incoming.get()

    async def close(self, code: int = 1000) -> None:
        self.closed_with = code


async def until(predicate, timeout: float = 3.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.005)


def run(coro):
    return asyncio.run(coro)


def test_stuck_client_is_dropped_without_blocking_publishers() -> None:
    async def scenario():
        manager = ConnectionManager(queue_size=10, send_timeout=30)
        manager.attach(asyncio.get_running_loop())
        stuck, healthy = FakeSocket(stuck=True), FakeSocket()
        tasks = [asyncio.create_task(manager.serve(s)) for s in (stuck, healthy)]
        await until(lambda: manager.client_count == 2)

        # Publish from another thread, like the miner does, with small gaps
        # (as real traffic has): a healthy client drains its queue between
        # events, the frozen one never does. Only the publish calls are timed.
        def publish_many() -> float:
            spent = 0.0
            for _ in range(50):
                start = time.perf_counter()
                manager.publish("transaction.created", TX)
                spent += time.perf_counter() - start
                time.sleep(0.002)
            return spent

        elapsed = await asyncio.to_thread(publish_many)
        await until(lambda: len([m for m in healthy.sent if m["type"] == "transaction.created"]) == 50)
        await until(lambda: stuck.closed_with is not None)

        assert elapsed < 0.5  # publishing never waited on the frozen client
        assert stuck.closed_with == 1013  # "try again later": it will reconnect
        assert manager.client_count == 1
        seqs = [m["seq"] for m in healthy.sent if m["type"] == "transaction.created"]
        assert seqs == list(range(1, 51))

        await manager.close_all()
        await asyncio.gather(*tasks, return_exceptions=True)

    run(scenario())


def test_invalid_or_unknown_events_are_never_sent() -> None:
    async def scenario():
        manager = ConnectionManager()
        manager.attach(asyncio.get_running_loop())
        sock = FakeSocket()
        task = asyncio.create_task(manager.serve(sock))
        await until(lambda: len(sock.sent) == 1)  # hello

        manager.publish("not.a.real.event", {})
        manager.publish("transaction.created", {"transaction": {"tx_id": 5}})  # malformed
        manager.publish("difficulty.changed", {"difficulty": 4})
        await until(lambda: len(sock.sent) == 2)
        await asyncio.sleep(0.05)

        assert [m["type"] for m in sock.sent] == ["hello", "difficulty.changed"]
        assert manager.last_seq == 1  # rejected events didn't consume a seq
        await manager.close_all()
        await asyncio.gather(task, return_exceptions=True)

    run(scenario())


def test_publish_without_a_loop_is_a_no_op() -> None:
    ConnectionManager().publish("difficulty.changed", {"difficulty": 2})  # must not raise


def test_heartbeat_when_idle() -> None:
    async def scenario():
        manager = ConnectionManager(heartbeat_interval=0.05)
        manager.attach(asyncio.get_running_loop())
        sock = FakeSocket()
        task = asyncio.create_task(manager.serve(sock))
        await until(lambda: any(m["type"] == "heartbeat" for m in sock.sent))
        hello, heartbeat = sock.sent[0], next(m for m in sock.sent if m["type"] == "heartbeat")
        assert hello["data"] == {"heartbeat_interval": 0.05}
        assert heartbeat["seq"] == 0 and heartbeat["data"] == {}
        await manager.close_all()
        await asyncio.gather(task, return_exceptions=True)

    run(scenario())


def test_publish_is_safe_from_many_threads() -> None:
    async def scenario():
        manager = ConnectionManager(queue_size=1000)
        manager.attach(asyncio.get_running_loop())
        sock = FakeSocket()
        task = asyncio.create_task(manager.serve(sock))
        await until(lambda: manager.client_count == 1)

        def worker():
            for _ in range(100):
                manager.publish("difficulty.changed", {"difficulty": 2})

        threads = [threading.Thread(target=worker) for _ in range(8)]
        await asyncio.to_thread(lambda: ([t.start() for t in threads], [t.join() for t in threads]))
        await until(lambda: len(sock.sent) == 801)

        seqs = [m["seq"] for m in sock.sent[1:]]
        assert seqs == list(range(1, 801))  # unique and gap-free across threads
        await manager.close_all()
        await asyncio.gather(task, return_exceptions=True)

    run(scenario())
