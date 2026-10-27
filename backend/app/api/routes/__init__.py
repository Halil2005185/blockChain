"""All REST routers, combined into one ``api_router`` mounted at /api."""

from fastapi import APIRouter, Depends

from app.api.dependencies import capture_origin
from app.api.routes import chain, health, mining, network, tamper, tools, transactions

# capture_origin runs for every REST request (reads the X-Client-Id header).
api_router = APIRouter(prefix="/api", dependencies=[Depends(capture_origin)])
api_router.include_router(health.router)
api_router.include_router(chain.router)
api_router.include_router(transactions.router)
api_router.include_router(mining.router)
api_router.include_router(tamper.router)
api_router.include_router(tools.router)
api_router.include_router(network.router)
