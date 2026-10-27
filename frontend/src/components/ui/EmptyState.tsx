import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <Icon className="size-6 text-subtle" aria-hidden />
      <p className="text-sm font-medium text-muted">{title}</p>
      {children && <div className="max-w-xs text-xs text-subtle">{children}</div>}
    </div>
  );
}
