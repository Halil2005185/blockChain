"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/blockchain";
import { errorMessage, NetworkError } from "@/lib/api/client";
import type {
  ChainOut,
  TamperRequest,
  TransactionCreate,
  TransactionOut,
  ValidationReportOut,
} from "@/lib/api/types";
import { getClientId } from "@/lib/clientId";
import { formatAmount, shortHash, ltr } from "@/lib/format";
import type { ServerEvent } from "@/lib/realtime/connection";
import type { LogFn } from "@/hooks/useActivityLog";

export type ConnectionState = "connecting" | "online" | "offline";

/**
 * Background REST refresh. With a live WebSocket, events tell us when to
 * reload, so this is only a safety net; without one it's the main mechanism.
 */
const REFRESH_INTERVAL_LIVE_MS = 30_000;
const REFRESH_INTERVAL_MS = 5_000;
/** How often to retry while the backend is unreachable. */
const RETRY_INTERVAL_MS = 3_000;
/** Bursts of events (e.g. tamper + validate) are coalesced into one reload. */
const EVENT_REFRESH_DEBOUNCE_MS = 150;

const REMOTE = "başka bir istemciden";

/**
 * Owns the chain snapshot and the connection state, and exposes every
 * chain-changing action. Actions re-throw errors so forms can show them
 * inline; they also log them and flip to "offline" on network failures.
 */
