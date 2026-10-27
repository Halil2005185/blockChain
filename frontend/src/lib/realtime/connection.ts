/**
 * WebSocket protocol + connection logic, framework-free.
 *
 * This file deliberately has no runtime imports (only `import type`) and no
 * React, so the reconnection logic can be unit-tested in plain Node with a
 * fake socket and fake timers (see frontend/tests/realtime.test.ts).
 *
 * Message envelope (mirrors backend/app/websocket/events.py):
 *   { type, seq, ts, origin, data }
 */

import type {
  BlockOut,
  BlockOutcome,
  MiningJobOut,
  MiningProgressOut,
  MiningResultOut,
  SyncReason,
  TransactionOut,
  ValidationIssueOut,
  ValidationReportOut,
} from "@/lib/api/types";

// ------------------------------------------------------------------ messages
interface Envelope<T extends string, D> {
  type: T;
  /** Increments by one per event; control messages repeat the latest seq. */
  seq: number;
  /** Server time, Unix seconds. */
  ts: number;
  /** X-Client-Id of the tab that caused the event, or null. */
  origin: string | null;
  data: D;
}

export interface MiningProgressEventData {
  job_id: string;
  block_index: number;
  difficulty: number;
  target_prefix: string;
  expected_attempts: number;
  progress: MiningProgressOut;
}

export type ControlMessage =
  | Envelope<"hello", { heartbeat_interval: number }>
  | Envelope<"heartbeat", Record<string, never>>
  | Envelope<"pong", Record<string, never>>;

export type ServerEvent =
  | Envelope<"transaction.created", { transaction: TransactionOut; pending_count: number }>
  | Envelope<"difficulty.changed", { difficulty: number }>
  | Envelope<"chain.reset", { height: number; difficulty: number }>
  | Envelope<"chain.validated", { report: ValidationReportOut }>
  | Envelope<"mining.started" | "mining.completed" | "mining.cancelled" | "mining.failed", { job: MiningJobOut }>
  | Envelope<"mining.progress", MiningProgressEventData>
  | Envelope<
      "block.tampered",
      { index: number; stored_hash: string; recalculated_hash: string; block: BlockOut; validation: ValidationReportOut }
    >
  | Envelope<"block.remined", { index: number; block: BlockOut; result: MiningResultOut; validation: ValidationReportOut }>
  | NetworkEvent;

// ------------------------------------------------ network simulation events
export type MessageKind = "block" | "chain" | "transaction";
export type DropReason = "sender_offline" | "receiver_offline" | "partitioned";

export interface MessageSentData {
  message_id: string;
  kind: MessageKind;
  from_node: string;
  to_node: string;
  /** Arrives after this long; drives the "packet in flight" animation. */
  latency_ms: number;
  block_index: number | null;
  block_hash: string | null;
  tx_id: string | null;
  invalid_kind: string | null;
}

export type NetworkEvent =
  | Envelope<
      "network.changed",
      { change: "node_added" | "node_removed" | "partitioned" | "healed" | "latency" | "reset"; node_id: string | null }
    >
  | Envelope<"network.node_status", { node_id: string; online: boolean; group: string }>
  | Envelope<"network.mining_started", { node_id: string; block_index: number; difficulty: number }>
  | Envelope<
      "network.block_mined",
      { node_id: string; block_index: number; block_hash: string; attempts: number; duration_seconds: number }
    >
  | Envelope<"network.mining_stale", { node_id: string; block_index: number; reason: string }>
  | Envelope<"network.message_sent", MessageSentData>
  | Envelope<
      "network.message_dropped",
      { message_id: string; kind: MessageKind; from_node: string; to_node: string; reason: DropReason }
    >
  | Envelope<
      "network.block_received",
      {
        message_id: string;
        from_node: string;
        to_node: string;
        block_index: number;
        block_hash: string;
        outcome: BlockOutcome;
        reasons: ValidationIssueOut[];
        height: number;
      }
    >
  | Envelope<
      "network.sync",
      {
        message_id: string;
        node_id: string;
        peer_id: string;
        adopted: boolean;
        reason: SyncReason;
        old_height: number;
        new_height: number;
        reorg_depth: number;
        returned_transactions: number;
        issues: ValidationIssueOut[];
        trigger_block_hash: string | null;
        resolved: boolean | null;
      }
    >
  | Envelope<"network.transaction_received", { message_id: string; from_node: string; to_node: string; tx_id: string; accepted: boolean }>
  | Envelope<
      "network.invalid_block_created",
      { node_id: string; kind: string; block_index: number; block_hash: string; expected_rejection: string }
    >;

export type ServerMessage = ControlMessage | ServerEvent;

const CONTROL_TYPES = new Set(["hello", "heartbeat", "pong"]);
const EVENT_TYPES = new Set([
  "transaction.created",
  "difficulty.changed",
  "chain.reset",
  "chain.validated",
  "mining.started",
  "mining.progress",
  "mining.completed",
  "mining.cancelled",
  "mining.failed",
  "block.tampered",
  "block.remined",
  "network.changed",
  "network.node_status",
  "network.mining_started",
  "network.block_mined",
  "network.mining_stale",
  "network.message_sent",
  "network.message_dropped",
  "network.block_received",
  "network.sync",
  "network.transaction_received",
  "network.invalid_block_created",
]);

export function isControl(message: ServerMessage): message is ControlMessage {
  return CONTROL_TYPES.has(message.type);
}

