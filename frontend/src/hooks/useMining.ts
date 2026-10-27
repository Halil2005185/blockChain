"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/blockchain";
import { errorMessage } from "@/lib/api/client";
import type { MiningJobOut } from "@/lib/api/types";
import { getClientId } from "@/lib/clientId";
import { formatDuration, formatInt, shortHash, ltr } from "@/lib/format";
import type { ServerEvent } from "@/lib/realtime/connection";
import type { LogFn } from "@/hooks/useActivityLog";

/**
 * Progress normally arrives over the WebSocket (~10 updates/s). This slow
 * REST poll only runs while a job is mining AND the WebSocket is down.
 */
const FALLBACK_POLL_MS = 2_000;

interface Options {
  log: LogFn;
  /** Called once when a job stops running (completed, cancelled or failed). */
  onJobFinished: () => void;
  /** Pause everything while the backend is unreachable. */
  enabled: boolean;
  /** WebSocket connected: progress is pushed, no polling needed. */
  live: boolean;
}

/**
 * True if `next` is older than what we already show for the same job: a
 * "running" snapshot after it finished, or progress with fewer attempts.
 * Updates can arrive from REST and WebSocket in any order; never go back.
 */
function isStale(current: MiningJobOut | null, next: MiningJobOut): boolean {
  if (!current || current.id !== next.id) return false;
  if (current.status !== "running") return next.status === "running";
  if (next.status !== "running") return false;
  return (next.progress?.attempts ?? 0) < (current.progress?.attempts ?? 0);
}

export function useMining({ log, onJobFinished, enabled, live }: Options) {
  const [job, setJob] = useState<MiningJobOut | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // The latest job, readable inside callbacks without re-creating them.
  const jobRef = useRef<MiningJobOut | null>(null);
  // Job ids whose outcome was handled (REST, WebSocket and polling may all see it).
  const finished = useRef(new Set<string>());
  const onFinishedRef = useRef(onJobFinished);
  useEffect(() => {
    onFinishedRef.current = onJobFinished;
  });

  const setCurrent = useCallback((next: MiningJobOut | null) => {
    jobRef.current = next;
    setJob(next);
  }, []);

  /** Single place that applies a job snapshot, whoever delivered it. */
  const handleUpdate = useCallback(
    (next: MiningJobOut | null) => {
      if (next && isStale(jobRef.current, next)) return;
      setCurrent(next);
      if (!next || next.status === "running" || finished.current.has(next.id)) return;
      finished.current.add(next.id);

      const key = { dedupeKey: `job:${next.id}:${next.status}` };
      if (next.status === "completed" && next.result) {
        const r = next.result;
        log(
          "mining",
          "success",
          `Kazıldı — madenci ${next.miner_address} · blok ${ltr(`#${next.block_index}`)}`,
          `${formatInt(r.attempts)} deneme, süre: ${formatDuration(r.duration_seconds)} · ${shortHash(r.hash, 10, 4)}`,
          key,
        );
      } else if (next.status === "cancelled") {
        log("mining", "warning", `Blok kazımı iptal edildi: ${ltr(`#${next.block_index}`)}`, "Bekleyen işlemler korundu", key);
      } else if (next.status === "failed") {
        log("mining", "error", `Blok kazımı başarısız: ${ltr(`#${next.block_index}`)}`, next.error?.startsWith("block rejected") ? "Zincir bloğu reddetti" : "Kazım sırasında hata", key);
      }
      onFinishedRef.current();
    },
    [log, setCurrent],
  );

  /**
   * Re-read the job over REST: on load, after the WebSocket (re)connects, or
   * when events were missed. A job that finished while we weren't watching is
   * only logged if we knew it was running.
   */
  const resyncing = useRef(false);
  const resync = useCallback(async () => {
    // Progress events arrive ~10x/s; never stack up overlapping requests.
    if (resyncing.current) return;
    resyncing.current = true;
    try {
      const current = await api.getMiningStatus();
      const known = jobRef.current;
      const wasWatching = known !== null && current !== null && known.id === current.id && known.status === "running";
      if (current && current.status !== "running" && !wasWatching) finished.current.add(current.id);
      handleUpdate(current);
    } catch {
      /* useBlockchain already reports connection problems */
    } finally {
      resyncing.current = false;
    }
  }, [handleUpdate]);

  useEffect(() => {
    if (enabled) void resync();
  }, [enabled, resync]);

  /** React to WebSocket mining events. */
  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "mining.started": {
          const started = event.data.job;
          if (event.origin !== getClientId()) {
            log("mining", "info", `Başka bir istemci blok kazmaya başladı: ${ltr(`#${started.block_index}`)}`, `Zorluk ${started.difficulty}`, {
              dedupeKey: `job:${started.id}:started`,
            });
          }
          handleUpdate(started);
          return;
        }
        case "mining.progress": {
          const current = jobRef.current;
          if (current?.id !== event.data.job_id) {
            void resync(); // progress for a job we don't know about yet
            return;
          }
          handleUpdate({ ...current, progress: event.data.progress });
          return;
        }
        case "mining.completed":
        case "mining.cancelled":
        case "mining.failed":
          handleUpdate(event.data.job);
          return;
        default:
          return;
      }
    },
    [log, handleUpdate, resync],
  );

  // Fallback: poll slowly only while mining without a live WebSocket.
  const isRunning = job?.status === "running";
  useEffect(() => {
    if (!isRunning || !enabled || live) return;
    const timer = setInterval(() => void resync(), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [isRunning, enabled, live, resync]);

  const start = useCallback(
    async (minerAddress: string) => {
      setStarting(true);
      try {
        const started = await api.startMining(minerAddress);
        log(
          "mining",
          "info",
          `Blok kazılıyor: ${ltr(`#${started.block_index}`)} (zorluk ${started.difficulty})`,
          `${started.transaction_count} işlem · hedef "${started.target_prefix}…" · ~${formatInt(started.expected_attempts)} beklenen deneme`,
          { dedupeKey: `job:${started.id}:started` },
        );
        handleUpdate(started);
      } catch (err) {
        log("mining", "error", "Kazım başlatılamadı", errorMessage(err));
        throw err;
      } finally {
        setStarting(false);
      }
    },
    [log, handleUpdate],
  );

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      handleUpdate(await api.cancelMining());
    } catch (err) {
      log("mining", "error", "Kazım durdurulamadı", errorMessage(err));
    } finally {
      setCancelling(false);
    }
  }, [log, handleUpdate]);

  return { job, isRunning, starting, cancelling, start, cancel, handleEvent, resync };
}

export type MiningState = ReturnType<typeof useMining>;
