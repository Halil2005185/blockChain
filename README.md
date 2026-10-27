# Interactive 3D Blockchain Explorer

An educational blockchain built from scratch in Python, with an interactive 3D
explorer, a multi-node network simulation, and a 14-lesson academy.

**The web interface is in Turkish** (`<html lang="tr">`, site name
**Blokzincir Gezgini**). The REST API and Swagger docs stay in English,
because they are for developers.

> **Not a cryptocurrency.** All accounts and amounts are fictional ("EDU" units).
> This is a learning tool with deliberate simplifications. See
> [Limitations](#known-limitations-and-security-caveats). Never use it for anything of real value.

---

## What's inside

| Tab | What you can do |
|---|---|
| **Single chain** | Create transactions, mine blocks at difficulty 1–6 with live progress, inspect blocks in 3D, tamper with history and watch validation catch it. |
| **Network** | Run 1–8 independent nodes, each with its own blockchain copy. Mine on one node and watch the block travel, disconnect nodes, split the network, broadcast invalid blocks, and watch nodes converge on the chain with the most work. |
| **Learn** | 14 lessons from "What is a blockchain?" to "What this blockchain is NOT". Each has an explanation, a hands-on experiment using the real backend, a walkthrough and a quiz. Progress is saved in your browser. |

## Architecture

```
blockchaing/
├── backend/                     Python 3 · FastAPI · Pydantic · hashlib
│   ├── app/
│   │   ├── core/                Blockchain from scratch: Transaction, Block, Blockchain,
│   │   │                        SHA-256 helpers, Merkle tree. No web code at all.
│   │   ├── network/             Multi-node simulation: Node, message scheduler, invalid-block experiments
│   │   ├── services/            ChainService and NetworkService: own the state, locks, mining threads
│   │   ├── models/              Pydantic request/response schemas
│   │   ├── api/routes/          REST endpoints (chain, transactions, mining, tamper, tools, network)
│   │   ├── websocket/           Typed event schemas + connection manager (fan-out to browsers)
│   │   └── main.py              App factory: wires services, events, CORS and routes
│   ├── tests/                   pytest: core, services, API, WebSocket, network simulation
│   └── demo.py                  Command-line walkthrough of the core (no server)
└── frontend/                    Next.js 16 · React 19 · TypeScript · Tailwind 4 · three.js / R3F / Drei
    ├── src/lib/                 API client + typed models, WebSocket protocol, lesson data
    ├── src/hooks/               useBlockchain, useMining, useNetwork, useRealtime, useLearnProgress
    ├── src/components/          dashboard/, scene/ (3D chain), network/ (3D network), learn/, ui/
    └── tests/                   Node test runner: WebSocket reconnection, lessons, quiz logic
```

- **Dependencies point inward:** routes → services → core. The core never imports FastAPI.
- **REST is the source of truth.** The WebSocket only tells the browser *when* something changed, and streams mining progress.
- **Locks are held only for short steps.** Mining runs in worker threads without the lock, and events are published after the lock is released, so a slow browser can never block mining.

## Required software

| Software | Version | Notes |
|---|---|---|
| Python | **3.11 or newer** | Developed and tested on 3.15. |
| Node.js | **22.18 or newer** | Developed and tested on 24.19. Next.js needs ≥ 20.9; `npm test` needs ≥ 22.18 (built-in TypeScript support). |
| npm | comes with Node | Tested with 11.17. |
| A WebGL browser | Edge, Chrome or Firefox | Without WebGL the 3D panels fall back to 2D views. |

## Installation (Windows PowerShell)

```powershell
# 1. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt

# 2. Frontend (second PowerShell window)
cd frontend
npm install
```

<details>
<summary>"Running scripts is disabled on this system" when activating?</summary>

Allow local scripts for your user once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
Or skip activation and call the venv's Python directly, e.g.
`.\.venv\Scripts\python.exe -m pytest` and `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.
</details>

The frontend reads the backend address from `NEXT_PUBLIC_API_URL` (default
`http://127.0.0.1:8000`). To change it: `Copy-Item .env.example .env.local`,
edit it, and restart `npm run dev`.

## Start the app

Two PowerShell windows:

```powershell
# Window 1: backend on http://127.0.0.1:8000
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

```powershell
# Window 2: frontend on http://localhost:3000
cd frontend
npm run dev
```

Open **http://localhost:3000**. The header should show **Online** and **Live**.
Direct links also work: `#network`, `#learn`, `#learn/<lesson-id>` (e.g. `#learn/sha256`).

Interactive API docs (Swagger UI): **http://127.0.0.1:8000/docs**

## Run all tests

```powershell
# Backend: core, services, REST API, WebSocket, network simulation
cd backend
.\.venv\Scripts\Activate.ps1
pytest

# Frontend
cd frontend
npm test            # WebSocket protocol/reconnection, lesson content, quiz + progress logic
npm run typecheck   # TypeScript
npm run build       # production build
```

## API overview

All REST endpoints are under `/api`. Every error has the same shape:
`{"error": {"code": "...", "message": "...", "details": ...}}`
(400 domain rule, 404 not found, 409 conflict, 422 invalid input).

| Area | Endpoints |
|---|---|
| Chain | `GET /chain` · `GET /chain/blocks/{i}` · `GET /chain/validate` · `PUT /chain/difficulty` · `POST /chain/reset` |
| Transactions | `POST /transactions` · `GET /transactions/pending` |
| Mining | `POST /mining/mine` (wait) · `POST /mining/start` (202) · `GET /mining/status` · `POST /mining/cancel` |
| Tampering | `PATCH /tamper/blocks/{i}` · `POST /tamper/blocks/{i}/remine` |
| Sandbox tools (never touch any chain) | `POST /tools/sha256` · `POST /tools/block-hash` · `POST /tools/merkle` · `POST /tools/mine-preview` |
| Network simulation | `GET /network` · `POST /network/reset` · `PUT /network/latency` · `POST /network/partition` · `POST /network/heal` · `GET/POST /network/nodes` · `GET/DELETE /network/nodes/{id}` · `PUT …/{id}/connection` · `POST …/{id}/mine` · `…/{id}/transactions` · `…/{id}/broadcast` · `…/{id}/sync` · `…/{id}/invalid-block` |

Optional header: `X-Client-Id` (a random id per browser tab). It is copied
into the `origin` of the events a request causes, so a tab doesn't log its own
actions twice.

Backend settings (environment variables): `BLOCKCHAIN_DIFFICULTY` (3),
`BLOCKCHAIN_MINING_REWARD` (10), `CORS_ORIGINS` (`http://localhost:3000,http://127.0.0.1:3000`).

## WebSocket overview

`ws://127.0.0.1:8000/api/ws`: server → browser events, one JSON object per message:

```json
{ "type": "mining.progress", "seq": 42, "ts": 1793030400.12, "origin": "tab-…", "data": { } }
```

- `seq` goes up by one for every event. `hello`, `heartbeat` and `pong` repeat the latest `seq`, so a client can detect missed events and reload over REST.
- **Event types:**
  - chain: `transaction.created`, `difficulty.changed`, `chain.reset`, `chain.validated`, `block.tampered`, `block.remined`
  - mining: `mining.started`, `mining.progress` (≤ 10 per second), `mining.completed`, `mining.cancelled`, `mining.failed`
  - network: `network.changed`, `network.node_status`, `network.mining_started`, `network.block_mined`, `network.mining_stale`, `network.message_sent`, `network.message_dropped`, `network.block_received`, `network.sync`, `network.transaction_received`, `network.invalid_block_created`
- Each payload is validated against a Pydantic model before it is sent (`backend/app/websocket/events.py`).
- Clients may only send `{"type":"ping"}` (≤ 512 bytes). Connections from origins outside `CORS_ORIGINS` are refused. Slow clients are disconnected and reconnect automatically.

## Using the explorer

**Single chain**
1. Add a transaction in *Transactions*, choose a difficulty and click **Mine block**. A ghost block shows live nonce, hash and speed.
2. Click a cube (or use ← → in the 3D panel) to inspect a block. Drag to rotate, right-drag to pan, scroll to zoom. `O` shows the whole chain and `R` resets the camera.
3. *Tampering simulation* in Block details: change data, then watch the chain turn invalid and untrusted. **Re-mine** to see the break move to the next link.

**Network**
1. Select a node and click **Mine block**. Packets fly to the peers and flash green when accepted.
2. **Disconnect** a node, mine elsewhere, then **Reconnect**: it catches up through chain sync.
3. *Network controls* → **Split in half**, mine on both sides, then **Heal**: the side with more total work wins.
4. *Invalid-block experiment*: broadcast a tampered, unmined, greedy or orphan block and read each peer's reason for rejecting it.

**Learn**: pick a lesson, run its experiment, follow the walkthrough and pass the quiz. Experiments that change your chain or network ask first, and can start from a fresh state if you confirm.

## Known limitations and security caveats

This project is deliberately simplified for teaching:

- **No signatures or keys.** Anyone can create a transaction "from" any name. The signature lesson demonstrates real ECDSA with the browser's Web Crypto API, but that demo is separate from the chain.
- **No balance checks.** Spending more than you have (double spending) is not prevented.
- **In memory only.** Restarting the backend erases every block.
- **Simplified proof of work.** The target is "N leading hex zeros"; difficulty is fixed (it never adjusts itself); there are no fees.
- **Simulated network.** All nodes run in one process with honest message delivery, a full mesh and no relaying. It is **not Byzantine fault tolerant** and not production consensus.
- **Fork choice:** nodes follow the valid chain with the most cumulative work (sum of 16^difficulty), not simply the longest chain. Ties keep the chain seen first.
- **Proof of Stake is not implemented.** The PoS lesson uses a conceptual, browser-only random-selection model.
- **Single process, single user.** There is no authentication. Run it on localhost only.
- Mining runs in pure Python, about 100k–300k hashes per second. Difficulty 6 can take minutes.
