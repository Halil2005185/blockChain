"use client";

import { Hammer, Server } from "lucide-react";

import { NODE_LABEL, NODE_TONE, nodeVisual, tipColor } from "@/components/network/networkVisuals";
import { Badge } from "@/components/ui/Badge";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import type { NetworkStatusOut } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import { groupLabel } from "@/lib/networkText";

interface NodeTableProps {
  status: NetworkStatusOut;
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/** Every node at a glance. Also the accessible / no-WebGL view of the network. */
export function NodeTable({ status, selectedId, onSelect, className }: NodeTableProps) {
  return (
    <Panel title="Düğümler" icon={Server} subtitle="O düğümü incelemek için bir satıra tıklayın" className={className} flush>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full text-start text-xs">
          <thead className="text-[11px] tracking-wider text-subtle uppercase">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2.5 font-medium">Düğüm</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Durum</th>
              <th scope="col" className="px-3 py-2.5 text-end font-medium">Yükseklik</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Son blok</th>
              <th scope="col" className="hidden px-3 py-2.5 text-end font-medium md:table-cell">İş</th>
              <th scope="col" className="hidden px-3 py-2.5 text-end font-medium md:table-cell">Bekleyen</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Grup</th>
            </tr>
          </thead>
          <tbody>
            {status.nodes.map((node) => {
              const visual = nodeVisual(node);
              return (
                <tr
                  key={node.id}
                  onClick={() => onSelect(node.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(node.id)}
                  tabIndex={0}
                  aria-selected={node.id === selectedId}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                    node.id === selectedId ? "bg-accent/10" : "hover:bg-surface-2",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{node.name}</span>{" "}
                    <span className="font-mono text-[11px] text-subtle">{node.id}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge tone={NODE_TONE[visual]} dot>
                        {visual === "behind" && node.behind_by > 0 ? `Geride ${node.behind_by}` : NODE_LABEL[visual]}
                      </Badge>
                      {node.mining && (
                        <Badge tone="mining">
                          <Hammer className="size-3" aria-hidden /> Kazım
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-end font-mono">{node.height}</td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: tipColor(node.tip_hash) }} aria-hidden />
                      <HashText hash={node.tip_hash} head={10} tail={4} />
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-end font-mono text-muted md:table-cell">{formatCompact(node.total_work)}</td>
                  <td className="hidden px-3 py-2.5 text-end font-mono text-muted md:table-cell">{node.pending_count}</td>
                  <td className="hidden px-4 py-2.5 font-mono text-muted lg:table-cell">{groupLabel(node.group)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
