"use client";

import { Bug, Hammer, Plug, Radio, RefreshCw, ScanSearch, Send, Trash2, Unplug } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { NODE_LABEL, NODE_TONE, nodeVisual, OUTCOME_COLOR } from "@/components/network/networkVisuals";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/api/client";
import type { InvalidBlockKind, NodeDetailOut, NodeHistoryEntry } from "@/lib/api/types";
import { ISSUE_EXPLANATION } from "@/lib/blockStatus";
import { cn } from "@/lib/cn";
import { formatAmount, formatCompact, formatTime } from "@/lib/format";
import { groupLabel, INVALID_KIND_LABEL, OUTCOME_LABEL, SYNC_REASON_LABEL } from "@/lib/networkText";
import type { NetworkState } from "@/hooks/useNetwork";

const EXPERIMENTS: Array<{ kind: InvalidBlockKind; explain: string }> = [
  { kind: "tampered", explain: "Bir blok kaz, sonra düzenle. Saklanan hash’i içeriğiyle eşleşmeyecek." },
  { kind: "no_work", explain: "Kazmayı atla. Hash yeterli sayıda sıfırla başlamayacak." },
  { kind: "inflated_reward", explain: "Madenciye izin verilen ödülün 1000 katını öde." },
  { kind: "unknown_parent", explain: "Var olmayan bir blok üzerine kur; kimse geçmişini doğrulayamaz." },
];

interface NodeInspectorProps {
  detail: NodeDetailOut | null;
  names: Map<string, string>;
  actions: NetworkState["actions"];
  disabled: boolean;
  className?: string;
}