export function useBlockchain(log: LogFn, { live }: { live: boolean }) {
  const [chain, setChain] = useState<ChainOut | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Refs hold "previous" values for comparisons without re-running effects.
  const connectionRef = useRef<ConnectionState>("connecting");
  const wasValidRef = useRef<boolean | null>(null);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const markConnection = useCallback(
    (next: ConnectionState, reason?: string) => {
      const prev = connectionRef.current;
      if (prev === next) return;
      connectionRef.current = next;
      setConnection(next);
      if (next === "online") {
        log("connection", "success", prev === "offline" ? "Sunucuya yeniden bağlanıldı" : "Sunucuya bağlanıldı");
      } else if (next === "offline") {
        log("connection", "error", "Sunucuya ulaşılamadı", reason);
      }
    },
    [log],
  );

  /** Store a fresh snapshot and log if the chain's validity flipped. */
  const applyChain = useCallback(
    (next: ChainOut) => {
      setChain(next);
      setLastUpdated(Date.now());
      const wasValid = wasValidRef.current;
      const isValid = next.validation.is_valid;
      if (wasValid !== null && wasValid !== isValid) {
        log(
          "validation",
          isValid ? "success" : "warning",
          isValid ? "Zincir yeniden geçerli" : "Zincir geçersiz hale geldi",
          isValid ? undefined : `İlk geçersiz blok: ${ltr(`#${next.validation.first_invalid_index}`)}`,
        );
      }
      wasValidRef.current = isValid;
    },
    [log],
  );

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await api.getChain(signal);
        applyChain(next);
        markConnection("online");
        return next;
      } catch (err) {
        if (signal?.aborted) return null;
        if (err instanceof NetworkError) markConnection("offline", err.message);
        else log("chain", "error", "Zincir yüklenemedi", errorMessage(err));
        return null;
      }
    },
    [applyChain, markConnection, log],
  );

  // Initial load + polling. The interval depends on whether we are online.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      await refresh(controller.signal);
      if (controller.signal.aborted) return;
      const delay =
        connectionRef.current !== "online"
          ? RETRY_INTERVAL_MS
          : liveRef.current
            ? REFRESH_INTERVAL_LIVE_MS
            : REFRESH_INTERVAL_MS;
      timer = setTimeout(tick, delay);
    };
    void tick();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh]);

  // ------------------------------------------------------- live events
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  /** Reload the chain soon; several calls in quick succession = one request. */
  const scheduleRefresh = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void refresh();
    }, EVENT_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  /**
   * React to a WebSocket event. REST stays the source of truth: chain-changing
   * events trigger a reload instead of patching state by hand.
   *
   * Events caused by this tab (origin === our client id) were already logged
   * and refreshed by the action itself, so they are skipped here. Mining
   * events are handled by useMining; only "completed" changes the chain.
   */
  const handleEvent = useCallback(
    (event: ServerEvent) => {
      const mine = event.origin === getClientId();
      switch (event.type) {
        case "mining.completed":
          scheduleRefresh();
          return;
        case "transaction.created": {
          if (mine) return;
          const tx = event.data.transaction;
          log("transaction", "info", `${tx.sender} → ${tx.receiver}: ${formatAmount(tx.amount)}`, REMOTE, {
            dedupeKey: `tx:${tx.tx_id}`,
          });
          break;
        }
        case "difficulty.changed":
          if (mine) return;
          log("mining", "info", `Zorluk şuna ayarlandı: ${event.data.difficulty}`, REMOTE);
          break;
        case "chain.reset":
          if (mine) return;
          wasValidRef.current = null;
          log("chain", "info", "Zincir yeni bir genesis bloğuna sıfırlandı", REMOTE);
          break;
        case "chain.validated":
          if (mine) return;
          log(
            "validation",
            event.data.report.is_valid ? "success" : "warning",
            event.data.report.is_valid ? "Doğrulandı: zincir geçerli" : `Doğrulandı: ${event.data.report.issues.length} sorun`,
            REMOTE,
          );
          break;
        case "block.tampered":
          if (mine) return;
          log("tamper", "warning", `Blok ${ltr(`#${event.data.index}`)} yeniden kazılmadan değiştirildi`, REMOTE, {
            dedupeKey: `tamper:${event.data.index}:${event.data.recalculated_hash}`,
          });
          break;
        case "block.remined":
          if (mine) return;
          log("tamper", "info", `Blok ${ltr(`#${event.data.index}`)} yeniden kazıldı (nonce ${event.data.result.nonce})`, REMOTE, {
            dedupeKey: `remine:${event.data.index}:${event.data.block.hash}`,
          });
          break;
        default:
          return; // mining.started / progress / cancelled / failed: chain unchanged
      }
      scheduleRefresh();
    },
    [log, scheduleRefresh],
  );

  /** Runs an action, logging failures and detecting a lost connection. */
  const run = useCallback(
    async <T,>(label: string, kind: Parameters<LogFn>[0], action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (err) {
        if (err instanceof NetworkError) markConnection("offline", err.message);
        log(kind, "error", `Başarısız: ${label}`, errorMessage(err));
        throw err;
      }
    },
    [log, markConnection],
  );

  // ------------------------------------------------------------- actions
  const createTransaction = useCallback(
    (tx: TransactionCreate): Promise<TransactionOut> =>
      run("İşlem", "transaction", async () => {
        const created = await api.createTransaction(tx);
        log(
          "transaction",
          "success",
          `${created.sender} → ${created.receiver}: ${formatAmount(created.amount)}`,
          `Bekliyor · işlem ${shortHash(created.tx_id, 8, 4)}`,
          { dedupeKey: `tx:${created.tx_id}` },
        );
        await refresh();
        return created;
      }),
    [run, log, refresh],
  );

  const setDifficulty = useCallback(
    (difficulty: number) =>
      run("Zorluk değişikliği", "mining", async () => {
        const res = await api.setDifficulty(difficulty);
        log(
          "mining",
          "info",
          `Zorluk şuna ayarlandı: ${res.difficulty}`,
          `Sonraki bloğun hash’i şununla başlamalı: "${"0".repeat(res.difficulty)}"`,
        );
        await refresh();
        return res.difficulty;
      }),
    [run, log, refresh],
  );

  const validate = useCallback(
    (): Promise<ValidationReportOut> =>
      run("Doğrulama", "validation", async () => {
        const report = await api.validateChain();
        setChain((prev) => (prev ? { ...prev, validation: report } : prev));
        wasValidRef.current = report.is_valid;
        if (report.is_valid) {
          log("validation", "success", `Zincir geçerli (kontrol edilen: ${report.chain_length} blok)`);
        } else {
          log(
            "validation",
            "warning",
            `Zincir geçersiz: ${report.issues.length} sorun`,
            report.issues.map((i) => `#${i.index} ${i.code}`).join(", "),
          );
        }
        return report;
      }),
    [run, log],
  );

  const resetChain = useCallback(
    (difficulty?: number) =>
      run("Sıfırlama", "chain", async () => {
        const next = await api.resetChain(difficulty);
        wasValidRef.current = null;
        applyChain(next);
        log("chain", "info", "Zincir yeni bir genesis bloğuna sıfırlandı", `Zorluk ${next.difficulty}`);
        return next;
      }),
    [run, applyChain, log],
  );

  const tamperBlock = useCallback(
    (index: number, changes: TamperRequest) =>
      run("Kurcalama", "tamper", async () => {
        const res = await api.tamperBlock(index, changes);
        log(
          "tamper",
          "warning",
          `Blok ${ltr(`#${index}`)} yeniden kazılmadan değiştirildi`,
          `Saklanan ${shortHash(res.stored_hash, 8, 0)} ≠ hesaplanan ${shortHash(res.recalculated_hash, 8, 0)}`,
          { dedupeKey: `tamper:${index}:${res.recalculated_hash}` },
        );
        await refresh();
        return res;
      }),
    [run, log, refresh],
  );

  const remineBlock = useCallback(
    (index: number) =>
      run("Yeniden kazım", "tamper", async () => {
        const res = await api.remineBlock(index);
        log(
          "tamper",
          "info",
          `Blok ${ltr(`#${index}`)} yeniden kazıldı (nonce ${res.result.nonce})`,
          res.validation.is_valid
            ? "Zincir yeniden geçerli"
            : `Hâlâ geçersiz: ${ltr(`#${res.validation.first_invalid_index}`)}`,
          { dedupeKey: `remine:${index}:${res.block.hash}` },
        );
        await refresh();
        return res;
      }),
    [run, log, refresh],
  );

  return {
    chain,
    connection,
    lastUpdated,
    refresh,
    scheduleRefresh,
    handleEvent,
    createTransaction,
    setDifficulty,
    validate,
    resetChain,
    tamperBlock,
    remineBlock,
  };
}

export type BlockchainState = ReturnType<typeof useBlockchain>;
