"use client";

/**
 * Building blocks shared by every lesson experiment: the context they receive,
 * a card with a "what this changes" badge, a step list and a result line.
 */

import { CheckCircle2, Circle, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import type { BlockchainState } from "@/hooks/useBlockchain";
import type { MiningState } from "@/hooks/useMining";
import type { NetworkState } from "@/hooks/useNetwork";
import { cn } from "@/lib/cn";

/** Everything an experiment may use: the app's existing hooks, nothing new. */
export interface LabContext {
  bc: BlockchainState;
  mining: MiningState;
  network: NetworkState;
  online: boolean;
  live: boolean;
  openTab: (view: "chain" | "network") => void;
}

export type LabScope = "sandbox" | "adds" | "chain" | "network";

const SCOPE: Record<LabScope, { tone: "valid" | "info" | "mining"; text: string }> = {
  sandbox: { tone: "valid", text: "Yalıtılmış deney: hiçbir şey kaydedilmez" },
  adds: { tone: "info", text: "Tek zincirinize ekler (hiçbir şey silinmez)" },
  chain: { tone: "mining", text: "Tek zincirinizi değiştirir" },
  network: { tone: "mining", text: "Ağ simülasyonunu değiştirir" },
};

export function LabCard({ title, scope, children }: { title: string; scope: LabScope; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface/90" aria-label={`Deney: ${title}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="size-4 text-accent" aria-hidden /> {title}
        </h3>
        <Badge tone={SCOPE[scope].tone}>{SCOPE[scope].text}</Badge>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export interface LabStep {
  label: ReactNode;
  done: boolean;
  action?: ReactNode;
}

/** Numbered steps that tick themselves off as the app state changes. */
export function StepList({ steps }: { steps: LabStep[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li
          key={i}
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
            step.done ? "border-valid/30 bg-valid/5" : i === current ? "border-accent/40 bg-accent/5" : "border-border opacity-70",
          )}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            {step.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-valid" aria-label="Tamamlandı" />
            ) : (
              <Circle className="size-4 shrink-0 text-subtle" aria-label="Henüz tamamlanmadı" />
            )}
            <span className="min-w-0">{step.label}</span>
          </span>
          {step.action}
        </li>
      ))}
    </ol>
  );
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "good" | "bad"; children: ReactNode }) {
  const styles = {
    info: "border-accent/30 bg-accent/5 text-fg/90",
    warn: "border-mining/30 bg-mining/6 text-fg/90",
    good: "border-valid/30 bg-valid/6 text-fg/90",
    bad: "border-invalid/30 bg-invalid/8 text-fg/90",
  };
  return <div className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed", styles[tone])}>{children}</div>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span dir="ltr" className={cn("font-mono break-all", className)}>{children}</span>;
}
