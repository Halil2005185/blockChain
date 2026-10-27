"use client";

/**
 * 3D chain panel. Same props as the 2D ChainStrip, so Dashboard just swaps
 * one for the other. Everything here is DOM: the panel, toolbar, overlays,
 * keyboard navigation and fallbacks. The WebGL canvas itself (SceneCanvas)
 * is loaded lazily on the client only.
 */

import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crosshair,
  Hammer,
  Loader2,
  RotateCcw,
  ScanEye,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { ChainStrip } from "@/components/dashboard/ChainStrip";
import type { CameraApi } from "@/components/scene/CameraRig";
import type { SceneGhost } from "@/components/scene/SceneCanvas";
import { SceneErrorBoundary } from "@/components/scene/SceneErrorBoundary";
import { blockX } from "@/components/scene/sceneTheme";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useWebGLSupport } from "@/hooks/useWebGLSupport";
import type { BlockOut, MiningJobOut, ValidationReportOut } from "@/lib/api/types";
import { blockStatus, STATUS_LABEL } from "@/lib/blockStatus";
import { cn } from "@/lib/cn";
import { formatCompact, formatInt } from "@/lib/format";

const SceneCanvas = dynamic(() => import("@/components/scene/SceneCanvas"), {
  ssr: false,
  loading: () => <SceneLoading />,
});

interface ChainSceneProps {
  blocks: BlockOut[];
  validation: ValidationReportOut;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  miningJob: MiningJobOut | null;
  className?: string;
}

const LEGEND: Array<[label: string, dotClass: string]> = [
  ["Genesis", "bg-genesis"],
  ["Geçerli", "bg-valid"],
  ["Geçersiz", "bg-invalid"],
  ["Güvenilmez", "bg-untrusted"],
  ["Kazılıyor", "bg-mining"],
];

export function ChainScene(props: ChainSceneProps) {
  const { blocks, validation, selectedIndex, onSelect, miningJob, className } = props;
  const webgl = useWebGLSupport();
  const reducedMotion = usePrefersReducedMotion();
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const cameraApi = useRef<CameraApi | null>(null);

  // Stable callbacks so memoised 3D blocks don't re-render on every parent render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const select = useCallback((index: number) => onSelectRef.current(index), []);
  const hover = useCallback((index: number | null) => setHoveredIndex(index), []);
  const contextLost = useCallback(() => setSceneError("Grafik bağlamı kayboldu (GPU sıfırlaması veya çok fazla WebGL sayfası)."), []);

  const lastIndex = blocks.length - 1;
  const current = selectedIndex ?? lastIndex;

  // Ghost block: while mining, and until the freshly mined block arrives in
  // the next chain refresh (so there is no visual gap between the two).
  const ghost: SceneGhost | null =
    miningJob &&
    (miningJob.status === "running" || (miningJob.status === "completed" && blocks.length === miningJob.block_index))
      ? { index: miningJob.block_index, target: miningJob.target_prefix }
      : null;

  // Follow the latest block; while mining, look between it and the ghost.
  const following = selectedIndex === null || selectedIndex === lastIndex;
  const focusIndex = ghost && following ? (lastIndex + ghost.index) / 2 : current;

  const goTo = useCallback(
    (index: number) => {
      if (lastIndex < 0) return;
      const clamped = Math.max(0, Math.min(lastIndex, index));
      onSelectRef.current(clamped);
      // Re-selecting the same block still recentres the camera.
      cameraApi.current?.focus(blockX(clamped));
    },
    [lastIndex],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => goTo(current - 1),
      ArrowRight: () => goTo(current + 1),
      Home: () => goTo(0),
      End: () => goTo(lastIndex),
      f: () => cameraApi.current?.focus(blockX(current)),
      o: () => cameraApi.current?.overview(),
      r: () => cameraApi.current?.reset(),
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  // ---------------------------------------------------------------- fallback
  if (webgl === false || sceneError) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-mining/30 bg-mining/10 px-4 py-2 text-xs text-mining">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {sceneError
              ? `3B görünüm durdu: ${sceneError} Bunun yerine 2B görünüm gösteriliyor.`
              : "Bu tarayıcıda WebGL kullanılamıyor, bu yüzden 2B görünüm gösteriliyor."}
          </span>
          {sceneError && (
            <Button
              size="sm"
              variant="warning"
              icon={RotateCcw}
              onClick={() => {
                setSceneError(null);
                setCanvasKey((k) => k + 1);
              }}
            >
              3B görünümü yeniden başlat
            </Button>
          )}
        </div>
        <ChainStrip {...props} />
      </div>
    );
  }

  const info = hoveredIndex !== null ? blocks[hoveredIndex] : selectedIndex !== null ? blocks[selectedIndex] : undefined;
  const running = miningJob?.status === "running" ? miningJob : null;

  return (
    <Panel
      title="Zincir"
      icon={Boxes}
      subtitle={`${blocks.length} blok · incelemek için bir küpe tıklayın`}
      className={className}
      flush
      actions={<Legend />}
    >
      <div
        className="relative h-[360px] overflow-hidden rounded-b-xl outline-none sm:h-[440px]"
        tabIndex={0}
        role="application"
        aria-roledescription="Blokzincirin 3B görünümü"
        aria-label={`3B görünüm: ${blocks.length} blok. Seçili blok ${current}. Bloklar arasında gezinmek için ok tuşlarını, genel bakış için O’yu, kamerayı sıfırlamak için R’yi kullanın.`}
        onKeyDown={onKeyDown}
      >
        {webgl === null ? (
          <SceneLoading />
        ) : (
          <SceneErrorBoundary key={canvasKey} onError={setSceneError}>
            <SceneCanvas
              blocks={blocks}
              validation={validation}
              selectedIndex={selectedIndex}
              hoveredIndex={hoveredIndex}
              ghost={ghost}
              focusIndex={focusIndex}
              cameraApi={cameraApi}
              reducedMotion={reducedMotion}
              onSelect={select}
              onHover={hover}
              onContextLost={contextLost}
            />
          </SceneErrorBoundary>
        )}

        {/* ---- overlays (pointer-events only where needed) ---- */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto">
            {info && <BlockInfo block={info} validation={validation} hovered={hoveredIndex !== null} />}
            {running && <MiningHud job={running} />}
          </div>
          <Toolbar
            canPrev={current > 0}
            canNext={current < lastIndex}
            onFirst={() => goTo(0)}
            onPrev={() => goTo(current - 1)}
            onNext={() => goTo(current + 1)}
            onLast={() => goTo(lastIndex)}
            onFocus={() => cameraApi.current?.focus(blockX(current))}
            onOverview={() => cameraApi.current?.overview()}
            onReset={() => cameraApi.current?.reset()}
          />
        </div>

        <p className="pointer-events-none absolute bottom-3 start-3 hidden rounded-md bg-bg/70 px-2 py-1 text-[11px] text-subtle backdrop-blur sm:block">
          Sürükle: döndür · Sağ tuşla sürükle: kaydır · Tekerlek: yakınlaştır · ←/→: bloklar · O: genel bakış · R: sıfırla
        </p>
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------- parts
function SceneLoading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-bg text-xs text-muted">
      <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
      3B görüntüleme motoru yükleniyor…
    </div>
  );
}

