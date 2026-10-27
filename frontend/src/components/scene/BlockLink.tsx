"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useRef } from "react";
import type { MeshBasicMaterial } from "three";

import { COLORS } from "@/components/scene/sceneTheme";

export type LinkState = "ok" | "untrusted" | "broken" | "pending";

interface BlockLinkProps {
  /** World x where the link starts (right face of the previous block). */
  fromX: number;
  /** World x where it ends (left face of the next block). */
  toX: number;
  state: LinkState;
  reducedMotion: boolean;
}

const STYLE: Record<LinkState, { color: string; opacity: number; radius: number }> = {
  ok: { color: COLORS.accent, opacity: 0.55, radius: 0.045 },
  untrusted: { color: COLORS.status.untrusted, opacity: 0.45, radius: 0.04 },
  broken: { color: COLORS.status.invalid, opacity: 0.95, radius: 0.06 },
  pending: { color: COLORS.status.mining, opacity: 0.6, radius: 0.035 },
};

/**
 * The previous_hash "chain link" between two blocks: a thin rod along X.
 * A broken link is drawn as two red stubs with a gap, pulsing.
 */
function BlockLinkImpl({ fromX, toX, state, reducedMotion }: BlockLinkProps) {
  const style = STYLE[state];
  const length = toX - fromX;
  const mid = fromX + length / 2;
  const animated = (state === "broken" || state === "pending") && !reducedMotion;
  const materials = useRef<Array<MeshBasicMaterial | null>>([]);

  useFrame((frame) => {
    if (!animated) return;
    const pulse = 0.55 + 0.45 * Math.sin(frame.clock.elapsedTime * (state === "broken" ? 5 : 3));
    for (const m of materials.current) if (m) m.opacity = style.opacity * pulse;
    frame.invalidate(); // keep animating while this link exists
  });

  const rod = (x: number, len: number, slot: number) => (
    <mesh key={slot} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
      <cylinderGeometry args={[style.radius, style.radius, len, 10]} />
      <meshBasicMaterial
        ref={(m) => {
          materials.current[slot] = m;
        }}
        color={style.color}
        transparent
        opacity={style.opacity}
        toneMapped={false}
      />
    </mesh>
  );

  if (state === "broken") {
    const stub = length * 0.32;
    return (
      <group>
        {rod(fromX + stub / 2, stub, 0)}
        {rod(toX - stub / 2, stub, 1)}
        {/* Small red "X" in the gap. */}
        <group position={[mid, 0, 0]}>
          {[Math.PI / 4, -Math.PI / 4].map((angle, i) => (
            <mesh key={i} rotation={[0, 0, angle]} raycast={() => null}>
              <boxGeometry args={[0.32, 0.05, 0.05]} />
              <meshBasicMaterial color={style.color} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }

  if (state === "pending") {
    // Dashed: four short segments toward the ghost block.
    const segments = 4;
    const seg = length / (segments * 2 - 1);
    return <group>{Array.from({ length: segments }, (_, i) => rod(fromX + seg * (i * 2 + 0.5), seg, i))}</group>;
  }

  return rod(mid, length, 0);
}

export const BlockLink = memo(BlockLinkImpl);
