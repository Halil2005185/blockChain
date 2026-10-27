"use client";

import { Billboard } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BackSide, BoxGeometry, EdgesGeometry, type Group, type LineSegments } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { createLabelTexture, LABEL_WORLD_HEIGHT, LABEL_WORLD_WIDTH } from "@/components/scene/labelTexture";
import { BLOCK_SIZE, COLORS, GENESIS_SCALE } from "@/components/scene/sceneTheme";
import type { BlockStatus } from "@/lib/blockStatus";

// One geometry shared by every cube (and one for every outline / glow shell).
const CUBE = new RoundedBoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, 3, 0.12);
const OUTLINE = new EdgesGeometry(new BoxGeometry(BLOCK_SIZE * 1.04, BLOCK_SIZE * 1.04, BLOCK_SIZE * 1.04));
const SHELL = new RoundedBoxGeometry(BLOCK_SIZE * 1.22, BLOCK_SIZE * 1.22, BLOCK_SIZE * 1.22, 2, 0.2);

/** How strongly each status glows (emissive intensity) at rest. */
const GLOW: Record<BlockStatus, number> = {
  genesis: 0.55,
  valid: 0.28,
  invalid: 0.75,
  untrusted: 0.12,
  mining: 0.6,
};

const ENTER_SECONDS = 0.9;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export interface BlockMeshProps {
  index: number;
  hash: string;
  x: number;
  status: BlockStatus;
  isGenesis: boolean;
  selected: boolean;
  hovered: boolean;
  /** Near the camera focus: draw the label and outline. */
  detailed: boolean;
  /** Play the "drop into the chain" animation when first mounted. */
  animateIn: boolean;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
}

function BlockMeshImpl({
  index,
  hash,
  x,
  status,
  isGenesis,
  selected,
  hovered,
  detailed,
  animateIn,
  reducedMotion,
  onSelect,
  onHover,
}: BlockMeshProps) {
  const group = useRef<Group>(null);
  const outline = useRef<LineSegments>(null);
  // Captured once: blocks present at first render don't animate.
  const [entering] = useState(() => animateIn && !reducedMotion);
  const enterProgress = useRef(entering ? 0 : 1);

  const color = COLORS.status[status];
  const baseScale = isGenesis ? GENESIS_SCALE : 1;
  const glow = GLOW[status] + (selected ? 0.45 : 0) + (hovered ? 0.25 : 0);

  const label = useMemo(
    () => (detailed ? createLabelTexture({ title: isGenesis ? `#${index} Genesis` : `#${index}`, hash, color }) : null),
    [detailed, index, hash, color, isGenesis],
  );
  useEffect(() => () => label?.dispose(), [label]);

  // Dashed lines need per-vertex distances; only untrusted outlines are dashed.
  useEffect(() => {
    if (status === "untrusted") outline.current?.computeLineDistances();
  }, [status, detailed]);

  // Per-frame animation. We only request another frame while something is
  // still moving, so an idle scene costs nothing (frameloop="demand").
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    let moving = false;

    if (enterProgress.current < 1) {
      enterProgress.current = Math.min(1, enterProgress.current + delta / ENTER_SECONDS);
      moving = true;
    }
    const t = easeOutBack(enterProgress.current);
    const targetScale = baseScale * (hovered ? 1.07 : 1) * (0.25 + 0.75 * t);
    const targetY = (1 - t) * 2.4; // drops in from where the ghost block hovered
    g.rotation.y = (1 - t) * Math.PI;

    const k = 1 - Math.exp(-delta * 14); // frame-rate independent smoothing
    const s = g.scale.x + (targetScale - g.scale.x) * k;
    g.scale.setScalar(s);
    g.position.y = entering && enterProgress.current < 1 ? targetY : g.position.y + (0 - g.position.y) * k;

    if (Math.abs(s - targetScale) > 0.001 || Math.abs(g.position.y) > 0.001) moving = true;
    if (moving) state.invalidate();
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Ignore the click that ends a camera drag.
    if (e.delta > 4) return;
    onSelect(index);
  };

  return (
    <group position={[x, 0, 0]}>
      <group
        ref={group}
        scale={entering ? 0.25 * baseScale : baseScale}
        position={[0, entering ? 2.4 : 0, 0]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(index);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
      >
        <mesh geometry={CUBE}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={glow}
            metalness={0.25}
            roughness={0.35}
            transparent={status === "untrusted"}
            opacity={status === "untrusted" ? 0.5 : 1}
          />
        </mesh>

        {/* Soft halo for blocks that deserve attention. */}
        {(selected || isGenesis || status === "invalid") && (
          <mesh geometry={SHELL} raycast={() => null}>
            <meshBasicMaterial
              color={selected ? COLORS.accent : color}
              transparent
              opacity={selected ? 0.22 : 0.14}
              side={BackSide}
              depthWrite={false}
            />
          </mesh>
        )}

        {detailed && (
          <lineSegments ref={outline} geometry={OUTLINE} raycast={() => null}>
            {status === "untrusted" ? (
              <lineDashedMaterial color={color} dashSize={0.12} gapSize={0.08} />
            ) : (
              <lineBasicMaterial color={selected ? COLORS.accent : color} transparent opacity={selected ? 1 : 0.6} />
            )}
          </lineSegments>
        )}

        {/* Genesis: two "orbit" rings make it unmistakable. */}
        {isGenesis && (
          <>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
              <torusGeometry args={[BLOCK_SIZE * 0.95, 0.018, 8, 64]} />
              <meshBasicMaterial color={color} transparent opacity={0.7} />
            </mesh>
            <mesh rotation={[Math.PI / 2.6, Math.PI / 5, 0]} raycast={() => null}>
              <torusGeometry args={[BLOCK_SIZE * 1.05, 0.012, 8, 64]} />
              <meshBasicMaterial color={color} transparent opacity={0.4} />
            </mesh>
          </>
        )}
      </group>

      {label && (
        <Billboard position={[0, BLOCK_SIZE * baseScale * 0.5 + 0.75, 0]}>
          <mesh raycast={() => null}>
            <planeGeometry args={[LABEL_WORLD_WIDTH, LABEL_WORLD_HEIGHT]} />
            <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </Billboard>
      )}

      {/* Selection marker on the floor. */}
      {selected && (
        <mesh position={[0, -1.19, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[BLOCK_SIZE * 0.85, BLOCK_SIZE * 0.95, 48]} />
          <meshBasicMaterial color={COLORS.accent} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export const BlockMesh = memo(BlockMeshImpl);
