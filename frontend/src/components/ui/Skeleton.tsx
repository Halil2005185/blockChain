import { cn } from "@/lib/cn";

/** Grey placeholder bar shown while data is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}
