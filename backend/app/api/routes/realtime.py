"""WebSocket endpoint for real-time events (see app/websocket/events.py)."""

from fastapi import APIRouter, WebSocket

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def events_socket(websocket: WebSocket) -> None:
    """Server -> browser event stream. Clients may only send {"type": "ping"}."""
    await websocket.app.state.events.serve(websocket)
