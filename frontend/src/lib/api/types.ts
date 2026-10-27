/**
 * TypeScript mirrors of the FastAPI response/request models.
 *
 * Source of truth: backend/app/models/*.py (also visible at /docs and
 * /openapi.json). Field names stay snake_case to match the JSON exactly.
 * Timestamps are Unix seconds (floats), as produced by Python's time.time().
 */

// ---------------------------------------------------------------- transactions
export interface TransactionOut {
  tx_id: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: number;
}

export interface TransactionCreate {
  sender: string;
  receiver: string;
  amount: number;
}

// ---------------------------------------------------------------------- blocks
export interface BlockOut {
  index: number;
  timestamp: number;
  transactions: TransactionOut[];
  previous_hash: string;
  merkle_root: string;
  data: string;
  difficulty: number;
  nonce: number;
  hash: string;
  is_genesis: boolean;
  /** Stored hash matches the contents AND meets the difficulty target. */
  hash_valid: boolean;
}

// ------------------------------------------------------------------ validation
export interface ValidationIssueOut {
  index: number;
  /** e.g. "hash_mismatch", "broken_link", "insufficient_work" */
  code: string;
  message: string;
}

export interface ValidationReportOut {
  is_valid: boolean;
  chain_length: number;
  first_invalid_index: number | null;
  /** Blocks that fail a check themselves. */
  invalid_indices: number[];
  /** Every block from the first invalid one onward. */
  untrusted_indices: number[];
  issues: ValidationIssueOut[];
}

// ----------------------------------------------------------------------- chain
export interface ChainOut {
  /** Difficulty the *next* mined block will use. */
  difficulty: number;
  mining_reward: number;
  /** Index of the latest block (genesis only = 0). */
  height: number;
  chain: BlockOut[];
  pending_transactions: TransactionOut[];
  validation: ValidationReportOut;
}

export interface DifficultyResponse {
  difficulty: number;
}

// ---------------------------------------------------------------------- mining
export type MiningJobStatus = "running" | "completed" | "cancelled" | "failed";

export interface MiningProgressOut {
  nonce: number;
  current_hash: string;
  attempts: number;
  elapsed_seconds: number;
  hashes_per_second: number;
}

export interface MiningResultOut {
  nonce: number;
  hash: string;
  attempts: number;
  duration_seconds: number;
  difficulty: number;
  hashes_per_second: number;
}

export interface MiningJobOut {
  id: string;
  status: MiningJobStatus;
  miner_address: string;
  block_index: number;
  difficulty: number;
  /** What the hash must start with, e.g. "000". */
  target_prefix: string;
  /** Average attempts needed: 16^difficulty. */
  expected_attempts: number;
  transaction_count: number;
  progress: MiningProgressOut | null;
  result: MiningResultOut | null;
  /** Only present once the job completed and the block is in the chain. */
  block: BlockOut | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

// -------------------------------------------------------------------- tampering
export interface TamperRequest {
  data?: string;
  transaction_index?: number;
  sender?: string;
  receiver?: string;
  amount?: number;
}

export interface TamperResponse {
  block: BlockOut;
  stored_hash: string;
  recalculated_hash: string;
  validation: ValidationReportOut;
}

export interface RemineResponse {
  block: BlockOut;
  result: MiningResultOut;
  validation: ValidationReportOut;
}

// ----------------------------------------------------------------------- tools
export interface Sha256Response {
  text: string;
  hash: string;
}

// ---------------------------------------------------------------------- errors
/** Every error from the backend has this shape (backend/app/api/errors.py). */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ------------------------------------------------------------------ network
// Mirrors backend/app/models/network.py (multi-node simulation).
export interface NodeSummaryOut {
  id: string;
  name: string;
  online: boolean;
  /** Partition group: nodes only reach nodes in the same group. */
  group: string;
  height: number;
  tip_hash: string;
  /** Sum of 16^difficulty over all blocks (expected number of hashes). */
  total_work: number;
  chain_valid: boolean;
  pending_count: number;
  mining: boolean;
  /** Blocks behind the network's most-work chain. */
  behind_by: number;
  /** Same tip as the network's most-work chain. */
  in_sync: boolean;
}

export type BlockOutcome = "accepted" | "rejected" | "duplicate" | "orphan" | "stale";
export type SyncReason = "more_work" | "not_more_work" | "invalid_chain" | "different_genesis" | "low_difficulty";

/** One entry of a node's recent history (newest first). Fields depend on `kind`. */
export interface NodeHistoryEntry {
  at: number;
  kind: "received" | "mined" | "mining_stale" | "sync" | "invalid_sent" | "transaction" | "connection";
  from_node?: string;
  block_index?: number;
  block_hash?: string;
  outcome?: BlockOutcome;
  reasons?: ValidationIssueOut[];
  adopted?: boolean;
  reason?: SyncReason;
  reorg_depth?: number;
  returned_transactions?: number;
  /** Sync only: why a peer's chain was refused. */
  issues?: ValidationIssueOut[];
  resolved?: boolean | null;
  invalid_kind?: InvalidBlockKind;
  online?: boolean;
  attempts?: number;
  tx_id?: string;
}

export interface NodeDetailOut extends NodeSummaryOut {
  chain: BlockOut[];
  validation: ValidationReportOut;
  pending_transactions: TransactionOut[];
  history: NodeHistoryEntry[];
}

export interface NetworkStatusOut {
  nodes: NodeSummaryOut[];
  difficulty: number;
  mining_reward: number;
  latency_ms: number;
  jitter_ms: number;
  max_nodes: number;
  best_height: number;
  best_tip_hash: string;
  /** All online nodes have the same tip. */
  in_consensus: boolean;
  partitioned: boolean;
  rules: string[];
  limitations: string[];
}

export type InvalidBlockKind = "tampered" | "no_work" | "inflated_reward" | "unknown_parent";

export interface MiningTicketOut {
  node_id: string;
  block_index: number;
  difficulty: number;
}

export interface InvalidBlockOut {
  node_id: string;
  kind: InvalidBlockKind;
  block_index: number;
  expected_rejection: string;
}

// ------------------------------------------------------------ sandbox tools
// Mirrors backend/app/models/tools.py. These endpoints never touch a chain.
export interface PreviewTransaction {
  sender: string;
  receiver: string;
  amount: number;
  timestamp: number;
}

export interface BlockHashPreviewRequest {
  index?: number;
  timestamp?: number;
  previous_hash?: string;
  data?: string;
  nonce?: number;
  difficulty?: number;
  transactions?: PreviewTransaction[];
}

export interface BlockHashPreviewResponse {
  hash: string;
  merkle_root: string;
  target_prefix: string;
  meets_target: boolean;
}

export interface MerkleResponse {
  leaves: string[];
  /** Leaves first, root last. */
  levels: string[][];
  root: string;
}

export interface MinePreviewResponse {
  /** False if the attempt limit was reached first (very bad luck). */
  found: boolean;
  nonce: number | null;
  hash: string | null;
  attempts: number;
  duration_seconds: number;
  hashes_per_second: number;
  difficulty: number;
  target_prefix: string;
  expected_attempts: number;
  first_attempts: Array<{ nonce: number; hash: string; meets_target: boolean }>;
}