export function NodeInspector({ detail, names, actions, disabled, className }: NodeInspectorProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<InvalidBlockKind>("tampered");

  if (!detail) {
    return (
      <Panel title="Düğüm" icon={ScanSearch} className={className}>
        <p className="text-sm text-muted">İncelemek için bir düğüm seçin.</p>
      </Panel>
    );
  }

  const visual = nodeVisual(detail);
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
  const name = (id?: string) => (id ? (names.get(id) ?? id) : "?");

  return (
    <Panel
      title={detail.name}
      icon={ScanSearch}
      subtitle={`${detail.id} · ${groupLabel(detail.group)}`}
      actions={<Badge tone={NODE_TONE[visual]} dot>{visual === "behind" && detail.behind_by > 0 ? `Geride ${detail.behind_by}` : NODE_LABEL[visual]}</Badge>}
      className={className}
      bodyClassName="scrollbar-thin max-h-[860px] space-y-4 overflow-y-auto"
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Yükseklik" value={String(detail.height)} />
        <Stat label="Toplam iş" value={formatCompact(detail.total_work)} />
        <Stat label="Bekleyen" value={String(detail.pending_count)} />
      </dl>
      <div className="text-xs">
        <p className="mb-1 text-[11px] font-medium tracking-wider text-subtle uppercase">Son blok</p>
        <HashText hash={detail.tip_hash} full copyable />
        {!detail.validation.is_valid && <p className="mt-1 text-invalid">Bu düğümün kendi zinciri doğrulamayı geçemiyor.</p>}
      </div>

      {/* ------------------------------------------------------ actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" icon={Hammer} loading={busy === "mine"} disabled={disabled || detail.mining || busy !== null} onClick={() => act("mine", () => actions.mine(detail.id))}>
          {detail.mining ? "Kazılıyor…" : "Blok kaz"}
        </Button>
        {detail.online ? (
          <Button variant="warning" icon={Unplug} loading={busy === "online"} disabled={disabled || busy !== null} onClick={() => act("online", () => actions.setOnline(detail.id, false))}>
            Bağlantıyı kes
          </Button>
        ) : (
          <Button variant="secondary" icon={Plug} loading={busy === "online"} disabled={disabled || busy !== null} onClick={() => act("online", () => actions.setOnline(detail.id, true))}>
            Yeniden bağlan
          </Button>
        )}
        <Button icon={RefreshCw} loading={busy === "sync"} disabled={disabled || busy !== null || !detail.online} onClick={() => act("sync", () => actions.sync(detail.id))} title="Erişilebilir düğümlerin zincirlerini iste">
          Düğümlerden senkronize et
        </Button>
        <Button icon={Radio} loading={busy === "broadcast"} disabled={disabled || busy !== null || detail.height === 0} onClick={() => act("broadcast", () => actions.broadcast(detail.id))} title="Bu düğümün son bloğunu tüm düğümlere yeniden gönder">
          Son bloğu yeniden yayınla
        </Button>
      </div>
      {!detail.online && <p className="text-[11px] text-subtle">Çevrimdışı: hâlâ kazabilir, ancak bağlantısı geri gelene kadar gönderdiği hiçbir şey ulaşmaz.</p>}

      {/* -------------------------------------------------- transaction */}
      <TransactionMini disabled={disabled} onSubmit={(tx) => actions.submitTransaction(detail.id, tx)} />

      {/* -------------------------------------------------- experiment */}
      <section className="rounded-lg border border-invalid/25 bg-invalid/4 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Bug className="size-4 text-invalid" aria-hidden />
          <h3 className="text-xs font-semibold">Geçersiz blok deneyi</h3>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Geçersiz blok türü">
          {EXPERIMENTS.map((e) => (
            <button
              key={e.kind}
              type="button"
              role="radio"
              aria-checked={experiment === e.kind}
              onClick={() => setExperiment(e.kind)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-start text-[11px] transition-colors",
                experiment === e.kind ? "border-invalid/60 bg-invalid/10 text-fg" : "border-border text-muted hover:border-border-strong",
              )}
            >
              {INVALID_KIND_LABEL[e.kind]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">{EXPERIMENTS.find((e) => e.kind === experiment)?.explain}</p>
        <Button
          size="sm"
          variant="danger"
          icon={Send}
          className="mt-2"
          loading={busy === "invalid"}
          disabled={disabled || busy !== null}
          onClick={() => act("invalid", () => actions.sendInvalidBlock(detail.id, experiment))}
        >
          Geçersiz blok yayınla
        </Button>
        <p className="mt-1.5 text-[11px] text-subtle">Asla şunun kendi zincirine eklenmez: {detail.name} . Diğer düğümlerin onu reddetmesini izleyin.</p>
      </section>

      {error && <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid/10 px-3 py-2 text-xs text-invalid">{error}</p>}

      {/* ------------------------------------------------------ history */}
      <Section title="Bu düğümün aldıkları">
        {detail.history.length === 0 ? (
          <p className="text-xs text-subtle">Henüz bir şey yok. Başka bir düğümde bir blok kazın.</p>
        ) : (
          <ol className="divide-y divide-border/60 rounded-lg border border-border">
            {detail.history.slice(0, 15).map((entry, i) => (
              <HistoryRow key={`${entry.at}-${i}`} entry={entry} name={name} />
            ))}
          </ol>
        )}
      </Section>

      {/* -------------------------------------------------------- chain */}
      <Section title={`Zinciri (${detail.chain.length} blok)`}>
        <ol className="scrollbar-thin max-h-56 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
          {[...detail.chain].reverse().map((block) => (
            <li key={block.hash} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="font-mono font-semibold">#{block.index}</span>
              <HashText hash={block.hash} head={12} tail={4} className="flex-1" />
              <span className="text-subtle">
                {block.transactions[0]?.sender === "NETWORK" ? `Madenci: ${name(block.transactions[0].receiver)}` : block.is_genesis ? "Genesis" : ""}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Button size="sm" variant="ghost" icon={Trash2} disabled={disabled || busy !== null} onClick={() => act("remove", () => actions.removeNode(detail.id))}>
        Kaldır: {detail.name}
      </Button>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 py-2">
      <dd className="font-mono text-lg font-semibold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-subtle">{label}</dt>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium tracking-wider text-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

const OUTCOME_TONE: Record<string, BadgeTone> = {
  accepted: "valid",
  rejected: "invalid",
  orphan: "mining",
  stale: "neutral",
  duplicate: "neutral",
};

function HistoryRow({ entry, name }: { entry: NodeHistoryEntry; name: (id?: string) => string }) {
  let badge: ReactNode = null;
  let text: ReactNode = null;
  let reason: string | null = null;

  switch (entry.kind) {
    case "received":
      badge = <Badge tone={OUTCOME_TONE[entry.outcome ?? ""] ?? "neutral"} dot>{OUTCOME_LABEL[entry.outcome ?? ""] ?? entry.outcome}</Badge>;
      text = <>Blok <bdi>#{entry.block_index}</bdi> / {name(entry.from_node)}</>;
      if (entry.reasons?.[0]) reason = `${entry.reasons[0].code}: ${ISSUE_EXPLANATION[entry.reasons[0].code] ?? entry.reasons[0].message}`;
      break;
    case "sync":
      badge = <Badge tone={entry.adopted ? "genesis" : "neutral"} dot>{entry.adopted ? "Benimsedi" : "Kendi zincirini korudu"}</Badge>;
      text = <>Şuradan zincir: {name(entry.from_node)}</>;
      reason = entry.adopted
        ? `Daha fazla toplam iş${entry.reorg_depth ? `; değiştirildi: ${entry.reorg_depth} blok` : ""}${entry.returned_transactions ? `, ${entry.returned_transactions} işlem bekleyen havuza döndü` : ""}`
        : entry.reason === "not_more_work"
          ? entry.resolved === false
            ? "Yetim blok yok sayıldı: gönderenin zinciri daha fazla işe sahip değil"
            : "Zincirimizden daha fazla işe sahip değil (eşitlikte ilk görülen zincir kazanır)"
          : `Reddedildi: ${SYNC_REASON_LABEL[entry.reason ?? ""] ?? entry.reason}${entry.issues?.[0] ? ` (${entry.issues[0].code})` : ""}`;
      break;
    case "mined":
      badge = <Badge tone="valid" dot>Kazıldı</Badge>;
      text = <>Blok <bdi>#{entry.block_index}</bdi></>;
      break;
    case "mining_stale":
      badge = <Badge tone="untrusted" dot>Eskimiş</Badge>;
      text = <>Bloğu atıldı: <bdi>#{entry.block_index}</bdi></>;
      reason = "Aynı yükseklikte başka bir blok önce geldi";
      break;
    case "invalid_sent":
      badge = <Badge tone="invalid" dot>Kötü blok gönderdi</Badge>;
      text = <>Geçersiz blok ({entry.invalid_kind ? INVALID_KIND_LABEL[entry.invalid_kind] : ""})</>;
      break;
    case "connection":
      badge = <Badge tone={entry.online ? "valid" : "neutral"} dot>{entry.online ? "Çevrimiçi" : "Çevrimdışı"}</Badge>;
      text = entry.online ? "Yeniden bağlandı" : "Bağlantısı kesildi";
      break;
    case "transaction":
      badge = <Badge tone="info" dot>İşlem</Badge>;
      text = "Buraya gönderildi";
      break;
  }

  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {badge}
          <span className="truncate">{text}</span>
        </span>
        <time className="shrink-0 font-mono text-[11px] text-subtle">{formatTime(entry.at)}</time>
      </div>
      {reason && (
        <p className="mt-1 text-[11px] text-muted" style={entry.outcome === "rejected" ? { color: OUTCOME_COLOR.rejected } : undefined}>
          {reason}
        </p>
      )}
    </li>
  );
}

function TransactionMini({ disabled, onSubmit }: { disabled: boolean; onSubmit: (tx: { sender: string; receiver: string; amount: number }) => Promise<unknown> }) {
  const [sender, setSender] = useState("alice");
  const [receiver, setReceiver] = useState("bob");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!sender.trim() || !receiver.trim() || sender.trim() === receiver.trim() || !(value > 0)) {
      setError("İki farklı hesap ve 0’dan büyük bir tutar kullanın");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ sender: sender.trim(), receiver: receiver.trim(), amount: value });
      setSent(`${sender.trim()} → ${receiver.trim()}: ${formatAmount(value)} diğer düğümlere yayıldı`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold">Bu düğüme bir işlem gönder</h3>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Kimden" value={sender} onChange={(e) => setSender(e.target.value)} disabled={disabled} id="net-tx-from" />
        <Field label="Kime" value={receiver} onChange={(e) => setReceiver(e.target.value)} disabled={disabled} id="net-tx-to" />
        <Field label="Tutar" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} disabled={disabled} id="net-tx-amount" />
      </div>
      <Button type="submit" size="sm" icon={Send} loading={busy} disabled={disabled}>
        Gönder ve yay
      </Button>
      {error && <p className="text-xs text-invalid">{error}</p>}
      {sent && !error && <p className="text-[11px] text-subtle">{sent}</p>}
    </form>
  );
}
