"use client";

import { Hammer, Pickaxe, Square } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/api/client";
import type { MiningJobOut } from "@/lib/api/types";
import { LIMITS } from "@/lib/config";
import { cn } from "@/lib/cn";
import { formatCompact, formatDuration, formatInt } from "@/lib/format";
import type { MiningState } from "@/hooks/useMining";

interface MiningControlsProps {
  difficulty: number;
  pendingCount: number;
  mining: MiningState;
  disabled: boolean;
  onDifficultyChange: (difficulty: number) => Promise<unknown>;
  className?: string;
}

const DIFFICULTIES = Array.from(
  { length: LIMITS.maxDifficulty - LIMITS.minDifficulty + 1 },
  (_, i) => LIMITS.minDifficulty + i,
);

export function MiningControls({
  difficulty,
  pendingCount,
  mining,
  disabled,
  onDifficultyChange,
  className,
}: MiningControlsProps) {
  const [miner, setMiner] = useState("miner-1");
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<number | null>(null);
  const { job, isRunning } = mining;

  // Use the last measured speed to estimate how long the chosen difficulty takes.
  const speed = job?.result?.hashes_per_second ?? job?.progress?.hashes_per_second ?? null;

  const changeDifficulty = async (d: number) => {
    if (d === difficulty) return;
    setChanging(d);
    setError(null);
    try {
      await onDifficultyChange(d);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChanging(null);
    }
  };

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const name = miner.trim();
    if (!name) return setError("Madenci adresi gerekli");
    if (name.length > LIMITS.maxAccountName) return setError(`En fazla ${LIMITS.maxAccountName} karakter`);
    if (name === LIMITS.reservedSender) return setError(`Ad "${LIMITS.reservedSender}" ayrılmıştır`);
    setError(null);
    try {
      await mining.start(name);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Panel
      title="Madencilik"
      icon={Pickaxe}
      subtitle="İş kanıtı: hash hedefi karşılayana kadar nonce değerleri denenir"
      className={className}
      actions={isRunning ? <Badge tone="mining" dot>Çalışıyor</Badge> : null}
      bodyClassName="space-y-4"
    >
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Zorluk (sonraki blok için)</span>
          <span className="font-mono text-[11px] text-subtle">
            ~{formatCompact(16 ** difficulty)} deneme
            {speed ? ` · ≈ ${formatDuration(16 ** difficulty / speed)}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1 rounded-lg border border-border bg-bg/60 p-1" role="radiogroup" aria-label="Zorluk">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === difficulty}
              disabled={disabled || changing !== null}
              onClick={() => changeDifficulty(d)}
              className={cn(
                "h-8 rounded-md font-mono text-sm transition-colors disabled:cursor-not-allowed",
                d === difficulty ? "bg-accent text-bg font-semibold" : "text-muted hover:bg-surface-2 hover:text-fg",
                changing === d && "animate-pulse",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          Hedef: hash şununla başlamalı: <span dir="ltr" className="font-mono text-valid">{"0".repeat(difficulty)}</span>. Her ek sıfır yaklaşık 16 kat daha fazla iş demektir.
        </p>
      </div>

      <form onSubmit={start} className="space-y-3" noValidate>
        <Field
          label="Madenci adresi (ödülü alır)"
          value={miner}
          onChange={(e) => setMiner(e.target.value)}
          disabled={disabled || isRunning}
          autoComplete="off"
          error={error}
        />
        <div className="flex gap-2">
          {isRunning ? (
            <Button variant="danger" icon={Square} loading={mining.cancelling} onClick={mining.cancel} className="flex-1">
              Kazmayı durdur
            </Button>
          ) : (
            <Button type="submit" variant="primary" icon={Hammer} loading={mining.starting} disabled={disabled} className="flex-1">
              Blok kaz{pendingCount > 0 ? ` (${pendingCount} işlem)` : ""}
            </Button>
          )}
        </div>
        {!isRunning && pendingCount === 0 && (
          <p className="text-[11px] text-subtle">Bekleyen işlem yok: blok yalnızca madenci ödülünü içerecek.</p>
        )}
      </form>

      {job && <JobView job={job} />}
    </Panel>
  );
}

/** Live (or last) mining job: nonce, current hash, attempts, timing, progress. */
function JobView({ job }: { job: MiningJobOut }) {
  const running = job.status === "running";
  const attempts = job.result?.attempts ?? job.progress?.attempts ?? 0;
  const elapsed = job.result?.duration_seconds ?? job.progress?.elapsed_seconds ?? 0;
  const hash = job.result?.hash ?? job.progress?.current_hash ?? null;
  const nonce = job.result?.nonce ?? job.progress?.nonce ?? null;
  const rate = job.result?.hashes_per_second ?? job.progress?.hashes_per_second ?? 0;
  // Mining is luck: this is attempts vs. the *average* needed, capped for display.
  const ratio = Math.min(attempts / job.expected_attempts, 1);

  const tone = { running: "mining", completed: "valid", cancelled: "neutral", failed: "invalid" } as const;
  const jobLabel = { running: "Çalışıyor", completed: "Tamamlandı", cancelled: "İptal edildi", failed: "Başarısız" } as const;

  return (
    <section className={cn("rounded-lg border p-3", running ? "border-mining/30 bg-mining/4" : "border-border bg-bg/40")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold">
          {running ? "Kazılıyor" : "Son çalıştırma"} · Blok <bdi>#{job.block_index}</bdi>
        </h3>
        <Badge tone={tone[job.status]} dot>
          {jobLabel[job.status]}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <Stat label="Nonce" value={nonce === null ? "—" : formatInt(nonce)} />
        <Stat label="Denemeler" value={formatInt(attempts)} />
        <Stat label="Süre" value={formatDuration(elapsed)} />
        <Stat label="Hız" value={`${formatCompact(rate)} hash/sn`} />
        <div className="col-span-2 min-w-0">
          <dt className="mb-1 text-[11px] font-medium tracking-wider text-subtle uppercase">
            {running ? "Geçerli hash" : "Son hash"}{" "}
            <span className="normal-case">· Hedef <span dir="ltr">{job.target_prefix}…</span></span>
          </dt>
          <dd>{hash ? <HashText hash={hash} full highlightZeros={!running} /> : <span className="font-mono text-subtle">Başlatılıyor…</span>}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", job.status === "completed" ? "bg-valid" : "bg-mining")}
            style={{ width: `${job.status === "completed" ? 100 : ratio * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          {formatInt(attempts)} / ~{formatInt(job.expected_attempts)} beklenen deneme. Şansa bağlıdır; daha erken veya daha geç bitebilir.
        </p>
      </div>
      {job.status === "failed" && (
        <p className="mt-2 text-xs text-invalid">
          {job.error?.startsWith("block rejected") ? "Zincir bloğu reddetti (kazım sırasında son blok değişmiş olabilir)." : "Kazım sırasında bir hata oluştu."}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wider text-subtle uppercase">{label}</dt>
      <dd className="truncate font-mono tabular-nums">{value}</dd>
    </div>
  );
}
