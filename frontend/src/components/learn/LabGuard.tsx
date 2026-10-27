"use client";

import { Play, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/api/client";
import type { LabContext } from "@/components/learn/labKit";

interface LabGuardProps {
  ctx: LabContext;
  scope: "chain" | "network";
  /** What the experiment will do, in one sentence. */
  willDo: string;
  children: ReactNode;
}

/**
 * Asks before an experiment changes the user's chain or network. Nothing is
 * reset unless the user explicitly chooses "start fresh" and confirms it.
 */
export function LabGuard({ ctx, scope, willDo, children }: LabGuardProps) {
  const [accepted, setAccepted] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (accepted) return <>{children}</>;

  const chain = ctx.bc.chain;
  const net = ctx.network.status;
  const current =
    scope === "chain"
      ? chain
        ? `Tek zincirinizde ${chain.chain.length} blok var ve zincir ${chain.validation.is_valid ? "geçerli" : "şu anda geçersiz"}.`
        : "Zinciriniz yükleniyor…"
      : net
        ? `Ağda ${net.nodes.length} düğüm var, yükseklik ${net.best_height}${net.partitioned ? ", gruplara bölünmüş" : ""}.`
        : "Ağ yükleniyor…";

  const startFresh = async () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    setError(null);
    try {
      if (scope === "chain") await ctx.bc.resetChain();
      else await ctx.network.actions.reset(4, net?.difficulty ?? 3);
      setAccepted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const blocked = !ctx.online || (scope === "chain" && ctx.mining.isRunning);

  return (
    <div className="rounded-lg border border-mining/30 bg-mining/6 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-mining">
        <ShieldAlert className="size-4" aria-hidden /> Başlamadan önce
      </p>
      <p className="mt-2 text-fg/90">{willDo}</p>
      <p className="mt-1 text-muted">{current}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={Play} disabled={blocked} onClick={() => setAccepted(true)}>
          Kullan: {scope === "chain" ? "mevcut zincirim" : "mevcut ağım"}
        </Button>
        <Button size="sm" variant={armed ? "danger" : "secondary"} icon={RotateCcw} loading={busy} disabled={blocked} onClick={startFresh}>
          {armed ? `Tekrar tıklayın: mevcut ${scope === "chain" ? "zincir" : "ağ"} silinecek` : `Baştan başla (sıfırlanır: ${scope === "chain" ? "zincir" : "ağ"})`}
        </Button>
      </div>
      {scope === "chain" && ctx.mining.isRunning && <p className="mt-2 text-xs text-mining">Bir blok kazılıyor; bitmesini bekleyin.</p>}
      {!ctx.online && <p className="mt-2 text-xs text-invalid">Sunucu çevrimdışı.</p>}
      {error && <p className="mt-2 text-xs text-invalid">{error}</p>}
    </div>
  );
}
