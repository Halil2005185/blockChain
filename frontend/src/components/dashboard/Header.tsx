"use client";

import { Boxes, Radio, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ConnectionState } from "@/hooks/useBlockchain";
import { API_BASE_URL } from "@/lib/config";
import { cn } from "@/lib/cn";

interface HeaderProps {
  connection: ConnectionState;
  /** WebSocket connected (push updates) vs. REST polling fallback. */
  live: boolean;
  height: number | null;
  onReset: () => Promise<unknown>;
  resetDisabled: boolean;
}

const CONNECTION_STYLE: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  connecting: { label: "Bağlanıyor", dot: "bg-mining animate-pulse", text: "text-mining" },
  online: { label: "Çevrimiçi", dot: "bg-valid", text: "text-valid" },
  offline: { label: "Çevrimdışı", dot: "bg-invalid animate-pulse", text: "text-invalid" },
};

export function Header({ connection, live, height, onReset, resetDisabled }: HeaderProps) {
  const style = CONNECTION_STYLE[connection];
  // Two-step confirm: first click arms the button for a few seconds.
  const [armed, setArmed] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const handleReset = async () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    setResetting(true);
    try {
      await onReset();
    } catch {
      /* logged by the hook */
    } finally {
      setResetting(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg border border-accent/30 bg-accent/10">
            <Boxes className="size-5 text-accent" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
              Blokzincir Gezgini
            </h1>
            <p className="truncate text-xs text-muted">Eğitim simülasyonu · Gerçek değeri olmayan hayali EDU birimleri</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {height !== null && (
            <Badge tone="info">
              Yükseklik <span className="font-mono">{height}</span>
            </Badge>
          )}
          <div
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
            title={`Sunucu: ${API_BASE_URL}`}
          >
            <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
            <span className={cn("text-xs font-medium", style.text)}>{style.label}</span>
            <span dir="ltr" className="hidden font-mono text-[11px] text-subtle md:inline">
              {API_BASE_URL.replace(/^https?:\/\//, "")}
            </span>
          </div>
          {connection === "online" && (
            <Badge
              tone={live ? "valid" : "mining"}
              className="gap-1"
            >
              <Radio className={cn("size-3", live && "animate-pulse")} aria-hidden />
              <span title={live ? "WebSocket bağlı: güncellemeler anında gelir" : "WebSocket yeniden bağlanıyor: geçici olarak daha yavaş REST yoklaması"}>
                {live ? "Canlı" : "Yoklama"}
              </span>
            </Badge>
          )}
          <Button
            size="sm"
            variant={armed ? "danger" : "ghost"}
            icon={RotateCcw}
            loading={resetting}
            disabled={resetDisabled}
            onClick={handleReset}
            title="Tüm blokları sil ve yeni bir genesis bloğundan başla"
          >
            {armed ? "Onaylamak için tekrar tıklayın" : "Zinciri sıfırla"}
          </Button>
        </div>
      </div>
    </header>
  );
}
