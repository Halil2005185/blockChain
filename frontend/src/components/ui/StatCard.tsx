import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  /** Tailwind text colour class for the value/icon, e.g. "text-valid". */
  tone?: string;
}

export function StatCard({ label, value, icon: Icon, hint, tone = "text-fg" }: StatCardProps) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-surface/90 px-4 py-3">
      <div className="mt-0.5 rounded-lg border border-border bg-surface-2 p-2">
        <Icon className={cn("size-4", tone === "text-fg" ? "text-accent" : tone)} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wider text-subtle uppercase">{label}</p>
        {/* Monospace only for numbers; Arabic words (e.g. "Geçerli") use the normal font. */}
        <p className={cn("truncate text-xl font-semibold tabular-nums", /^[\d.,\s]+$/.test(String(value)) && "font-mono", tone)}>{value}</p>
        {hint && <p className="text-xs text-muted sm:truncate">{hint}</p>}
      </div>
    </div>
  );
}
