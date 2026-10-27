"use client";

import { Loader2 } from "lucide-react";

import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { ConsensusPanel } from "@/components/network/ConsensusPanel";
import { NetworkControls } from "@/components/network/NetworkControls";
import { NetworkScene } from "@/components/network/NetworkScene";
import { NodeInspector } from "@/components/network/NodeInspector";
import { NodeTable } from "@/components/network/NodeTable";
import type { LogEntry } from "@/hooks/useActivityLog";
import type { NetworkState } from "@/hooks/useNetwork";

interface NetworkViewProps {
  network: NetworkState;
  live: boolean;
  online: boolean;
  activity: { entries: LogEntry[]; clear: () => void };
}

/** The multi-node simulation tab. All state comes from useNetwork (in Dashboard). */
export function NetworkView({ network, live, online, activity }: NetworkViewProps) {
  const { status, detail, selectedId, select, packets, actions, error } = network;

  if (!status) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-10 text-sm text-muted">
        {error ? <span className="text-invalid">{error}</span> : <><Loader2 className="size-4 animate-spin" aria-hidden /> Ağ yükleniyor…</>}
      </div>
    );
  }

  const names = new Map(status.nodes.map((n) => [n.id, n.name]));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <NetworkScene
        className="xl:col-span-8"
        status={status}
        packets={packets}
        selectedId={selectedId}
        onSelect={select}
        live={live}
      />
      <div className="flex flex-col gap-4 xl:col-span-4 xl:row-span-3">
        <NodeInspector detail={detail} names={names} actions={actions} disabled={!online} />
        <ActivityLog entries={activity.entries} onClear={activity.clear} />
      </div>
      <NodeTable className="xl:col-span-8" status={status} selectedId={selectedId} onSelect={select} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:col-span-8">
        <NetworkControls status={status} actions={actions} disabled={!online} />
        <ConsensusPanel />
      </div>
    </div>
  );
}