function BlockInfo({ block, validation, hovered }: { block: BlockOut; validation: ValidationReportOut; hovered: boolean }) {
  const status = blockStatus(block, validation);
  return (
    <div className="max-w-full rounded-lg sm:max-w-sm border border-border bg-bg/80 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold">#{block.index}</span>
        <Badge tone={status as BadgeTone} dot>
          {STATUS_LABEL[status]}
        </Badge>
        <span className="text-[11px] text-subtle">{hovered ? "İmlecin altında" : "Seçili"}</span>
      </div>
      <HashText hash={block.hash} head={16} tail={6} className="mt-1" />
      <p className="mt-0.5 text-[11px] text-muted">
        {block.transactions.length} işlem · nonce {formatInt(block.nonce)} · zorluk {block.difficulty}
      </p>
    </div>
  );
}

function MiningHud({ job }: { job: MiningJobOut }) {
  const attempts = job.progress?.attempts ?? 0;
  return (
    <div className="animate-pulse-glow rounded-lg border border-mining/40 bg-bg/80 px-3 py-2 text-xs backdrop-blur" aria-live="polite">
      <p className="flex items-center gap-1.5 font-semibold text-mining">
        <Hammer className="size-3.5" aria-hidden /> Kazılan blok <bdi>#{job.block_index}</bdi>
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-muted">
        {formatCompact(attempts)} / ~{formatCompact(job.expected_attempts)} deneme
        {job.progress ? ` · ${formatCompact(job.progress.hashes_per_second)} hash/sn` : ""}
      </p>
    </div>
  );
}

interface ToolbarProps {
  canPrev: boolean;
  canNext: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onFocus: () => void;
  onOverview: () => void;
  onReset: () => void;
}

function Toolbar(p: ToolbarProps) {
  const buttons: Array<[LucideIcon, string, () => void, boolean?]> = [
    [ChevronsLeft, "Genesis bloğu (Home)", p.onFirst, !p.canPrev],
    [ChevronLeft, "Önceki blok (←)", p.onPrev, !p.canPrev],
    [ChevronRight, "Sonraki blok (→)", p.onNext, !p.canNext],
    [ChevronsRight, "En yeni blok (End)", p.onLast, !p.canNext],
    [Crosshair, "Seçili bloğa odaklan (F)", p.onFocus],
    [ScanEye, "Genel bakış: tüm zinciri göster (O)", p.onOverview],
    [RotateCcw, "Kamerayı sıfırla (R)", p.onReset],
  ];
  return (
    <div dir="ltr" className="pointer-events-auto flex shrink-0 flex-wrap justify-end gap-0.5 rounded-lg border border-border bg-bg/80 p-1 backdrop-blur">
      {buttons.map(([Icon, label, onClick, disabled]) => (
        <Button key={label} size="sm" variant="ghost" icon={Icon} onClick={onClick} disabled={disabled} aria-label={label} title={label} className="px-1.5" />
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 md:flex">
      {LEGEND.map(([label, dotClass]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className={cn("size-2 rounded-full", dotClass)} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
