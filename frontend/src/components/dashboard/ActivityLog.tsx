"use client";

import {
  ArrowLeftRight,
  FlaskConical,
  Hammer,
  Layers,
  Network,
  ScrollText,
  ShieldCheck,
  Trash2,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import type { LogEntry, LogKind, LogLevel } from "@/hooks/useActivityLog";
import { cn } from "@/lib/cn";

const KIND_ICON: Record<LogKind, LucideIcon> = {
  transaction: ArrowLeftRight,
  mining: Hammer,
  validation: ShieldCheck,
  chain: Layers,
  tamper: FlaskConical,
  connection: Wifi,
  network: Network,
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "text-accent",
  success: "text-valid",
  warning: "text-mining",
  error: "text-invalid",
};

interface ActivityLogProps {
  entries: LogEntry[];
  onClear: () => void;
  className?: string;
}

export function ActivityLog({ entries, onClear, className }: ActivityLogProps) {
  return (
    <Panel
      title="Etkinlik"
      icon={ScrollText}
      subtitle="Bu oturum, en yenisi önce"
      className={className}
      flush
      actions={
        entries.length > 0 && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onClear} aria-label="Etkinlik günlüğünü temizle">
            Temizle
          </Button>
        )
      }
    >
      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="Henüz bir şey yok">
          Bir işlem oluşturun veya bir blok kazın; her adım burada görünecek.
        </EmptyState>
      ) : (
        <ol className="scrollbar-thin max-h-[420px] divide-y divide-border/60 overflow-y-auto" aria-live="polite">
          {entries.map((entry) => {
            const Icon = KIND_ICON[entry.kind];
            return (
              <li key={entry.id} className="animate-enter flex gap-3 px-4 py-2.5 text-xs">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", LEVEL_COLOR[entry.level])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 wrap-break-word text-fg/90">{entry.message}</p>
                    <time className="shrink-0 font-mono text-[11px] text-subtle" dateTime={new Date(entry.time).toISOString()}>
                      {new Date(entry.time).toLocaleTimeString([], { hour12: false })}
                    </time>
                  </div>
                  {entry.detail && <p className="mt-0.5 wrap-break-word font-mono text-[11px] text-subtle">{entry.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
