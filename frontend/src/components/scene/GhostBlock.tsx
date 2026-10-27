"use client";

import { Billboard, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, type Group, type Mesh } from "three";

import { createLabelTexture, LABEL_WORLD_HEIGHT, LABEL_WORLD_WIDTH } from "@/components/scene/labelTexture";
import { BLOCK_SIZE, COLORS } from "@/components/scene/sceneTheme";

const EDGES = new EdgesGeometry(new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE));

interface GhostBlockProps {
  index: number;
  x: number;
  /** Target prefix, e.g. "000", shown on the label. */
  target: string;
  reducedMotion: boolean;
}

/**
 * The block currently being mined: an amber wireframe that spins and pulses,
 * with sparks around it. It has no hash yet, so its label shows the target.
 */
export function GhostBlock({ index, x, target, reducedMotion }: GhostBlockProps) {
  const frame = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const color = COLORS.status.mining;

  const label = useMemo(
    () => createLabelTexture({ title: `#${index} Kazım`, subtitle: `Hedef ${target}…`, color }),
    [index, target, color],
  );
  useEffect(() => () => label.dispose(), [label]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (frame.current && !reducedMotion) {
      frame.current.rotation.y += delta * 1.4;
      frame.current.rotation.x = Math.sin(t * 0.8) * 0.25;
      frame.current.position.y = 0.6 + Math.sin(t * 2) * 0.12;
    }
    if (core.current) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      core.current.scale.setScalar(0.55 + pulse * 0.15);
    }
    state.invalidate(); // animate continuously while mining
  });

  return (
    <group position={[x, 0, 0]}>
      <group ref={frame} position={[0, 0.6, 0]}>
        <lineSegments geometry={EDGES} raycast={() => null}>
          <lineBasicMaterial color={color} toneMapped={false} />
        </lineSegments>
        <mesh ref={core} raycast={() => null}>
          <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>

      {!reducedMotion && <Sparkles count={28} scale={[2.2, 2.2, 2.2]} position={[0, 0.6, 0]} size={2.5} speed={0.6} color={color} />}

      <Billboard position={[0, BLOCK_SIZE * 0.5 + 1.35, 0]}>
        <mesh raycast={() => null}>
          <planeGeometry args={[LABEL_WORLD_WIDTH, LABEL_WORLD_HEIGHT]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}
