"use client";

import { AlertTriangle, Loader2, Network, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import type { NetworkCameraApi } from "@/components/network/NetworkCanvas";
import { KIND_COLOR, NODE_COLOR, NODE_LABEL, OUTCOME_COLOR } from "@/components/network/networkVisuals";
import { SceneErrorBoundary } from "@/components/scene/SceneErrorBoundary";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useWebGLSupport } from "@/hooks/useWebGLSupport";
import type { NetworkStatusOut } from "@/lib/api/types";
import type { Packet } from "@/hooks/useNetwork";

const NetworkCanvas = dynamic(() => import("@/components/network/NetworkCanvas"), {
  ssr: false,
  loading: () => <Loading />,
});

interface NetworkSceneProps {
  status: NetworkStatusOut;
  packets: Packet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  live: boolean;
  className?: string;
}

export function NetworkScene({ status, packets, selectedId, onSelect, live, className }: NetworkSceneProps) {
  const webgl = useWebGLSupport();
  const reducedMotion = usePrefersReducedMotion();
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const cameraApi = useRef<NetworkCameraApi | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const select = useCallback((id: string) => onSelectRef.current(id), []);
  const lost = useCallback(() => setSceneError("Grafik bağlamı kayboldu."), []);

  const inFlight = packets.filter((p) => p.outcome === null).length;
  const consensus = status.partitioned ? (
    <Badge tone="genesis" dot>Bölünmüş</Badge>
  ) : status.in_consensus ? (
    <Badge tone="valid" dot>Uzlaşmada</Badge>
  ) : (
    <Badge tone="untrusted" dot>Düğümler farklı</Badge>
  );

  return (
    <Panel
      title="Ağ"
      icon={Network}
      subtitle={`${status.nodes.length} düğüm · her düğümün zincirin kendi kopyası var`}
      className={className}
      flush
      actions={consensus}
    >
      <div className="relative h-[380px] overflow-hidden rounded-b-xl sm:h-[460px]">
        {webgl === false || sceneError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-sm text-muted">
            <AlertTriangle className="size-6 text-mining" aria-hidden />
            {sceneError ?? "WebGL kullanılamıyor, bu yüzden ağın 3B görünümü kapalı."} Aşağıdaki düğüm tablosu aynı bilgileri gösterir.
            {sceneError && (
              <Button size="sm" variant="warning" icon={RotateCcw} onClick={() => { setSceneError(null); setCanvasKey((k) => k + 1); }}>
                3B görünümü yeniden başlat
              </Button>
            )}
          </div>
        ) : webgl === null ? (
          <Loading />
        ) : (
          <SceneErrorBoundary key={canvasKey} onError={setSceneError}>
            <NetworkCanvas
              nodes={status.nodes}
              packets={packets}
              selectedId={selectedId}
              partitioned={status.partitioned}
              reducedMotion={reducedMotion}
              cameraApi={cameraApi}
              onSelect={select}
              onContextLost={lost}
            />
          </SceneErrorBoundary>
        )}

        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
          <div className="rounded-lg border border-border bg-bg/80 px-3 py-2 text-[11px] text-muted backdrop-blur">
            <p>
              Gecikme <span className="font-mono text-fg">{status.latency_ms} ms</span> ± {status.jitter_ms} · en büyük yükseklik{" "}
              <span className="font-mono text-fg">{status.best_height}</span>
            </p>
            <p>
              {live ? `${inFlight} mesaj yolda` : "Canlı güncellemeler duraklatıldı: paket hareketi gösterilmiyor"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            className="pointer-events-auto border border-border bg-bg/80 backdrop-blur"
            onClick={() => cameraApi.current?.reset()}
            aria-label="Kamerayı sıfırla"
            title="Kamerayı sıfırla"
          />
        </div>

        <Legend />
      </div>
    </Panel>
  );
}

function Loading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-bg text-xs text-muted">
      <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
      3B görüntüleme motoru yükleniyor…
    </div>
  );
}

function Legend() {
  const dot = (color: string, label: string, square = false) => (
    <span key={label} className="flex items-center gap-1.5">
      <span className={square ? "size-2" : "size-2 rounded-full"} style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-bg/70 px-3 py-1.5 text-[11px] text-muted backdrop-blur">
      {(["synced", "behind", "invalid", "offline"] as const).map((v) => dot(NODE_COLOR[v], NODE_LABEL[v]))}
      <span className="text-subtle">|</span>
      {dot(KIND_COLOR.block, "Blok", true)}
      {dot(KIND_COLOR.chain, "Zincir senkronizasyonu", true)}
      {dot(KIND_COLOR.transaction, "İşlem")}
      {dot(KIND_COLOR.invalid, "Geçersiz blok", true)}
      <span className="text-subtle">|</span>
      {dot(OUTCOME_COLOR.accepted, "Kabul edildi")}
      {dot(OUTCOME_COLOR.rejected, "Reddedildi")}
      {dot(OUTCOME_COLOR.adopted, "Zinciri benimseme")}
      <span className="hidden text-subtle lg:inline">· aynı üst küp rengi = aynı son blok</span>
    </div>
  );
}
