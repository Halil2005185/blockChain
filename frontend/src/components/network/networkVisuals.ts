/**
 * Shared look of the network view: node states, colours and the circle layout.
 * Used by both the 3D scene and the DOM panels so they always agree.
 */

import type { NodeSummaryOut } from "@/lib/api/types";
import type { PacketOutcome } from "@/hooks/useNetwork";
import { COLORS } from "@/components/scene/sceneTheme";

export type NodeVisual = "synced" | "behind" | "invalid" | "offline";

export function nodeVisual(node: NodeSummaryOut): NodeVisual {
  if (!node.online) return "offline";
  if (!node.chain_valid) return "invalid";
  if (!node.in_sync || node.behind_by > 0) return "behind";
  return "synced";
}

export const NODE_COLOR: Record<NodeVisual, string> = {
  synced: COLORS.status.valid,
  behind: COLORS.status.untrusted,
  invalid: COLORS.status.invalid,
  offline: "#4b5563",
};

export const NODE_LABEL: Record<NodeVisual, string> = {
  synced: "Senkronize",
  behind: "Geride / çatallanmış",
  invalid: "Geçersiz zincir",
  offline: "Çevrimdışı",
};

/** Badge tone for each state (see components/ui/Badge). */
export const NODE_TONE = {
  synced: "valid",
  behind: "untrusted",
  invalid: "invalid",
  offline: "neutral",
} as const;

export const OUTCOME_COLOR: Record<PacketOutcome, string> = {
  accepted: COLORS.status.valid,
  adopted: COLORS.status.genesis,
  rejected: COLORS.status.invalid,
  orphan: COLORS.status.mining,
  stale: COLORS.muted,
  duplicate: COLORS.muted,
  kept: COLORS.muted,
  dropped: "#9f4a4a",
};

export const KIND_COLOR = {
  block: COLORS.status.mining,
  chain: COLORS.status.genesis,
  transaction: COLORS.accent,
  invalid: COLORS.status.invalid,
} as const;

/** Partition groups get their own floor ring colour. */
const GROUP_COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#facc15"];
export function groupColor(group: string): string {
  if (group === "main") return COLORS.gridSection;
  const n = Number(group.split("-")[1] ?? 1);
  return GROUP_COLORS[(n - 1) % GROUP_COLORS.length]!;
}

/**
 * A stable colour per chain tip: nodes that agree on the latest block show
 * the same colour, so a fork is visible at a glance.
 */
export function tipColor(hash: string): string {
  const hue = parseInt(hash.slice(-6), 16) % 360;
  // Comma syntax: understood by both CSS and three.js's Color parser.
  return `hsl(${hue}, 85%, 62%)`;
}

/** Nodes on a circle, the first one at the front. */
export function nodePositions(count: number): Array<[number, number, number]> {
  const radius = count <= 2 ? 3 : 2.6 + count * 0.45;
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / count;
    return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
  });
}
