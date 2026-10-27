"""How the service layer announces what happened, without knowing about WebSockets.

ChainService only depends on the tiny ``EventPublisher`` protocol below. The
WebSocket ConnectionManager implements it; tests can pass a recorder; and
without one, events go nowhere (``NullPublisher``).
"""

from __future__ import annotations

import re
from contextvars import ContextVar
from typing import Any, Protocol


class EventPublisher(Protocol):
    def publish(self, event_type: str, data: dict[str, Any], origin: str | None = None) -> None:
        """Announce an event. Must be thread-safe and must never block."""


class NullPublisher:
    def publish(self, event_type: str, data: dict[str, Any], origin: str | None = None) -> None:
        return None


# The browser tab that made the current request (from the X-Client-Id header).
# A ContextVar follows the request into the thread pool that runs sync routes.
current_origin: ContextVar[str | None] = ContextVar("current_origin", default=None)

_ORIGIN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def clean_origin(value: str | None) -> str | None:
    """Accept only short, harmless ids; anything else is treated as anonymous."""
    if value and _ORIGIN_PATTERN.fullmatch(value):
        return value
    return None
