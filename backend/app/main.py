"""FastAPI application factory.

Run the dev server (from the backend folder):
    uvicorn app.main:app --reload
Then open http://127.0.0.1:8000/docs for the interactive Swagger UI.
Real-time events: ws://127.0.0.1:8000/api/ws
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.routes import api_router, realtime
from app.config import Settings
from app.services import ChainService
from app.services.network_service import NetworkService
from app.websocket import ConnectionManager

DESCRIPTION = """
An **educational** blockchain built from scratch in Python.

All accounts and amounts are fictional. This is not a cryptocurrency and
nothing here has real value.

Suggested first tour:
1. `POST /api/transactions` - create a transaction
2. `POST /api/mining/mine` - mine it into a block
3. `GET /api/chain` - see the chain
4. `PATCH /api/tamper/blocks/1` - change history
5. `GET /api/chain/validate` - watch validation catch it
"""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    logging.basicConfig(level=logging.INFO)

    events = ConnectionManager(
        allowed_origins=settings.cors_origins,
        heartbeat_interval=settings.ws_heartbeat_interval,
    )
    chain_service = ChainService(
        difficulty=settings.difficulty,
        mining_reward=settings.mining_reward,
        events=events,
    )
    # A separate simulation: several independent nodes (Phase 6).
    network = NetworkService(
        difficulty=settings.network_difficulty,
        mining_reward=settings.mining_reward,
        node_count=settings.network_nodes,
        latency_ms=settings.network_latency_ms,
        jitter_ms=settings.network_jitter_ms,
        events=events,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        # Events published from worker threads are delivered on this loop.
        events.attach(asyncio.get_running_loop())
        yield
        chain_service.shutdown()  # stop the miner thread cleanly
        network.shutdown()
        await events.close_all()

    app = FastAPI(
        title="Interactive 3D Blockchain Explorer API",
        description=DESCRIPTION,
        version="0.5.0",
        lifespan=lifespan,
    )
    app.state.chain_service = chain_service
    app.state.events = events
    app.state.network = network

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(api_router)
    # Separate from api_router: the X-Client-Id dependency is for REST only.
    app.include_router(realtime.router, prefix="/api")
    return app


app = create_app()
