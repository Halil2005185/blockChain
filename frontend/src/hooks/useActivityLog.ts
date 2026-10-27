"use client";

import { useCallback, useRef, useState } from "react";

export type LogKind = "transaction" | "mining" | "validation" | "chain" | "tamper" | "connection" | "network";
export type LogLevel = "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: number;
  /** Browser time in milliseconds. */
  time: number;
  kind: LogKind;
  level: LogLevel;
  message: string;
  detail?: string;
}

export interface LogOptions {
  /**
   * Stable id of the thing being logged (e.g. "tx:<tx_id>", "job:<id>:completed").
   * The same thing can be reported by a REST response, a WebSocket event and a
   * fallback poll; only the first report with a given key is kept.
   */
  dedupeKey?: string;
}

export type LogFn = (kind: LogKind, level: LogLevel, message: string, detail?: string, options?: LogOptions) => void;

const MAX_DEDUPE_KEYS = 1_000;

/** A newest-first, size-capped list of things that happened in the session. */
export function useActivityLog(maxEntries = 200) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const nextId = useRef(1);
  const seenKeys = useRef(new Set<string>());

  const log = useCallback<LogFn>(
    (kind, level, message, detail, options) => {
      const key = options?.dedupeKey;
      if (key) {
        const seen = seenKeys.current;
        if (seen.has(key)) return;
        seen.add(key);
        // Sets iterate in insertion order: drop the oldest keys first.
        if (seen.size > MAX_DEDUPE_KEYS) seen.delete(seen.values().next().value as string);
      }
      const entry: LogEntry = { id: nextId.current++, time: Date.now(), kind, level, message, detail };
      setEntries((prev) => [entry, ...prev].slice(0, maxEntries));
    },
    [maxEntries],
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, log, clear };
}
