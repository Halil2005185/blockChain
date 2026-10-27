/**
 * One typed function per backend endpoint (see backend/app/api/routes/).
 * Components and hooks import `api` instead of building URLs themselves.
 */

import { request } from "@/lib/api/client";
import type {
  BlockHashPreviewRequest,
  BlockHashPreviewResponse,
  BlockOut,
  ChainOut,
  MerkleResponse,
  MinePreviewResponse,
  PreviewTransaction,
  DifficultyResponse,
  MiningJobOut,
  RemineResponse,
  Sha256Response,
  TamperRequest,
  TamperResponse,
  TransactionCreate,
  TransactionOut,
  ValidationReportOut,
} from "@/lib/api/types";

/** Mining a new genesis at high difficulty can take a while. */
const SLOW_TIMEOUT_MS = 180_000;

export const api = {
  // health ------------------------------------------------------------------
  health: (signal?: AbortSignal) =>
    request<{ status: string }>("/api/health", { signal, timeoutMs: 3_000 }),

  // chain -------------------------------------------------------------------
  getChain: (signal?: AbortSignal) => request<ChainOut>("/api/chain", { signal }),

  getBlock: (index: number) => request<BlockOut>(`/api/chain/blocks/${index}`),

  // A GET that *does* cause an event (chain.validated), so identify ourselves.
  validateChain: () => request<ValidationReportOut>("/api/chain/validate", { identify: true }),

  setDifficulty: (difficulty: number) =>
    request<DifficultyResponse>("/api/chain/difficulty", {
      method: "PUT",
      body: { difficulty },
    }),

  resetChain: (difficulty?: number) =>
    request<ChainOut>("/api/chain/reset", {
      method: "POST",
      body: difficulty === undefined ? undefined : { difficulty },
      timeoutMs: SLOW_TIMEOUT_MS,
    }),

  // transactions ------------------------------------------------------------
  getPendingTransactions: () => request<TransactionOut[]>("/api/transactions/pending"),

  createTransaction: (tx: TransactionCreate) =>
    request<TransactionOut>("/api/transactions", { method: "POST", body: tx }),

  // mining ------------------------------------------------------------------
  /** Starts a background job and returns immediately (HTTP 202). */
  startMining: (minerAddress: string) =>
    request<MiningJobOut>("/api/mining/start", {
      method: "POST",
      body: { miner_address: minerAddress },
    }),

  /** Current or last job; null if nothing was mined since the server started. */
  getMiningStatus: (signal?: AbortSignal) =>
    request<MiningJobOut | null>("/api/mining/status", { signal }),

  cancelMining: () => request<MiningJobOut>("/api/mining/cancel", { method: "POST" }),

  // tampering simulation ----------------------------------------------------
  tamperBlock: (index: number, changes: TamperRequest) =>
    request<TamperResponse>(`/api/tamper/blocks/${index}`, { method: "PATCH", body: changes }),

  remineBlock: (index: number, relink = true) =>
    request<RemineResponse>(`/api/tamper/blocks/${index}/remine`, {
      method: "POST",
      body: { relink },
      timeoutMs: SLOW_TIMEOUT_MS,
    }),

  /** Mine pending transactions and wait for the result (the lessons use this). */
  mineAndWait: (minerAddress: string) =>
    request<MiningJobOut>("/api/mining/mine", {
      method: "POST",
      body: { miner_address: minerAddress },
      timeoutMs: SLOW_TIMEOUT_MS,
    }),

  // tools (stateless sandbox: never touch any chain) ---------------------------
  sha256: (text: string) =>
    request<Sha256Response>("/api/tools/sha256", { method: "POST", body: { text } }),

  blockHash: (block: BlockHashPreviewRequest) =>
    request<BlockHashPreviewResponse>("/api/tools/block-hash", { method: "POST", body: block }),

  merkle: (transactions: PreviewTransaction[]) =>
    request<MerkleResponse>("/api/tools/merkle", { method: "POST", body: { transactions } }),

  minePreview: (data: string, difficulty: number) =>
    request<MinePreviewResponse>("/api/tools/mine-preview", {
      method: "POST",
      body: { data, difficulty },
      timeoutMs: SLOW_TIMEOUT_MS,
    }),
};
