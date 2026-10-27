"""Educational multi-node network simulation.

Several simulated nodes, each with its own independent ``Blockchain``, exchange
blocks, transactions and chains through a message layer with artificial
latency. It demonstrates propagation, validation and a simplified
"most proof of work wins" rule. It is NOT a real distributed system: one
process, no signatures, no node identities, and no Byzantine fault tolerance.
"""

from app.network.node import BlockDecision, Node, SyncResult
from app.network.scheduler import ManualScheduler, Scheduler, ThreadScheduler

__all__ = ["BlockDecision", "ManualScheduler", "Node", "Scheduler", "SyncResult", "ThreadScheduler"]
