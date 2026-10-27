"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/api/client";
import { networkApi } from "@/lib/api/network";
import type { InvalidBlockKind, NetworkStatusOut, NodeDetailOut, TransactionCreate } from "@/lib/api/types";
import { ISSUE_EXPLANATION } from "@/lib/blockStatus";
import { EXPECTED_REJECTION, INVALID_KIND_LABEL, localizeNode, localizeStatus, STALE_REASON } from "@/lib/networkText";
import type { MessageKind, ServerEvent } from "@/lib/realtime/connection";
import type { LogFn } from "@/hooks/useActivityLog";
import { ltr } from "@/lib/format";

/** How a message in flight ended (drives the arrival effect in the 3D scene). */
export type PacketOutcome = "accepted" | "rejected" | "duplicate" | "orphan" | "stale" | "adopted" | "kept" | "dropped";

export interface Packet {
  id: string;
  kind: MessageKind;
  from: string;
  to: string;
  /** performance.now() when it left, and how long the trip takes. */
  startedAt: number;
  durationMs: number;
  outcome: PacketOutcome | null;
  invalid: boolean;
  /** Dropped before leaving (receiver unreachable): only fizzles out near the sender. */
  neverSent: boolean;
}

/** Without a WebSocket we can't see packets, so poll more often. */
const POLL_LIVE_MS = 15_000;
const POLL_FALLBACK_MS = 3_000;
const REFRESH_DEBOUNCE_MS = 120;
/** Keep a finished packet around this long for its arrival effect. */
const PACKET_LINGER_MS = 1_400;
const MAX_PACKETS = 200;

interface Options {
  log: LogFn;
  live: boolean;
  /** The Network tab is visible (no background polling otherwise). */
  active: boolean;
}

