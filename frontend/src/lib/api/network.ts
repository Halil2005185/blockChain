/**
 * One typed function per network-simulation endpoint
 * (backend/app/api/routes/network.py).
 */

import { request } from "@/lib/api/client";
import type {
  InvalidBlockKind,
  InvalidBlockOut,
  MiningTicketOut,
  NetworkStatusOut,
  NodeDetailOut,
  NodeSummaryOut,
  TransactionCreate,
  TransactionOut,
} from "@/lib/api/types";

const N = "/api/network";
const node = (id: string) => `${N}/nodes/${encodeURIComponent(id)}`;

export const networkApi = {
  status: (signal?: AbortSignal) => request<NetworkStatusOut>(N, { signal }),
  node: (id: string, signal?: AbortSignal) => request<NodeDetailOut>(node(id), { signal }),

  addNode: (name?: string) => request<NodeSummaryOut>(`${N}/nodes`, { method: "POST", body: name ? { name } : {} }),
  removeNode: (id: string) => request<null>(node(id), { method: "DELETE" }),
  setOnline: (id: string, online: boolean) =>
    request<NodeSummaryOut>(`${node(id)}/connection`, { method: "PUT", body: { online } }),

  mine: (id: string) => request<MiningTicketOut>(`${node(id)}/mine`, { method: "POST", body: {} }),
  broadcast: (id: string) => request<{ node_id: string; block_index: number }>(`${node(id)}/broadcast`, { method: "POST" }),
  sync: (id: string) => request<{ node_id: string; requested_from: number }>(`${node(id)}/sync`, { method: "POST" }),
  sendInvalidBlock: (id: string, kind: InvalidBlockKind) =>
    request<InvalidBlockOut>(`${node(id)}/invalid-block`, { method: "POST", body: { kind } }),
  submitTransaction: (id: string, tx: TransactionCreate) =>
    request<TransactionOut>(`${node(id)}/transactions`, { method: "POST", body: tx }),

  setLatency: (latency_ms: number, jitter_ms: number) =>
    request<NetworkStatusOut>(`${N}/latency`, { method: "PUT", body: { latency_ms, jitter_ms } }),
  partition: (groups: string[][]) => request<NetworkStatusOut>(`${N}/partition`, { method: "POST", body: { groups } }),
  heal: () => request<NetworkStatusOut>(`${N}/heal`, { method: "POST" }),
  reset: (node_count: number, difficulty: number) =>
    request<NetworkStatusOut>(`${N}/reset`, { method: "POST", body: { node_count, difficulty } }),
};
