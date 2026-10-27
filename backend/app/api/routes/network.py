"""Multi-node network simulation endpoints (educational, single process)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, status

from app.models.common import ErrorResponse
from app.models.network import (
    ConnectionUpdate,
    CreateNodeRequest,
    InvalidBlockOut,
    InvalidBlockRequest,
    LatencyUpdate,
    MiningTicketOut,
    NetworkResetRequest,
    NetworkStatusOut,
    NodeDetailOut,
    NodeMineRequest,
    NodeSummaryOut,
    PartitionRequest,
)
from app.models.transaction import TransactionCreate, TransactionOut
from app.services.network_service import NetworkService

router = APIRouter(prefix="/network", tags=["network simulation"])


def get_network(request: Request) -> NetworkService:
    return request.app.state.network


NetworkDep = Annotated[NetworkService, Depends(get_network)]
NodeIdPath = Annotated[str, Path(pattern=r"^node-\d{1,3}$", examples=["node-1"])]
_404 = {404: {"model": ErrorResponse}}
_409 = {409: {"model": ErrorResponse}}


@router.get("", response_model=NetworkStatusOut, summary="Network status: every node at a glance")
def network_status(net: NetworkDep):
    return net.status()


@router.post("/reset", response_model=NetworkStatusOut, summary="Start a fresh network")
def reset_network(net: NetworkDep, body: NetworkResetRequest | None = None):
    body = body or NetworkResetRequest()
    return net.reset(body.node_count, body.difficulty)


@router.put("/latency", response_model=NetworkStatusOut, summary="Set simulated latency")
def set_latency(body: LatencyUpdate, net: NetworkDep):
    return net.set_latency(body.latency_ms, body.jitter_ms)


@router.post("/partition", response_model=NetworkStatusOut, summary="Split the network into groups",
             responses={400: {"model": ErrorResponse}, **_404})
def partition(body: PartitionRequest, net: NetworkDep):
    """Nodes only reach nodes in their own group until the network is healed."""
    return net.partition(body.groups)


@router.post("/heal", response_model=NetworkStatusOut, summary="Reconnect all groups")
def heal(net: NetworkDep):
    return net.heal()


# ------------------------------------------------------------------ nodes
@router.get("/nodes", response_model=list[NodeSummaryOut], summary="List nodes")
def list_nodes(net: NetworkDep):
    return net.list_nodes()


@router.post("/nodes", response_model=NodeSummaryOut, status_code=status.HTTP_201_CREATED,
             summary="Add a node", responses=_409)
def add_node(net: NetworkDep, body: CreateNodeRequest | None = None):
    """The new node starts with only the genesis block and downloads its peers' chains."""
    return net.add_node(body.name if body else None)


@router.get("/nodes/{node_id}", response_model=NodeDetailOut, summary="One node's full state", responses=_404)
def node_detail(node_id: NodeIdPath, net: NetworkDep):
    return net.node_detail(node_id)


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove a node",
               responses={**_404, **_409})
def remove_node(node_id: NodeIdPath, net: NetworkDep) -> None:
    net.remove_node(node_id)


@router.put("/nodes/{node_id}/connection", response_model=NodeSummaryOut,
            summary="Disconnect or reconnect a node", responses=_404)
def set_connection(node_id: NodeIdPath, body: ConnectionUpdate, net: NetworkDep):
    """Offline nodes neither send nor receive. On reconnect, chains are exchanged."""
    return net.set_online(node_id, body.online)


@router.post("/nodes/{node_id}/transactions", response_model=TransactionOut,
             status_code=status.HTTP_201_CREATED, summary="Submit a transaction to one node",
             responses={400: {"model": ErrorResponse}, **_404})
def submit_transaction(node_id: NodeIdPath, body: TransactionCreate, net: NetworkDep):
    """Added to that node's pending pool, then gossiped to reachable peers."""
    return net.submit_transaction(node_id, body.sender, body.receiver, body.amount)


@router.post("/nodes/{node_id}/mine", response_model=MiningTicketOut,
             status_code=status.HTTP_202_ACCEPTED, summary="Mine a block on one node",
             responses={**_404, **_409})
def mine(node_id: NodeIdPath, net: NetworkDep, body: NodeMineRequest | None = None):
    """Returns at once; watch `network.*` events for the block travelling to peers."""
    return net.start_mining(node_id, body.miner_address if body else None).to_dict()


@router.post("/nodes/{node_id}/broadcast", summary="Re-broadcast this node's latest block",
             responses={**_404, **_409})
def broadcast(node_id: NodeIdPath, net: NetworkDep) -> dict[str, object]:
    return net.broadcast_tip(node_id)


@router.post("/nodes/{node_id}/sync", summary="Ask reachable peers for their chains", responses=_404)
def sync(node_id: NodeIdPath, net: NetworkDep) -> dict[str, object]:
    return net.sync_node(node_id)


@router.post("/nodes/{node_id}/invalid-block", response_model=InvalidBlockOut,
             status_code=status.HTTP_202_ACCEPTED, summary="Broadcast a deliberately invalid block",
             responses=_404)
def invalid_block(node_id: NodeIdPath, body: InvalidBlockRequest, net: NetworkDep):
    """The block is never added to the sender's own chain. Watch peers reject it."""
    info, _ = net.send_invalid_block(node_id, body.kind)
    return info