export function useNetwork({ log, live, active }: Options) {
  const [status, setStatus] = useState<NetworkStatusOut | null>(null);
  const [detail, setDetail] = useState<NodeDetailOut | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  const namesRef = useRef(new Map<string, string>());
  const name = (id: string) => namesRef.current.get(id) ?? id;

  // ------------------------------------------------------------- loading
  const refresh = useCallback(async () => {
    try {
      const next = localizeStatus(await networkApi.status());
      namesRef.current = new Map(next.nodes.map((n) => [n.id, n.name]));
      setStatus(next);
      setError(null);
      // Keep the selection valid (a node may have been removed or the network reset).
      let id = selectedRef.current;
      if (!id || !next.nodes.some((n) => n.id === id)) {
        id = next.nodes[0]?.id ?? null;
        selectedRef.current = id;
        setSelectedId(id);
      }
      if (id) setDetail(localizeNode(await networkApi.node(id)));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);
  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // Load when the tab opens; slow safety-net polling while it's visible.
  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(() => void refresh(), live ? POLL_LIVE_MS : POLL_FALLBACK_MS);
    return () => clearInterval(timer);
  }, [active, live, refresh]);

  // Loading a different node's detail when the selection changes.
  const select = useCallback((id: string) => {
    selectedRef.current = id;
    setSelectedId(id);
    networkApi.node(id).then((d) => setDetail(localizeNode(d)), (err) => setError(errorMessage(err)));
  }, []);

  // --------------------------------------------------------------- packets
  const resolve = useCallback((messageId: string, outcome: PacketOutcome) => {
    setPackets((prev) => prev.map((p) => (p.id === messageId ? { ...p, outcome } : p)));
  }, []);

  // Drop finished packets once their effect has played.
  const hasPackets = packets.length > 0;
  useEffect(() => {
    if (!hasPackets) return;
    const timer = setInterval(() => {
      const now = performance.now();
      setPackets((prev) => {
        const next = prev.filter((p) => {
          const end = p.startedAt + p.durationMs;
          return p.outcome === null ? now < end + 5_000 : now < end + PACKET_LINGER_MS;
        });
        return next.length === prev.length ? prev : next;
      });
    }, 400);
    return () => clearInterval(timer);
  }, [hasPackets]);

  // ---------------------------------------------------------- live events
  const handleEvent = useCallback(
    (event: ServerEvent) => {
      if (!event.type.startsWith("network.")) return;
      const key = (suffix: string) => ({ dedupeKey: `net:${event.seq}:${suffix}` });

      switch (event.type) {
        case "network.message_sent": {
          const d = event.data;
          const packet: Packet = {
            id: d.message_id,
            kind: d.kind,
            from: d.from_node,
            to: d.to_node,
            startedAt: performance.now(),
            durationMs: d.latency_ms,
            outcome: null,
            invalid: d.invalid_kind !== null,
            neverSent: false,
          };
          setPackets((prev) => [...prev.slice(-(MAX_PACKETS - 1)), packet]);
          return; // nothing changed yet; no refresh
        }
        case "network.message_dropped": {
          const d = event.data;
          setPackets((prev) => {
            if (prev.some((p) => p.id === d.message_id)) {
              return prev.map((p) => (p.id === d.message_id ? { ...p, outcome: "dropped" } : p));
            }
            // Never sent at all: show a short packet that fizzles out near the sender.
            return [
              ...prev.slice(-(MAX_PACKETS - 1)),
              { id: d.message_id, kind: d.kind, from: d.from_node, to: d.to_node, startedAt: performance.now(), durationMs: 450, outcome: "dropped", invalid: false, neverSent: true },
            ];
          });
          return;
        }
        case "network.transaction_received":
          resolve(event.data.message_id, event.data.accepted ? "accepted" : "duplicate");
          break;
        case "network.block_received": {
          const d = event.data;
          resolve(d.message_id, d.outcome);
          if (d.outcome === "rejected") {
            const reason = d.reasons[0];
            log(
              "network",
              "warning",
              `Reddeden: ${name(d.to_node)} · blok ${ltr(`#${d.block_index}`)} · gönderen: ${name(d.from_node)}`,
              reason ? `${reason.code}: ${ISSUE_EXPLANATION[reason.code] ?? reason.message}` : undefined,
              key("rejected"),
            );
          }
          break;
        }
        case "network.sync": {
          const d = event.data;
          resolve(d.message_id, d.adopted ? "adopted" : "kept");
          if (d.adopted) {
            log(
              "network",
              d.reorg_depth > 0 ? "warning" : "info",
              d.reorg_depth > 0
                ? `Zincir değiştirdi: ${name(d.node_id)} → zincir: ${name(d.peer_id)} (yeniden düzenleme: ${d.reorg_depth} blok)`
                : `Yetişti: ${name(d.node_id)} · yükseklik ${d.new_height} / ${name(d.peer_id)}`,
              d.returned_transactions ? `Geri dönen: ${d.returned_transactions} işlem, bekleyen işlem havuzuna` : "Daha fazla toplam işe sahip geçerli zincir",
              key("sync"),
            );
          } else if (d.trigger_block_hash && d.resolved === false) {
            log(
              "network",
              "warning",
              `Yok saydı: ${name(d.node_id)} · yetim blok, kaynak: ${name(d.peer_id)}`,
              "Gönderenin zinciri daha fazla işe sahip geçerli bir geçmiş kanıtlamadı",
              key("orphan"),
            );
          }
          break;
        }
        case "network.block_mined":
          log("network", "success", `Kazıldı: ${name(event.data.node_id)} · blok ${ltr(`#${event.data.block_index}`)}`, "Diğer düğümlere yayınlanıyor…", key("mined"));
          break;
        case "network.mining_stale":
          log("network", "warning", `Yarışı kaybetti: ${name(event.data.node_id)} · blok ${ltr(`#${event.data.block_index}`)}`, STALE_REASON, key("stale"));
          break;
        case "network.invalid_block_created":
          log("network", "warning", `Geçersiz blok yayınladı: ${name(event.data.node_id)} (${INVALID_KIND_LABEL[event.data.kind as keyof typeof INVALID_KIND_LABEL] ?? event.data.kind})`, `Beklenen: ${EXPECTED_REJECTION[event.data.kind as keyof typeof EXPECTED_REJECTION] ?? ""}`, key("invalid"));
          break;
        case "network.node_status":
          log(
            "network",
            event.data.online ? "success" : "warning",
            `${name(event.data.node_id)} ${event.data.online ? "Yeniden bağlandı" : "Bağlantısı kesildi"}`,
            event.data.online ? "Diğer düğümlerle zincir alışverişi yapıyor" : "Bağlantısı geri gelene kadar blokları kaçıracak",
            key("status"),
          );
          break;
        case "network.changed":
          if (event.data.change === "partitioned") log("network", "warning", "Ağ gruplara bölündü", "Her düğüm yalnızca kendi grubuna ulaşabilir", key("chg"));
          if (event.data.change === "healed") log("network", "info", "Ağ yeniden birleştirildi", "Tüm düğümler zincir alışverişi yapıyor ve en çok işe sahip olanda uzlaşıyor", key("chg"));
          break;
        default:
          break; // mining_started: just refresh
      }
      scheduleRefresh();
    },
    [log, resolve, scheduleRefresh],
  );

  // --------------------------------------------------------------- actions
  const run = useCallback(
    async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
      try {
        const result = await action();
        scheduleRefresh();
        return result;
      } catch (err) {
        log("network", "error", `Başarısız: ${label}`, errorMessage(err));
        throw err;
      }
    },
    [log, scheduleRefresh],
  );

  const actions = {
    mine: (id: string) => run("Madencilik", () => networkApi.mine(id)),
    setOnline: (id: string, online: boolean) => run(online ? "Yeniden bağlanma" : "Bağlantıyı kesme", () => networkApi.setOnline(id, online)),
    sync: (id: string) => run("Senkronizasyon", () => networkApi.sync(id)),
    broadcast: (id: string) => run("Yayın", () => networkApi.broadcast(id)),
    sendInvalidBlock: (id: string, kind: InvalidBlockKind) => run("Geçersiz blok deneyi", () => networkApi.sendInvalidBlock(id, kind)),
    submitTransaction: (id: string, tx: TransactionCreate) => run("İşlem", () => networkApi.submitTransaction(id, tx)),
    addNode: () => run("Düğüm ekleme", () => networkApi.addNode()),
    removeNode: (id: string) => run("Düğüm kaldırma", () => networkApi.removeNode(id)),
    setLatency: (latency: number, jitter: number) => run("Gecikme değişikliği", () => networkApi.setLatency(latency, jitter)),
    split: () =>
      run("Bölme", () => {
        const ids = status?.nodes.map((n) => n.id) ?? [];
        const half = Math.ceil(ids.length / 2);
        return networkApi.partition([ids.slice(0, half), ids.slice(half)]);
      }),
    heal: () => run("Yeniden birleştirme", () => networkApi.heal()),
    reset: (nodes: number, difficulty: number) =>
      run("Sıfırlama", async () => {
        setPackets([]);
        return networkApi.reset(nodes, difficulty);
      }),
  };

  return { status, detail, selectedId, select, packets, error, refresh, handleEvent, actions };
}

export type NetworkState = ReturnType<typeof useNetwork>;
