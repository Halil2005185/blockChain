"use client";

import { Boxes, GraduationCap, Network } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

export type DashboardView = "chain" | "network" | "learn";

/** "#network" → network, "#learn" or "#learn/<lesson>" → learn, anything else → chain. */
function fromHash(): DashboardView {
  if (typeof window === "undefined") return "chain";
  const hash = window.location.hash;
  if (hash === "#network") return "network";
  if (hash === "#learn" || hash.startsWith("#learn/")) return "learn";
  return "chain";
}

/** Current tab, mirrored in the URL hash so a reload or a shared link keeps it. */
export function useDashboardView() {
  const [view, setViewState] = useState<DashboardView>("chain");
  useEffect(() => {
    setViewState(fromHash());
    const onHash = () => setViewState(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const setView = useCallback((next: DashboardView) => {
    setViewState(next);
    const keepLesson = next === "learn" && window.location.hash.startsWith("#learn/");
    if (!keepLesson) {
      history.replaceState(null, "", next === "chain" ? window.location.pathname + window.location.search : `#${next}`);
    }
  }, []);
  return [view, setView] as const;
}

const TABS: Array<{ id: DashboardView; label: string; hint: string; icon: typeof Boxes }> = [
  { id: "chain", label: "Tek zincir", hint: "Tek blokzincir: madencilik, hash ve kurcalama", icon: Boxes },
  { id: "network", label: "Ağ", hint: "Uzlaşmaya varan birden çok bağımsız düğüm", icon: Network },
  { id: "learn", label: "Öğren", hint: "Dersler, rehberli deneyler ve sınavlar", icon: GraduationCap },
];

export const tabPanelId = (view: DashboardView) => `panel-${view}`;

export function ViewTabs({ view, onChange, nodeCount }: { view: DashboardView; onChange: (v: DashboardView) => void; nodeCount: number | null }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  // WAI-ARIA tabs pattern: arrow keys move between tabs, Home/End jump.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    onChange(TABS[target]!.id);
    refs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label="Panel görünümü" className="flex w-full gap-1 rounded-xl border border-border bg-surface/90 p-1 sm:w-fit">
      {TABS.map(({ id, label, hint, icon: Icon }, i) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`tab-${id}`}
          type="button"
          role="tab"
          aria-selected={view === id}
          aria-controls={tabPanelId(id)}
          tabIndex={view === id ? 0 : -1}
          title={hint}
          onClick={() => onChange(id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors sm:flex-none sm:px-4",
            view === id ? "bg-accent/15 font-semibold text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          {id === "network" && nodeCount !== null && (
            <span className="hidden rounded bg-surface-2 px-1.5 font-mono text-[11px] text-muted sm:inline">{nodeCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}
