"""FastAPI dependencies shared by the routes."""

from typing import Annotated

from fastapi import Depends, Header, Request

from app.services import ChainService
from app.services.events import clean_origin, current_origin


def get_chain_service(request: Request) -> ChainService:
    """The single ChainService created in ``create_app`` (stored on app.state)."""
    return request.app.state.chain_service


ChainServiceDep = Annotated[ChainService, Depends(get_chain_service)]


async def capture_origin(
    x_client_id: Annotated[
        str | None,
        Header(description="Random id of the browser tab; echoed as `origin` on WebSocket events"),
    ] = None,
) -> None:
    """Remember which browser tab made this request, for the events it causes.

    Must be `async`: it then runs in the request's own context, and the value
    is copied into the thread pool that runs sync routes. (A sync dependency
    would set it inside a throwaway worker-thread context.)
    """
    current_origin.set(clean_origin(x_client_id))