/** Parse and sanity-check one message; anything unexpected becomes null. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  const knownType = typeof m.type === "string" && (CONTROL_TYPES.has(m.type) || EVENT_TYPES.has(m.type));
  if (
    !knownType ||
    typeof m.seq !== "number" ||
    typeof m.ts !== "number" ||
    !(m.origin === null || m.origin === undefined || typeof m.origin === "string") ||
    typeof m.data !== "object" ||
    m.data === null
  ) {
    return null;
  }
  return { ...m, origin: (m.origin as string | null | undefined) ?? null } as ServerMessage;
}

// ---------------------------------------------------------------- sequencing
export type SeqVerdict = "ok" | "gap" | "duplicate";

/**
 * Detects missed or repeated events from `seq`:
 *   event:   expected last + 1; more = "gap" (missed some), less = "duplicate"
 *   control: carries the latest seq; more than last = "gap"
 */
export class SequenceTracker {
  last: number | null = null;

  reset(seq: number): void {
    this.last = seq;
  }

  observe(message: ServerMessage): SeqVerdict {
    const { seq } = message;
    if (this.last === null) {
      this.last = seq;
      return "ok";
    }
    if (isControl(message)) {
      const verdict: SeqVerdict = seq > this.last ? "gap" : "ok";
      this.last = Math.max(this.last, seq);
      return verdict;
    }
    if (seq <= this.last) return "duplicate";
    const verdict: SeqVerdict = seq === this.last + 1 ? "ok" : "gap";
    this.last = seq;
    return verdict;
  }
}

// ---------------------------------------------------------------- connection
export type RealtimeStatus = "connecting" | "open" | "closed";

/** The subset of the browser WebSocket API we use (lets tests pass a fake). */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RealtimeHandlers {
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** Re-fetch state over REST: after (re)connecting, or when events were missed. */
  onResync: (reason: "connected" | "gap") => void;
}

export interface RealtimeOptions {
  createSocket?: (url: string) => SocketLike;
  timers?: Timers;
  random?: () => number;
  minDelayMs?: number;
  maxDelayMs?: number;
}

/** Exponential backoff with ±20% jitter: ~1s, 2s, 4s, 8s, then 15s max. */
export function backoffDelay(attempt: number, minMs: number, maxMs: number, random: () => number): number {
  const base = Math.min(maxMs, minMs * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

const DEFAULT_HEARTBEAT_SECONDS = 15;
/** No message for this many heartbeat intervals = assume the link is dead. */
const WATCHDOG_FACTOR = 2.5;

export class RealtimeConnection {
  private socket: SocketLike | null = null;
  private stopped = true;
  private attempt = 0;
  private reconnectTimer: unknown = null;
  private watchdogTimer: unknown = null;
  private heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS;
  private readonly seq = new SequenceTracker();
  private readonly url: string;
  private readonly handlers: RealtimeHandlers;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly timers: Timers;
  private readonly random: () => number;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(url: string, handlers: RealtimeHandlers, options: RealtimeOptions = {}) {
    this.url = url;
    this.handlers = handlers;
    this.createSocket = options.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
    };
    this.random = options.random ?? Math.random;
    this.minDelayMs = options.minDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 15_000;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  /**
   * Skip the remaining backoff and reconnect now - e.g. REST just found the
   * server again, so waiting up to 15 s for the next attempt is pointless.
   * Does nothing while a socket is open or being opened.
   */
  retryNow(): void {
    if (this.stopped || this.socket || this.reconnectTimer === null) return;
    this.clearTimer("reconnectTimer");
    this.attempt = 0;
    this.connect();
  }

  /** Close for good (component unmounted). No reconnects after this. */
  stop(): void {
    this.stopped = true;
    this.clearTimer("reconnectTimer");
    this.clearTimer("watchdogTimer");
    const socket = this.detach();
    socket?.close(1000);
  }

  private connect(): void {
    if (this.stopped) return;
    this.handlers.onStatus("connecting");
    let socket: SocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus("open");
      this.armWatchdog();
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => {
      /* a close event always follows; reconnect is handled there */
    };
    socket.onclose = () => {
      if (this.socket !== socket) return; // an old socket we already replaced
      this.detach();
      this.clearTimer("watchdogTimer");
      this.handlers.onStatus("closed");
      this.scheduleReconnect();
    };
  }

  private handleMessage(raw: unknown): void {
    const message = parseServerMessage(raw);
    this.armWatchdog(); // any traffic proves the link is alive
    if (!message) return;

    if (message.type === "hello") {
      this.heartbeatSeconds = message.data.heartbeat_interval || DEFAULT_HEARTBEAT_SECONDS;
      this.armWatchdog();
      this.seq.reset(message.seq);
      // We may have missed events while disconnected: reload over REST.
      this.handlers.onResync("connected");
      return;
    }

    const verdict = this.seq.observe(message);
    if (verdict === "duplicate") return;
    if (verdict === "gap") this.handlers.onResync("gap");
    if (!isControl(message)) this.handlers.onEvent(message);
  }

  private armWatchdog(): void {
    this.clearTimer("watchdogTimer");
    if (this.stopped || !this.socket) return;
    this.watchdogTimer = this.timers.setTimeout(() => {
      // Silent for too long: the connection is probably dead (laptop sleep,
      // network change). Drop it and reconnect.
      const socket = this.detach();
      socket?.close(4000);
      this.handlers.onStatus("closed");
      this.scheduleReconnect();
    }, this.heartbeatSeconds * WATCHDOG_FACTOR * 1000);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearTimer("reconnectTimer");
    const delay = backoffDelay(this.attempt, this.minDelayMs, this.maxDelayMs, this.random);
    this.attempt += 1;
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Forget the current socket and silence its callbacks. */
  private detach(): SocketLike | null {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    }
    return socket;
  }

  private clearTimer(name: "reconnectTimer" | "watchdogTimer"): void {
    if (this[name] !== null) {
      this.timers.clearTimeout(this[name]);
      this[name] = null;
    }
  }
}
