import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation message shown under the input (also marks it invalid). */
  error?: string | null;
  hint?: ReactNode;
}

/** Labelled text input with inline error/hint text. */
export function Field({ label, error, hint, id, className, ...input }: FieldProps) {
  // useId: Arabic labels can't be turned into ids by stripping non-word characters.
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        dir="auto"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "h-9 w-full min-w-0 rounded-lg border bg-bg/60 px-3 font-mono text-sm text-fg placeholder:text-subtle",
          "transition-colors outline-none focus:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-invalid/60" : "border-border-strong",
        )}
        {...input}
      />
      {(error || hint) && (
        <p id={messageId} className={cn("text-xs", error ? "text-invalid" : "text-subtle")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
