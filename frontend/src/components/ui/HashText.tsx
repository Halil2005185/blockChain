"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { shortHash, splitLeadingZeros } from "@/lib/format";

interface HashTextProps {
  hash: string;
  /** Show the full 64 characters (wrapped) instead of a shortened form. */
  full?: boolean;
  head?: number;
  tail?: number;
  /** Colour the leading zeros - the visible "proof" of proof of work. */
  highlightZeros?: boolean;
  copyable?: boolean;
  className?: string;
}

export function HashText({
  hash,
  full = false,
  head = 10,
  tail = 4,
  highlightZeros = true,
  copyable = false,
  className,
}: HashTextProps) {
  const [copied, setCopied] = useState(false);
  const shown = full ? hash : shortHash(hash, head, tail);
  const [zeros, rest] = highlightZeros ? splitLeadingZeros(shown) : ["", shown];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard can be blocked; ignore */
    }
  };

  return (
    <span className={cn("inline-flex min-w-0 items-start gap-1.5 font-mono text-xs", className)}>
      <span dir="ltr" className={cn(full ? "break-all" : "truncate")} title={hash}>
        {zeros && <span className="text-valid">{zeros}</span>}
        <span>{rest}</span>
      </span>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-subtle transition-colors hover:text-fg"
          aria-label={copied ? "Kopyalandı" : "Hash’i kopyala"}
          title={copied ? "Kopyalandı" : "Kopyala"}
        >
          {copied ? <Check className="size-3.5 text-valid" /> : <Copy className="size-3.5" />}
        </button>
      )}
    </span>
  );
}
