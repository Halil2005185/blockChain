"""ConnectionManager: fans events out to every connected WebSocket client.

Design goals
------------
1. ``publish()`` never blocks. It may be called from any thread (request
   handlers, the miner thread). It validates the payload and hands it to the
   event loop with ``call_soon_threadsafe`` - nothing waits on the network.
2. A slow client can't slow anyone else down. Each client has its own bounded
   queue and its own writer task. If a queue fills up, that client is
   disconnected; its browser reconnects and catches up over REST.
3. Sequence numbers are assigned on the event-loop thread, so they are strictly
   increasing and gap-free, which lets clients detect missed events.
"""

from __future__ import annotations

import asyncio
import contextlib
import itertools
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import anyio
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError

from app.websocket.events import EVENT_PAYLOADS, EmptyData, EventEnvelope, HelloData

logger = logging.getLogger(__name__)

MAX_CLIENT_MESSAGE_BYTES = 512

# WebSocket close codes (RFC 6455 / IANA registry)
CLOSE_POLICY_VIOLATION = 1008
CLOSE_MESSAGE_TOO_BIG = 1009
CLOSE_GOING_AWAY = 1001
CLOSE_TRY_AGAIN_LATER = 1013


@dataclass(eq=False)
class _Client:
    id: int
    websocket: WebSocket
    queue: asyncio.Queue[str]
    dropped: asyncio.Event = field(default_factory=asyncio.Event)


class ConnectionManager:
    def __init__(
        self,
        *,
        allowed_origins: list[str] | None = None,
        queue_size: int = 256,
        send_timeout: float = 5.0,
        heartbeat_interval: float = 15.0,
    ) -> None:
        self._allowed_origins = set(allowed_origins or [])
        self._queue_size = queue_size
        self._send_timeout = send_timeout
        self.heartbeat_interval = heartbeat_interval
        self._clients: dict[int, _Client] = {}
        self._ids = itertools.count(1)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._seq = 0

    # ------------------------------------------------------------------ #
    # Lifecycle (called from the app lifespan)
    # ------------------------------------------------------------------ #
    def attach(self, loop: asyncio.AbstractEventLoop) -> None:
        """Remember the event loop that owns the sockets."""
        self._loop = loop

    async def close_all(self) -> None:
        for client in list(self._clients.values()):
            client.dropped.set()
            with contextlib.suppress(Exception):
                await client.websocket.close(code=CLOSE_GOING_AWAY)
        self._clients.clear()
        self._loop = None

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def last_seq(self) -> int:
        return self._seq

    # ------------------------------------------------------------------ #
    # Publishing (any thread)
    # ------------------------------------------------------------------ #
    def publish(self, event_type: str, data: dict[str, Any], origin: str | None = None) -> None:
        """Queue an event for every client. Thread-safe and non-blocking."""
        payload_model = EVENT_PAYLOADS.get(event_type)
        if payload_model is None:
            logger.error("refusing to publish unknown event type %r", event_type)
            return
        try:
            payload = payload_model.model_validate(data)
        except ValidationError:
            # Never send a malformed event; this is a server bug, log it.
            logger.exception("invalid payload for event %s", event_type)
            return

        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            loop.call_soon_threadsafe(self._fan_out, event_type, payload, origin, time.time())
        except RuntimeError:
            pass  # loop is shutting down

    def _fan_out(self, event_type: str, payload: BaseModel, origin: str | None, ts: float) -> None:
        """Runs on the event-loop thread: number the event and enqueue it."""
        self._seq += 1
        message = EventEnvelope(type=event_type, seq=self._seq, ts=ts, origin=origin, data=payload)
        text = message.model_dump_json()
        for client in list(self._clients.values()):
            self._offer(client, text)

    def _offer(self, client: _Client, text: str) -> None:
        try:
            client.queue.put_nowait(text)
        except asyncio.QueueFull:
            logger.warning("websocket client %d is too slow; disconnecting it", client.id)
            self._drop(client)

    def _control(self, event_type: str, data: BaseModel) -> str:
        """hello / heartbeat / pong: carry the latest seq without incrementing it."""
        return EventEnvelope(type=event_type, seq=self._seq, ts=time.time(), data=data).model_dump_json()

    def _drop(self, client: _Client) -> None:
        self._clients.pop(client.id, None)
        client.dropped.set()

    # ------------------------------------------------------------------ #
    # Serving one connection (event loop)
    # ------------------------------------------------------------------ #
    async def serve(self, websocket: WebSocket) -> None:
        """Handle one client from handshake to disconnect."""
        # Browsers always send Origin. Refusing unknown sites stops a random web
        # page from silently listening to this server (cross-site WebSocket hijacking).
        origin = websocket.headers.get("origin")
        if origin is not None and self._allowed_origins and origin not in self._allowed_origins:
            await websocket.close(code=CLOSE_POLICY_VIOLATION)
            return

        await websocket.accept()
        client = _Client(next(self._ids), websocket, asyncio.Queue(maxsize=self._queue_size))
        self._clients[client.id] = client
        logger.info("websocket client %d connected (%d total)", client.id, len(self._clients))

        client.queue.put_nowait(self._control("hello", HelloData(heartbeat_interval=self.heartbeat_interval)))
        try:
            # Whichever ends first (send failure, client gone, or dropped for
            # being slow) cancels the others. An AnyIO task group (Starlette's
            # own concurrency library) also unwinds correctly when the server
            # cancels this connection from outside, e.g. on shutdown.
            async with anyio.create_task_group() as tg:

                async def run_then_stop(step) -> None:
                    await step()
                    tg.cancel_scope.cancel()

                tg.start_soon(run_then_stop, lambda: self._writer(client))
                tg.start_soon(run_then_stop, lambda: self._reader(client))
                tg.start_soon(run_then_stop, client.dropped.wait)
        finally:
            was_dropped = client.dropped.is_set() and client.id not in self._clients
            self._clients.pop(client.id, None)
            logger.info("websocket client %d disconnected (%d left)", client.id, len(self._clients))
        with contextlib.suppress(Exception):
            await websocket.close(code=CLOSE_TRY_AGAIN_LATER if was_dropped else 1000)

    async def _writer(self, client: _Client) -> None:
        """Send queued messages; send a heartbeat when idle."""
        while True:
            try:
                text = await asyncio.wait_for(client.queue.get(), timeout=self.heartbeat_interval)
            except TimeoutError:
                text = self._control("heartbeat", EmptyData())
            try:
                await asyncio.wait_for(client.websocket.send_text(text), timeout=self._send_timeout)
            except (TimeoutError, WebSocketDisconnect, RuntimeError, OSError):
                return  # client is gone or stuck

    async def _reader(self, client: _Client) -> None:
        """Clients may only send {"type": "ping"}; everything else is ignored."""
        while True:
            try:
                text = await client.websocket.receive_text()
            except (WebSocketDisconnect, RuntimeError, KeyError):
                return  # disconnected (or sent a binary frame)
            if len(text.encode()) > MAX_CLIENT_MESSAGE_BYTES:
                with contextlib.suppress(Exception):
                    await client.websocket.close(code=CLOSE_MESSAGE_TOO_BIG)
                return
            try:
                message = json.loads(text)
            except ValueError:
                continue
            if isinstance(message, dict) and message.get("type") == "ping":
                self._offer(client, self._control("pong", EmptyData()))
