"use client";

import { Merge, Plus, RotateCcw, SlidersHorizontal, Split } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/api/client";
import type { NetworkStatusOut } from "@/lib/api/types";
import type { NetworkState } from "@/hooks/useNetwork";

interface NetworkControlsProps {
  status: NetworkStatusOut;
  actions: NetworkState["actions"];
  disabled: boolean;
  className?: string;
}

export function NetworkControls({ status, actions, disabled, className }: NetworkControlsProps) {
  const [latency, setLatency] = useState(status.latency_ms);
  const [jitter, setJitter] = useState(status.jitter_ms);
  const [nodes, setNodes] = useState(status.nodes.length);
  const [difficulty, setDifficulty] = useState(status.difficulty);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Follow changes made elsewhere (another tab, Swagger).
  useEffect(() => {
    setLatency(status.latency_ms);
    setJitter(status.jitter_ms);
  }, [status.latency_ms, status.jitter_ms]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const dirty = latency !== status.latency_ms || jitter !== status.jitter_ms;

  return (
    <Panel title="Ağ kontrolleri" icon={SlidersHorizontal} subtitle="Gecikme, bölme ve sıfırlama" className={className} bodyClassName="space-y-5">
      <section className="space-y-3">
        <Slider label="Gecikme" unit="ms" value={latency} max={3000} step={50} onChange={setLatency} disabled={disabled} />
        <Slider label="Dalgalanma (±)" unit="ms" value={jitter} max={1000} step={25} onChange={setJitter} disabled={disabled} />
        <Button size="sm" disabled={disabled || !dirty} loading={busy === "latency"} onClick={() => act("latency", () => actions.setLatency(latency, jitter))}>
          Gecikmeyi uygula
        </Button>
        <p className="text-[11px] text-subtle">Daha yüksek gecikme = iki düğümün rakip bloklar kazması için daha fazla zaman (çatallanmalar).</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium tracking-wider text-subtle uppercase">Bölme</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="warning" icon={Split} disabled={disabled || status.partitioned || status.nodes.length < 2} loading={busy === "split"} onClick={() => act("split", actions.split)}>
            İkiye böl
          </Button>
          <Button size="sm" icon={Merge} disabled={disabled || !status.partitioned} loading={busy === "heal"} onClick={() => act("heal", actions.heal)}>
            Ağı yeniden birleştir
          </Button>
        </div>
        <p className="text-[11px] text-subtle">
          Bölünmüşken her iki tarafta kazın. Yeniden birleştikten sonra toplam işi daha fazla olan taraf kazanır ve diğer taraf zincirini yeniden düzenler.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium tracking-wider text-subtle uppercase">Düğümler</h3>
        <Button size="sm" icon={Plus} disabled={disabled || status.nodes.length >= status.max_nodes} loading={busy === "add"} onClick={() => act("add", actions.addNode)}>
          Düğüm ekle ({status.nodes.length}/{status.max_nodes})
        </Button>
        <p className="text-[11px] text-subtle">Yeni düğüm yalnızca genesis bloğuyla başlar, sonra diğer düğümlerin zincirlerini indirir.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium tracking-wider text-subtle uppercase">Ağı sıfırla</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1 text-muted">
            Düğüm sayısı
            <select value={nodes} onChange={(e) => setNodes(Number(e.target.value))} disabled={disabled} className="h-8 rounded-md border border-border-strong bg-bg/60 px-2 font-mono text-fg">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Zorluk
            <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} disabled={disabled} className="h-8 rounded-md border border-border-strong bg-bg/60 px-2 font-mono text-fg">
              {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <Button size="sm" variant="danger" icon={RotateCcw} disabled={disabled} loading={busy === "reset"} onClick={() => act("reset", () => actions.reset(nodes, difficulty))}>
          Ağı sıfırla
        </Button>
      </section>

      {error && <p role="alert" className="text-xs text-invalid">{error}</p>}
    </Panel>
  );
}

function Slider(props: { label: string; unit: string; value: number; max: number; step: number; disabled: boolean; onChange: (v: number) => void }) {
  // useId: Arabic labels can't be turned into ids by stripping non-word characters.
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-muted">{props.label}</label>
        <span className="font-mono text-fg">{props.value} {props.unit}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}
