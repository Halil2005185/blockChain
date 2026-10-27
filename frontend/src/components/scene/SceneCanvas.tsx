"use client";

/**
 * The WebGL part of the chain view. Loaded lazily by ChainScene (with
 * next/dynamic, ssr: false) so three.js never runs on the server and isn't
 * part of the initial page bundle.
 *
 * It receives everything as props - no API calls, no blockchain state.
 */

import { Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";

import { BlockLink, type LinkState } from "@/components/scene/BlockLink";
import { BlockMesh } from "@/components/scene/BlockMesh";
import { CameraRig, type CameraApi } from "@/components/scene/CameraRig";
import { GhostBlock } from "@/components/scene/GhostBlock";
import {
  BLOCK_SIZE,
  blockX,
  CAMERA_OFFSET,
  COLORS,
  DETAIL_RADIUS,
  GENESIS_SCALE,
} from "@/components/scene/sceneTheme";
import type { BlockOut, ValidationReportOut } from "@/lib/api/types";
import { blockStatus } from "@/lib/blockStatus";

export interface SceneGhost {
  index: number;
  target: string;
}

export interface SceneCanvasProps {
  blocks: BlockOut[];
  validation: ValidationReportOut;
  selectedIndex: number | null;
  hoveredIndex: number | null;
  ghost: SceneGhost | null;
  /** Block index (may be fractional) the camera should centre on. */
  focusIndex: number;
  cameraApi: RefObject<CameraApi | null>;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
  onContextLost: () => void;
}

const halfWidth = (index: number) => (BLOCK_SIZE * (index === 0 ? GENESIS_SCALE : 1)) / 2;

export default function SceneCanvas({
  blocks,
  validation,
  selectedIndex,
  hoveredIndex,
  ghost,
  focusIndex,
  cameraApi,
  reducedMotion,
  onSelect,
  onHover,
  onContextLost,
}: SceneCanvasProps) {
  // Blocks rendered on the very first frame appear instantly; any block that
  // mounts later (i.e. was just mined) plays the entrance animation.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Level of detail is centred where the camera last came to rest.
  const [lodCenter, setLodCenter] = useState(Math.round(focusIndex));
  useEffect(() => setLodCenter(Math.round(focusIndex)), [focusIndex]);
  const showAllDetails = blocks.length <= DETAIL_RADIUS * 2 + 1;

  const brokenLinks = new Set(validation.issues.filter((i) => i.code === "broken_link").map((i) => i.index));
  const untrusted = new Set(validation.untrusted_indices);
  const lastIndex = blocks.length - 1;
  const focusX = blockX(focusIndex);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 45, near: 0.1, far: 400, position: [focusX + CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onContextLost();
        });
      }}
      onPointerMissed={() => onHover(null)}
    >
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, 22, 70]} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#9cc9ff", "#0b0f16", 0.6]} />
      <directionalLight position={[6, 10, 8]} intensity={1.4} />
      <pointLight position={[focusX, 4, 4]} intensity={18} distance={14} color={COLORS.accent} />

      <Grid
        position={[0, -1.2, 0]}
        infiniteGrid
        cellSize={0.65}
        cellThickness={0.6}
        cellColor={COLORS.grid}
        sectionSize={2.6}
        sectionThickness={1}
        sectionColor={COLORS.gridSection}
        fadeDistance={55}
        fadeStrength={1.5}
        followCamera
      />

      {blocks.map((block) => {
        const i = block.index;
        const status = blockStatus(block, validation);
        const detailed = showAllDetails || Math.abs(i - lodCenter) <= DETAIL_RADIUS || i === selectedIndex;
        let link: LinkState = "ok";
        if (brokenLinks.has(i)) link = "broken";
        else if (untrusted.has(i)) link = "untrusted";

        return (
          <group key={i}>
            {i > 0 && (
              <BlockLink
                fromX={blockX(i - 1) + halfWidth(i - 1)}
                toX={blockX(i) - halfWidth(i)}
                state={link}
                reducedMotion={reducedMotion}
              />
            )}
            <BlockMesh
              index={i}
              hash={block.hash}
              x={blockX(i)}
              status={status}
              isGenesis={block.is_genesis}
              selected={i === selectedIndex}
              hovered={i === hoveredIndex}
              detailed={detailed}
              animateIn={mounted}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
              onHover={onHover}
            />
          </group>
        );
      })}

      {ghost && lastIndex >= 0 && (
        <>
          <BlockLink
            fromX={blockX(lastIndex) + halfWidth(lastIndex)}
            toX={blockX(ghost.index) - BLOCK_SIZE / 2}
            state="pending"
            reducedMotion={reducedMotion}
          />
          <GhostBlock index={ghost.index} x={blockX(ghost.index)} target={ghost.target} reducedMotion={reducedMotion} />
        </>
      )}

      <CameraRig
        apiRef={cameraApi}
        focusX={focusX}
        minX={blockX(0)}
        maxX={blockX(ghost ? ghost.index : Math.max(lastIndex, 0))}
        onRestIndex={setLodCenter}
      />
    </Canvas>
  );
}
