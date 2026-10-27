/**
 * Shared constants for the 3D scene: layout, colours and level of detail.
 *
 * three.js can't read CSS variables, so the status colours below mirror the
 * tokens in src/app/globals.css. Keep the two in sync.
 */

import type { BlockStatus } from "@/lib/blockStatus";

export const COLORS = {
  bg: "#07090d",
  grid: "#1e2632",
  gridSection: "#2c3747",
  accent: "#38bdf8",
  link: "#3b4a5e",
  fg: "#e6edf3",
  muted: "#8b97a8",
  status: {
    genesis: "#a78bfa",
    valid: "#34d399",
    invalid: "#f87171",
    untrusted: "#fb923c",
    mining: "#fbbf24",
  } satisfies Record<BlockStatus, string>,
} as const;

/** Cube edge length and the distance between neighbouring block centres. */
export const BLOCK_SIZE = 1.2;
export const GENESIS_SCALE = 1.25;
export const SPACING = 2.6;

/** Blocks sit in a straight line along +X; block N is at x = N * SPACING. */
export function blockX(index: number): number {
  return index * SPACING;
}

/**
 * Level of detail: labels and outline edges are only drawn for blocks within
 * this many positions of the focused block. Distant blocks are plain cubes.
 */
export const DETAIL_RADIUS = 12;

/** Default camera offset from the focused block (keeps a 3/4 view). */
export const CAMERA_OFFSET = { x: 2.8, y: 3.4, z: 8.5 } as const;
