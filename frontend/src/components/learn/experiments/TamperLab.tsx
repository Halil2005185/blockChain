"use client";

/**
 * Guided tampering experiment on the user's Single chain (behind LabGuard).
 * Steps tick themselves off from the backend's validation report.
 */

import { Hammer, PencilLine, RotateCcw, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { ChainStrip } from "@/components/dashboard/ChainStrip";
import { LabGuard } from "@/components/learn/LabGuard";
import { Callout, LabCard, StepList, type LabContext } from "@/components/learn/labKit";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/blockchain";
import { errorMessage } from "@/lib/api/client";
import { blockStatus, ISSUE_EXPLANATION } from "@/lib/blockStatus";

const NEEDED_HEIGHT = 3;

export function TamperLab({ ctx }: { ctx: LabContext }) {
  return (
    <LabCard title="Geçmişi kurcala" scope="chain">
      <LabGuard ctx={ctx} scope="chain" willDo="Bu deney tek zincirinizdeki blok 1’i değiştirir, ardından onarmak için blokları yeniden kazar.">
        <TamperSteps ctx={ctx} />
      </LabGuard>
    </LabCard>
  );
}

function TamperSteps({ ctx }: { ctx: LabContext }) {
  const chain = ctx.bc.chain;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tampered, setTampered] = useState(false);
  const [reminedFirst, setReminedFirst] = useState(false);
  const [armedReset, setArmedReset] = useState(false);
  const [selected, setSelected] = useState(1);

  useEffect(() => {
    if (!armedReset) return;
    const t = setTimeout(() => setArmedReset(false), 4000);
    return () => clearTimeout(t);
  }, [armedReset]);

  if (!chain) return <p className="text-sm text-muted">Yükleniyor…</p>;
  const report = chain.validation;
  const height = chain.height;

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

  const mineMissing = () =>
    act("mine", async () => {
      for (let i = height; i < NEEDED_HEIGHT; i++) {
        await ctx.bc.createTransaction({ sender: "alice", receiver: "bob", amount: 5 + i });
        await api.mineAndWait("learner");
      }
      await ctx.bc.refresh();
    });

  const firstInvalid = report.first_invalid_index;
  const hasEnough = height >= NEEDED_HEIGHT;
  const block1Broken = report.issues.some((i) => i.index === 1 && i.code === "hash_mismatch");
  const linkBroken = report.issues.some((i) => i.code === "broken_link");
  const statuses = chain.chain.map((b) => blockStatus(b, report));
  const count = (s: string) => statuses.filter((x) => x === s).length;
  const disabled = !ctx.online || busy !== null || ctx.mining.isRunning;

  const steps = [
    {
      label: `Zincirin genesis bloğundan sonra en az ${NEEDED_HEIGHT} bloğa ihtiyacı var (şu an ${height}).`,
      done: hasEnough,
      action: !hasEnough && (
        <Button size="sm" icon={Hammer} loading={busy === "mine"} disabled={disabled} onClick={mineMissing}>
          Kaz: {NEEDED_HEIGHT - height} blok
        </Button>
      ),
    },
    {
      label: "Blok 1’in verisini yeniden kazmadan değiştir.",
      done: tampered || block1Broken,
      action: hasEnough && !tampered && (
        <Button size="sm" variant="warning" icon={PencilLine} loading={busy === "tamper"} disabled={disabled} onClick={() => act("tamper", async () => {
          await ctx.bc.tamperBlock(1, { data: "rewritten during a lesson" });
          setTampered(true);
        })}>
          Blok 1’i kurcala
        </Button>
      ),
    },
    {
      label: "Blok 1’i yeniden kaz. Hash’i düzelir ama blok 2’nin bağlantısı kopar.",
      done: reminedFirst,
      action: tampered && !reminedFirst && (
        <Button size="sm" icon={Wrench} loading={busy === "remine1"} disabled={disabled} onClick={() => act("remine1", async () => {
          await ctx.bc.remineBlock(1);
          setReminedFirst(true);
        })}>
          Blok 1’i yeniden kaz
        </Button>
      ),
    },
    {
      label: "Zincirin tamamı yeniden geçerli olana kadar sonraki her kopuk bloğu yeniden kaz.",
      done: reminedFirst && report.is_valid,
      action: reminedFirst && !report.is_valid && firstInvalid !== null && (
        <Button size="sm" icon={Wrench} loading={busy === "remine"} disabled={disabled} onClick={() => act("remine", () => ctx.bc.remineBlock(firstInvalid))}>
          Yeniden kaz: blok {firstInvalid}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <StepList steps={steps} />

      <ChainStrip blocks={chain.chain} validation={report} selectedIndex={selected} onSelect={setSelected} miningJob={ctx.mining.job} />

      <div className="grid gap-2 sm:grid-cols-3">
        <Compare tone="valid" label="Geçerli" count={count("valid") + count("genesis")} text="Tüm kontrolleri geçer ve geçerli bloklar üzerine kurulur." />
        <Compare tone="invalid" label="Geçersiz" count={count("invalid")} text="Bir kuralı kendisi ihlal eder (yanlış hash, kopuk bağlantı…)." />
        <Compare tone="untrusted" label="Güvenilmez" count={count("untrusted")} text="Kendi başına sağlam, ancak geçersiz bir blok üzerine kurulu." />
      </div>

      {report.issues.length > 0 && (
        <ul className="space-y-1.5">
          {report.issues.map((issue, i) => (
            <li key={i} className="rounded-lg border border-invalid/30 bg-invalid/6 px-3 py-2 text-xs">
              <span className="font-mono font-semibold text-invalid">#{issue.index} {issue.code}</span>: {ISSUE_EXPLANATION[issue.code] ?? issue.message}
            </li>
          ))}
        </ul>
      )}

      {linkBroken && reminedFirst && (
        <Callout tone="warn">
          Yeniden kazım sorunu taşıdı: blok 1 yeniden geçerli, ancak sonraki blok hâlâ blok 1’in eski hash’ini gösteriyor.
        </Callout>
      )}
      {reminedFirst && report.is_valid && (
        <Callout tone="good">
          Zincir yeniden geçerli, ancak 1’den itibaren her bloğun yeni bir hash’i var. Gerçek bir ağda diğer düğümler orijinal zinciri tutar ve bu yeniden yazılmış kopyanın benimsenmesi için onların tüm işini geçmesi gerekir.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant={armedReset ? "danger" : "ghost"} icon={RotateCcw} disabled={disabled} loading={busy === "reset"} onClick={() => {
          if (!armedReset) return setArmedReset(true);
          setArmedReset(false);
          void act("reset", async () => {
            await ctx.bc.resetChain();
            setTampered(false);
            setReminedFirst(false);
          });
        }}>
          {armedReset ? "Zincirinizi silmek için tekrar tıklayın" : "Zinciri sıfırla ve baştan başla"}
        </Button>
      </div>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </div>
  );
}

function Compare({ tone, label, count, text }: { tone: "valid" | "invalid" | "untrusted"; label: string; count: number; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3">
      <div className="flex items-center justify-between">
        <Badge tone={tone} dot>{label}</Badge>
        <span className="font-mono text-lg font-semibold">{count}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">{text}</p>
    </div>
  );
}
