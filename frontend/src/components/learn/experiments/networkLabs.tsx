"use client";

/**
 * Experiments on the multi-node simulation. They reuse the Network tab's
 * hook (actions + live status) and its 3D scene; steps tick themselves off
 * from the network status the backend reports.
 */

import { Hammer, Merge, Plug, Send, Split, Timer, Unplug } from "lucide-react";
import { useEffect, useState } from "react";

import { LabGuard } from "@/components/learn/LabGuard";
import { Callout, LabCard, StepList, type LabContext } from "@/components/learn/labKit";
import { NetworkScene } from "@/components/network/NetworkScene";
import { NodeTable } from "@/components/network/NodeTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/api/client";
import { networkApi } from "@/lib/api/network";
import type { InvalidBlockKind, NodeDetailOut, NodeSummaryOut } from "@/lib/api/types";
import { ISSUE_EXPLANATION } from "@/lib/blockStatus";
import { EXPECTED_REJECTION, INVALID_KIND_LABEL, OUTCOME_LABEL } from "@/lib/networkText";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";

function useAct() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, act };
}

function NetworkPeek({ ctx }: { ctx: LabContext }) {
  const status = ctx.network.status;
  if (!status) return null;
  return (
    <div className="space-y-3">
      <NetworkScene status={status} packets={ctx.network.packets} selectedId={ctx.network.selectedId} onSelect={ctx.network.select} live={ctx.live} />
      <NodeTable status={status} selectedId={ctx.network.selectedId} onSelect={ctx.network.select} />
    </div>
  );
}

function LatencyHint({ ctx }: { ctx: LabContext }) {
  const status = ctx.network.status;
  if (!status || status.latency_ms >= 1000) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
      Gecikme {status.latency_ms} ms; bloklar hızlı yayılıyor.
      <Button size="sm" variant="ghost" icon={Timer} onClick={() => void ctx.network.actions.setLatency(1500, 300)}>
        1.5 sn’ye yavaşlat
      </Button>
    </p>
  );
}


// -------------------------------------------------------- offline / reconnect
export function NodeOfflineLab({ ctx }: { ctx: LabContext }) {
  return (
    <LabCard title="Bir düğümün bağlantısını kesip yeniden bağla" scope="network">
      <LabGuard ctx={ctx} scope="network" willDo="Bu deney son düğümün bağlantısını keser, ilk düğümde bir blok kazar, sonra son düğümü yeniden bağlar.">
        <OfflineSteps ctx={ctx} />
      </LabGuard>
    </LabCard>
  );
}

