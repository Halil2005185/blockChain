"use client";

import { ArrowRight, Box, Hammer, Unlink } from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import type { BlockOut, MiningJobOut, ValidationReportOut } from "@/lib/api/types";
import { blockStatus, STATUS_LABEL, type BlockStatus } from "@/lib/blockStatus";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";

interface ChainStripProps {
  blocks: BlockOut[];
  validation: ValidationReportOut;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Running job, drawn as a "ghost" block at the end of the chain. */
  miningJob: MiningJobOut | null;
  className?: string;
}

// Class names must appear in full: Tailwind finds them by scanning the source.
const CARD_STYLE: Record<BlockStatus, string> = {
  genesis: "border-genesis/50 bg-genesis/7 shadow-[0_0_24px_-8px_var(--color-genesis)]",
  valid: "border-valid/35 bg-valid/5 shadow-[0_0_24px_-12px_var(--color-valid)]",
  invalid: "border-invalid/60 bg-invalid/8 shadow-[0_0_24px_-8px_var(--color-invalid)]",
  untrusted: "border-untrusted/50 bg-untrusted/6",
  mining: "border-mining/60 border-dashed bg-mining/6 animate-pulse-glow",
};

const LEGEND: Array<[label: string, dotClass: string]> = [
  ["Genesis", "bg-genesis"],
  ["Geçerli", "bg-valid"],
  ["Geçersiz", "bg-invalid"],
  ["Güvenilmez", "bg-untrusted"],
  ["Kazılıyor", "bg-mining"],
];

/**
 * 2D stand-in for the 3D scene (Phase 4): blocks left-to-right, each linked
 * to its predecessor. A red, broken connector marks a `broken_link` issue.
 */
export function ChainStrip({ blocks, validation, selectedIndex, onSelect, miningJob, className }: ChainStripProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const brokenLinks = new Set(
    validation.issues.filter((i) => i.code === "broken_link").map((i) => i.index),
  );
  const mining = miningJob?.status === "running" ? miningJob : null;

  // Keep the newest block in view when the chain grows or mining starts.
  useEffect(() => {
    const el = scroller.current;
    // In right-to-left layouts the newest block is at the far left (negative scrollLeft).
    if (el) el.scrollTo({ left: getComputedStyle(el).direction === "rtl" ? -el.scrollWidth : el.scrollWidth, behavior: "smooth" });
  }, [blocks.length, mining?.id]);

  return (
    <Panel
      title="Zincir"
      icon={Box}
      subtitle="2B görünüm: bloklar previous_hash ile bağlıdır"
      className={className}
      flush
      actions={<Legend />}
    >
      <div ref={scroller} className="scrollbar-thin overflow-x-auto">
        <ol className="flex w-max items-stretch gap-0 p-4" aria-label="Zincirdeki bloklar">
          {blocks.map((block, i) => {
            const status = blockStatus(block, validation);
            return (
              <li key={block.index} className="flex items-center">
                {i > 0 && <Connector broken={brokenLinks.has(block.index)} />}
                <button
                  type="button"
                  onClick={() => onSelect(block.index)}
                  aria-pressed={selectedIndex === block.index}
                  className={cn(
                    "animate-enter flex w-44 flex-col gap-2 rounded-xl border p-3 text-start transition-all",
                    "hover:-translate-y-0.5 hover:brightness-125",
                    CARD_STYLE[status],
                    selectedIndex === block.index && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">#{block.index}</span>
                    <Badge tone={status as BadgeTone} dot>
                      {STATUS_LABEL[status]}
                    </Badge>
                  </div>
                  <HashText hash={block.hash} head={12} tail={0} />
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{block.transactions.length} işlem</span>
                    <span>Nonce <span className="font-mono">{formatCompact(block.nonce)}</span></span>
                  </div>
                </button>
              </li>
            );
          })}

          {mining && (
            <li className="flex items-center">
              <Connector pending />
              <div
                className={cn("flex w-44 flex-col gap-2 rounded-xl border p-3", CARD_STYLE.mining)}
                aria-live="polite"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">#{mining.block_index}</span>
                  <Badge tone="mining" dot>
                    <Hammer className="size-3" aria-hidden /> Kazım
                  </Badge>
                </div>
                <HashText
                  hash={mining.progress?.current_hash ?? "Aranıyor…"}
                  head={12}
                  tail={0}
                  highlightZeros={false}
                  className="text-muted"
                />
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>{mining.transaction_count} işlem</span>
                  <span className="font-mono">
                    {formatCompact(mining.progress?.attempts ?? 0)} deneme
                  </span>
                </div>
              </div>
            </li>
          )}
        </ol>
      </div>
    </Panel>
  );
}

function Connector({ broken = false, pending = false }: { broken?: boolean; pending?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-10 items-center justify-center sm:w-12",
        broken ? "text-invalid" : pending ? "text-mining/70" : "text-border-strong",
      )}
      title={broken ? "Kopuk bağlantı: previous_hash eşleşmiyor" : "previous_hash bağlantısı"}
      aria-hidden
    >
      {broken ? (
        <Unlink className="size-4" />
      ) : (
        <div className="flex w-full items-center">
          <div className={cn("h-px flex-1", pending ? "border-t border-dashed border-current" : "bg-current")} />
          <ArrowRight className="-ms-1 size-3.5 rtl:-scale-x-100" />
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 md:flex">
      {LEGEND.map(([label, dotClass]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className={cn("size-2 rounded-full", dotClass)} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
