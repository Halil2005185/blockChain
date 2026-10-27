"use client";

import { List } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import type { BlockOut, ValidationReportOut } from "@/lib/api/types";
import { blockStatus, STATUS_LABEL } from "@/lib/blockStatus";
import { cn } from "@/lib/cn";
import { formatInt, formatTime } from "@/lib/format";

interface BlockListProps {
  blocks: BlockOut[];
  validation: ValidationReportOut;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  className?: string;
}

/** Table of every block, newest first. Less important columns hide on small screens. */
export function BlockList({ blocks, validation, selectedIndex, onSelect, className }: BlockListProps) {
  const newestFirst = [...blocks].reverse();

  return (
    <Panel
      title="Bloklar"
      icon={List}
      subtitle={`${blocks.length} toplam · en yenisi önce`}
      className={className}
      flush
    >
      <div className="scrollbar-thin max-h-[420px] overflow-auto">
        <table className="w-full text-start text-xs">
          <thead className="sticky top-0 z-10 bg-surface text-[11px] tracking-wider text-subtle uppercase">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2.5 font-medium">#</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Hash</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Önceki hash</th>
              <th scope="col" className="hidden px-3 py-2.5 text-end font-medium sm:table-cell">İşlemler</th>
              <th scope="col" className="hidden px-3 py-2.5 text-end font-medium lg:table-cell">Nonce</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">Zaman</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Durum</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((block) => {
              const status = blockStatus(block, validation);
              const selected = selectedIndex === block.index;
              return (
                <tr
                  key={block.index}
                  onClick={() => onSelect(block.index)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(block.index)}
                  tabIndex={0}
                  aria-selected={selected}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                    selected ? "bg-accent/10" : "hover:bg-surface-2",
                  )}
                >
                  <td className="px-4 py-2.5 font-mono font-semibold">{block.index}</td>
                  <td className="max-w-0 px-3 py-2.5 sm:max-w-none">
                    <HashText hash={block.hash} head={14} tail={4} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted md:table-cell">
                    <HashText hash={block.previous_hash} head={10} tail={4} highlightZeros={!block.is_genesis} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-end font-mono sm:table-cell">
                    {block.transactions.length}
                  </td>
                  <td className="hidden px-3 py-2.5 text-end font-mono text-muted lg:table-cell">
                    {formatInt(block.nonce)}
                  </td>
                  <td className="hidden px-3 py-2.5 font-mono text-muted xl:table-cell">
                    {formatTime(block.timestamp)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={status as BadgeTone} dot>
                      {STATUS_LABEL[status]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