function OfflineSteps({ ctx }: { ctx: LabContext }) {
  const nodes = ctx.network.status?.nodes ?? [];
  const a = nodes[0];
  const d = nodes[nodes.length - 1];
  const { busy, error, act } = useAct();
  const [wentOffline, setWentOffline] = useState(false);
  const [fellBehind, setFellBehind] = useState(false);

  useEffect(() => {
    if (d && !d.online) setWentOffline(true);
    if (d && !d.online && d.behind_by > 0) setFellBehind(true);
  }, [d]);

  if (!a || !d || nodes.length < 2) return <Callout>Ağın en az iki düğüme ihtiyacı var. Dört düğüm için baştan başlayın.</Callout>;
  const caughtUp = fellBehind && d.online && d.behind_by === 0 && d.in_sync;
  const disabled = !ctx.online || busy !== null;

  return (
    <div className="space-y-4">
      <LatencyHint ctx={ctx} />
      <StepList
        steps={[
          {
            label: `Bağlantısını kes: ${d.name}.`,
            done: wentOffline,
            action: d.online && !fellBehind && (
              <Button size="sm" variant="warning" icon={Unplug} loading={busy === "off"} disabled={disabled} onClick={() => act("off", () => ctx.network.actions.setOnline(d.id, false))}>
                Bağlantısını kes: {d.name}
              </Button>
            ),
          },
          {
            label: `Şu düğümde bir blok kaz: ${a.name}. ${d.name} onu alamaz ve geride kalır.`,
            done: fellBehind,
            action: wentOffline && !fellBehind && (
              <Button size="sm" icon={Hammer} loading={busy === "mine"} disabled={disabled || a.mining} onClick={() => act("mine", () => ctx.network.actions.mine(a.id))}>
                Şurada kaz: {a.name}
              </Button>
            ),
          },
          {
            label: `Yeniden bağla: ${d.name}. Diğer düğümler zincirlerini gönderir; o da bunları doğrular ve en çok işe sahip olanı benimser.`,
            done: caughtUp,
            action: fellBehind && !d.online && (
              <Button size="sm" variant="primary" icon={Plug} loading={busy === "on"} disabled={disabled} onClick={() => act("on", () => ctx.network.actions.setOnline(d.id, true))}>
                Yeniden bağla: {d.name}
              </Button>
            ),
          },
        ]}
      />
      {fellBehind && !caughtUp && d.online && <Callout>Zincirler şuraya gidiyor: {d.name} (mor paketler)…</Callout>}
      {caughtUp && <Callout tone="good">Yetişti: {d.name} · yükseklik {d.height} — kimseye güvenmeden: aldığı zincirin tamamını doğruladı.</Callout>}
      <NetworkPeek ctx={ctx} />
      {error && <p className="text-xs text-invalid">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------ invalid blocks
const KINDS: Array<{ kind: InvalidBlockKind; label: string }> = [
  { kind: "tampered", label: INVALID_KIND_LABEL.tampered },
  { kind: "no_work", label: INVALID_KIND_LABEL.no_work },
  { kind: "inflated_reward", label: INVALID_KIND_LABEL.inflated_reward },
  { kind: "unknown_parent", label: INVALID_KIND_LABEL.unknown_parent },
];

export function InvalidBlockLab({ ctx }: { ctx: LabContext }) {
  const nodes = ctx.network.status?.nodes ?? [];
  const sender = nodes[0];
  const peer = nodes[1];
  const [kind, setKind] = useState<InvalidBlockKind>("inflated_reward");
  const [expected, setExpected] = useState<string | null>(null);
  const [peerDetail, setPeerDetail] = useState<NodeDetailOut | null>(null);
  const { busy, error, act } = useAct();

  // Re-read the peer whenever the network changes (events refresh the status).
  const statusKey = ctx.network.status ? JSON.stringify(ctx.network.status.nodes.map((n) => [n.height, n.tip_hash])) : "";
  const packetsDone = ctx.network.packets.filter((p) => p.outcome !== null).length;
  useEffect(() => {
    if (!peer) return;
    networkApi.node(peer.id).then(setPeerDetail, () => {});
  }, [peer?.id, statusKey, packetsDone]);

  if (!sender || !peer) return <LabCard title="Geçersiz bir blok yayınla" scope="sandbox"><Callout>Ağın en az iki düğüme ihtiyacı var.</Callout></LabCard>;
  const fromSender = (peerDetail?.history ?? []).filter((h) => h.from_node === sender.id && (h.kind === "received" || h.kind === "sync")).slice(0, 4);

  return (
    <LabCard title="Geçersiz bir blok yayınla" scope="sandbox">
      <p className="text-xs text-muted">
        {sender.name} kötü bir blok oluşturur ve tüm düğümlere gönderir. Hiçbir zincire asla eklenmez, bu yüzden hiçbir şeyin sıfırlanması gerekmez.
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Geçersiz blok türü">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} onClick={() => setKind(k.kind)} className={cn("rounded-md border px-2 py-1.5 text-start text-xs transition-colors", kind === k.kind ? "border-invalid/60 bg-invalid/10" : "border-border text-muted hover:border-border-strong")}>
            {k.label}
          </button>
        ))}
      </div>
      <Button variant="danger" icon={Send} loading={busy === "send"} disabled={!ctx.online || busy !== null} onClick={() => act("send", async () => {
        await ctx.network.actions.sendInvalidBlock(sender.id, kind);
        setExpected(EXPECTED_REJECTION[kind]);
      })}>
        Şuradan yayınla: {sender.name}
      </Button>
      {expected && <Callout tone="warn">Beklenen: {expected}</Callout>}
      <div>
        <p className="mb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">{peer.name} kararı · gönderen: {sender.name}</p>
        {fromSender.length === 0 ? (
          <p className="text-xs text-subtle">Henüz bir şey yok. Yayından sonra gecikme süresini bekleyin ({ctx.network.status?.latency_ms} ms).</p>
        ) : (
          <ul className="space-y-1.5">
            {fromSender.map((h, i) => {
              const reason = h.reasons?.[0];
              const label = h.kind === "sync" ? (h.adopted ? "Zinciri benimsedi" : h.resolved === false ? "Yetim bloğu yok saydı" : "Kendi zincirini korudu") : (OUTCOME_LABEL[h.outcome ?? ""] ?? h.outcome);
              const tone = h.outcome === "rejected" || h.resolved === false ? "invalid" : h.outcome === "accepted" || h.adopted ? "valid" : "neutral";
              return (
                <li key={i} className="rounded-lg border border-border px-3 py-2 text-xs">
                  <Badge tone={tone} dot>{label}</Badge>{" "}
                  {h.block_index !== undefined && <span>Blok <bdi>#{h.block_index}</bdi></span>}
                  {reason && (
                    <p className="mt-1 text-fg/85">
                      <span className="font-mono text-invalid">{reason.code}</span>: {ISSUE_EXPLANATION[reason.code] ?? reason.message}
                    </p>
                  )}
                  {h.kind === "sync" && h.resolved === false && <p className="mt-1 text-fg/85">Gönderenin zinciri o bloğa giden geçerli bir geçmiş içermiyordu.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// ------------------------------------------------------- partition and heal
export function PartitionLab({ ctx }: { ctx: LabContext }) {
  return (
    <LabCard title="Ağı böl, bir çatallanma oluştur, sonra yeniden birleştir" scope="network">
      <LabGuard ctx={ctx} scope="network" willDo="Bu deney ağı iki gruba böler, her iki tarafta kazar, sonra yeniden birleştirir.">
        <PartitionSteps ctx={ctx} />
      </LabGuard>
    </LabCard>
  );
}

interface Snapshot {
  a: number;
  c: number;
}

function PartitionSteps({ ctx }: { ctx: LabContext }) {
  const status = ctx.network.status;
  const nodes = status?.nodes ?? [];
  const a = nodes[0];
  const c = nodes[Math.ceil(nodes.length / 2)];
  const { busy, error, act } = useAct();
  const [start, setStart] = useState<Snapshot | null>(null);
  const [sawFork, setSawFork] = useState(false);
  const [workAtHeal, setWorkAtHeal] = useState<{ a: number; c: number } | null>(null);

  const partitioned = status?.partitioned ?? false;
  useEffect(() => {
    if (partitioned && a && c && start === null) setStart({ a: a.height, c: c.height });
    if (partitioned && a && c && a.tip_hash !== c.tip_hash && start && a.height > start.a) setSawFork(true);
  }, [partitioned, a, c, start]);

  if (!status || !a || !c || nodes.length < 2) return <Callout>Ağın en az iki düğüme ihtiyacı var. Dört düğüm için baştan başlayın.</Callout>;

  const minedA = start !== null && a.height >= start.a + 1;
  const minedC = start !== null && c.height >= start.c + 2;
  const healed = sawFork && !partitioned && status.in_consensus;
  const disabled = !ctx.online || busy !== null;
  const groupOf = (n: NodeSummaryOut) => (n.group === a.group ? "Grup 1" : "Grup 2");

  return (
    <div className="space-y-4">
      <LatencyHint ctx={ctx} />
      <StepList
        steps={[
          {
            label: "Ağı birbirine ulaşamayan iki gruba böl.",
            done: start !== null,
            action: !partitioned && start === null && (
              <Button size="sm" variant="warning" icon={Split} loading={busy === "split"} disabled={disabled} onClick={() => act("split", ctx.network.actions.split)}>
                Ağı böl
              </Button>
            ),
          },
          {
            label: `Grup 1’de bir blok kaz, şurada: ${a.name}.`,
            done: minedA,
            action: start !== null && !minedA && partitioned && (
              <Button size="sm" icon={Hammer} loading={busy === "mineA"} disabled={disabled || a.mining} onClick={() => act("mineA", () => ctx.network.actions.mine(a.id))}>
                Şurada kaz: {a.name}
              </Button>
            ),
          },
          {
            label: `Grup 2’de iki blok kaz, şurada: ${c.name} (${start ? Math.max(0, c.height - start.c) : 0}/2).`,
            done: minedC,
            action: start !== null && !minedC && partitioned && (
              <Button size="sm" icon={Hammer} loading={busy === "mineC"} disabled={disabled || c.mining} onClick={() => act("mineC", () => ctx.network.actions.mine(c.id))}>
                Şurada kaz: {c.name}
              </Button>
            ),
          },
          {
            label: "Ağı yeniden birleştir. Her düğüm zincirleri karşılaştırır ve en çok işe sahip geçerli olanı izler.",
            done: healed,
            action: minedA && minedC && partitioned && (
              <Button size="sm" variant="primary" icon={Merge} loading={busy === "heal"} disabled={disabled} onClick={() => act("heal", async () => {
                setWorkAtHeal({ a: a.total_work, c: c.total_work });
                await ctx.network.actions.heal();
              })}>
                Ağı yeniden birleştir
              </Button>
            ),
          },
        ]}
      />

      {partitioned && sawFork && (
        <Callout tone="warn">
          Çatallanma! {a.name} ({groupOf(a)}) yüksekliği {a.height};{c.name} ({groupOf(c)}) yüksekliği {c.height}. İki zincir de geçerli ama farklı. Üstteki küplerin renkleri farklı.
        </Callout>
      )}
      {workAtHeal && !healed && <Callout>Ağ yeniden birleştikten sonra zincirler değiş tokuş ediliyor…</Callout>}
      {healed && workAtHeal && (
        <Callout tone="good">
          Düğümler uzlaştı. Toplam iş {formatCompact(workAtHeal.a)} (Grup 1) karşısında {formatCompact(workAtHeal.c)} (Grup 2) idi, bu yüzden düğümler şunu izledi:{" "}
          {workAtHeal.c > workAtHeal.a ? "Grup 2’nin zinciri" : workAtHeal.a > workAtHeal.c ? "Grup 1’in zinciri" : "ilk görülen zincir"}.
          Diğer taraf zincirini yeniden düzenledi ve atılan işlemlerini bekleyen işlem havuzuna geri koydu (etkinlik günlüğüne bakın).
        </Callout>
      )}
      <NetworkPeek ctx={ctx} />
      {error && <p className="text-xs text-invalid">{error}</p>}
    </div>
  );
}

