import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface PanelProps {
  title: string;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  /** Buttons or badges shown on the right of the header. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /**
   * Remove the body padding (for tables, canvases, edge-to-edge lists).
   * A prop rather than "p-0" in bodyClassName: both classes would be applied
   * and Tailwind's stylesheet order, not the class order, decides which wins.
   */
  flush?: boolean;
}

/** The bordered card every dashboard section lives in. */
export function Panel({ title, icon: Icon, subtitle, actions, children, className, bodyClassName, flush = false }: PanelProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-surface/90 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <Icon className="size-4 shrink-0 text-accent" aria-hidden />}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
