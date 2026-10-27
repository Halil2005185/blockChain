"""Application settings, read from environment variables.

Example (PowerShell):
    $env:BLOCKCHAIN_DIFFICULTY = "4"
    uvicorn app.main:app --reload
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from app.core.blockchain import DEFAULT_DIFFICULTY, DEFAULT_MINING_REWARD


def _origins_from_env() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    difficulty: int = field(
        default_factory=lambda: int(os.environ.get("BLOCKCHAIN_DIFFICULTY", DEFAULT_DIFFICULTY))
    )
    mining_reward: float = field(
        default_factory=lambda: float(
            os.environ.get("BLOCKCHAIN_MINING_REWARD", DEFAULT_MINING_REWARD)
        )
    )
    # The Next.js dev server (Phase 3) runs on port 3000.
    cors_origins: list[str] = field(default_factory=_origins_from_env)
    # Seconds between WebSocket heartbeats when no events are flowing.
    ws_heartbeat_interval: float = 15.0
    # Multi-node simulation defaults (low difficulty: blocks appear quickly,
    # high latency: you can watch them travel).
    network_nodes: int = 4
    network_difficulty: int = 3
    network_latency_ms: float = 800
    network_jitter_ms: float = 300
