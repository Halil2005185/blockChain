import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "valid" | "invalid" | "untrusted" | "mining" | "genesis" | "info" | "neutral";

const TONES: Record<BadgeTone, string> = {
  valid: "border-valid/30 bg-valid/10 text-valid",
  invalid: "border-invalid/30 bg-invalid/10 text-invalid",
  untrusted: "border-untrusted/30 bg-untrusted/10 text-untrusted",
  mining: "border-mining/30 bg-mining/10 text-mining",
  genesis: "border-genesis/30 bg-genesis/10 text-genesis",
  info: "border-accent/30 bg-accent/10 text-accent",
  neutral: "border-border-strong bg-surface-2 text-muted",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Small coloured dot before the label. */
  dot?: boolean;
  className?: string;
}

export function Badge({ tone = "neutral", children, dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
