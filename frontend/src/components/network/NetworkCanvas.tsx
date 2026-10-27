"use client";

/**
 * 3D network view (lazy-loaded, client only). Nodes sit on a circle; links
 * connect nodes that can currently reach each other; messages fly between
 * them as small packets and flash on arrival with their outcome.
 *
 * Like the chain scene it renders on demand: animations request frames only
 * while something moves, so an idle network costs nothing.
 */

import { Billboard, CameraControls, Grid, Line } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import { type Group, type Mesh, type MeshBasicMaterial, Vector3 } from "three";

import {
  groupColor,
  KIND_COLOR,
  NODE_COLOR,
  nodePositions,
  nodeVisual,
  OUTCOME_COLOR,
  tipColor,
} from "@/components/network/networkVisuals";
import { createLabelTexture, LABEL_WORLD_HEIGHT, LABEL_WORLD_WIDTH } from "@/components/scene/labelTexture";
import { COLORS } from "@/components/scene/sceneTheme";
import type { NodeSummaryOut } from "@/lib/api/types";
import type { Packet } from "@/hooks/useNetwork";

export interface NetworkCameraApi {
  reset: () => void;
}

export interface NetworkCanvasProps {
  nodes: NodeSummaryOut[];
  packets: Packet[];
  selectedId: string | null;
  partitioned: boolean;
  reducedMotion: boolean;
  cameraApi: RefObject<NetworkCameraApi | null>;
  onSelect: (id: string) => void;
  onContextLost: () => void;
}

const NODE_RADIUS = 0.6;
// Camera position + look-at target. Aimed slightly forward so the front node
// isn't hidden behind the legend at the bottom of the panel.
const HOME: [number, number, number, number, number, number] = [0, 10, 14.5, 0, 0.3, 1.4];

export default function NetworkCanvas({
  nodes,
  packets,
  selectedId,
  partitioned,
  reducedMotion,
  cameraApi,
  onSelect,
  onContextLost,
}: NetworkCanvasProps) {
  const positions = useMemo(() => nodePositions(nodes.length), [nodes.length]);
  const at = useMemo(() => new Map(nodes.map((n, i) => [n.id, positions[i]!])), [nodes, positions]);

  // Links only between nodes that can reach each other right now.
  const links: Array<[NodeSummaryOut, NodeSummaryOut]> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (a.online && b.online && a.group === b.group) links.push([a, b]);
    }
  }

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ fov: 45, near: 0.1, far: 200, position: [HOME[0], HOME[1], HOME[2]] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
    >
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, 18, 45]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#9cc9ff", "#0b0f16", 0.6]} />
      <directionalLight position={[5, 10, 6]} intensity={1.3} />

      <Grid
        position={[0, -1.1, 0]}
        infiniteGrid
        cellSize={0.65}
        cellThickness={0.6}
        cellColor={COLORS.grid}
        sectionSize={2.6}
        sectionThickness={1}
        sectionColor={COLORS.gridSection}
        fadeDistance={40}
        fadeStrength={1.5}
      />

      {links.map(([a, b]) => (
        <Line
          key={`${a.id}-${b.id}`}
          points={[at.get(a.id)!, at.get(b.id)!]}
          color={partitioned ? groupColor(a.group) : COLORS.link}
          lineWidth={1.2}
          transparent
          opacity={0.55}
        />
      ))}

      {nodes.map((node, i) => (
        <NodeMesh
          key={node.id}
          node={node}
          position={positions[i]!}
          selected={node.id === selectedId}
          partitioned={partitioned}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
        />
      ))}

      {packets.map((p) => {
        const from = at.get(p.from);
        const to = at.get(p.to);
        return from && to ? <PacketMesh key={p.id} packet={p} from={from} to={to} reducedMotion={reducedMotion} /> : null;
      })}

      <Rig apiRef={cameraApi} />
    </Canvas>
  );
}

// ------------------------------------------------------------------- camera
function Rig({ apiRef }: { apiRef: RefObject<NetworkCameraApi | null> }) {
  const controls = useRef<CameraControls>(null);
  useEffect(() => {
    void controls.current?.setLookAt(...HOME, false);
    apiRef.current = { reset: () => void controls.current?.setLookAt(...HOME, true) };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);
  return <CameraControls ref={controls} makeDefault minDistance={5} maxDistance={32} maxPolarAngle={Math.PI * 0.47} smoothTime={0.35} />;
}

// --------------------------------------------------------------------- node
const NodeMesh = memo(function NodeMesh({
  node,
  position,
  selected,
  partitioned,
  reducedMotion,
  onSelect,
}: {
  node: NodeSummaryOut;
  position: [number, number, number];
  selected: boolean;
  partitioned: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}) {
  const ring = useRef<Mesh>(null);
  const visual = nodeVisual(node);
  const color = NODE_COLOR[visual];
  const offline = visual === "offline";

  const label = useMemo(
    () =>
      createLabelTexture({
        title: `${node.name} · yükseklik ${node.height}`,
        ...(offline ? { subtitle: "Çevrimdışı" } : { hash: node.tip_hash }),
        color,
      }),
    [node.name, node.height, node.tip_hash, offline, color],
  );
  useEffect(() => () => label.dispose(), [label]);

  // Spinning ring while mining (only then do we request frames).
  useFrame((state, delta) => {
    if (!node.mining || !ring.current) return;
    if (!reducedMotion) ring.current.rotation.z += delta * 2.5;
    state.invalidate();
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta <= 4) onSelect(node.id);
  };

  return (
    <group position={position}>
      <group
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
        scale={selected ? 1.12 : 1}
      >
        <mesh>
          <sphereGeometry args={[NODE_RADIUS, 32, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={offline ? 0.05 : selected ? 0.7 : 0.4}
            metalness={0.2}
            roughness={0.35}
            transparent={offline}
            opacity={offline ? 0.35 : 1}
          />
        </mesh>
        {offline && (
          <mesh raycast={() => null}>
            <sphereGeometry args={[NODE_RADIUS * 1.04, 12, 8]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.6} />
          </mesh>
        )}
        {/* The node's latest block, coloured by its hash: same colour = same tip. */}
        {!offline && (
          <mesh position={[0, NODE_RADIUS + 0.32, 0]} raycast={() => null}>
            <boxGeometry args={[0.36, 0.36, 0.36]} />
            <meshStandardMaterial color={tipColor(node.tip_hash)} emissive={tipColor(node.tip_hash)} emissiveIntensity={0.45} />
          </mesh>
        )}
        {node.mining && (
          <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]} raycast={() => null}>
            <torusGeometry args={[NODE_RADIUS * 1.45, 0.035, 8, 48, Math.PI * 1.4]} />
            <meshBasicMaterial color={COLORS.status.mining} toneMapped={false} />
          </mesh>
        )}
      </group>

      <Billboard position={[0, NODE_RADIUS + 1.3, 0]}>
        <mesh raycast={() => null}>
          <planeGeometry args={[LABEL_WORLD_WIDTH, LABEL_WORLD_HEIGHT]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>

      {/* Floor ring: selection (accent) or partition group colour. */}
      {(selected || partitioned) && (
        <mesh position={[0, -1.09, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[NODE_RADIUS * 1.25, NODE_RADIUS * (selected ? 1.45 : 1.35), 48]} />
          <meshBasicMaterial color={selected ? COLORS.accent : groupColor(node.group)} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
});

// ------------------------------------------------------------------- packet
const ARC_HEIGHT = 1.4;
const EFFECT_MS = 900;
const tmp = new Vector3();

/** Position along a raised arc from `a` to `b` at progress t (0..1). */
function arc(a: [number, number, number], b: [number, number, number], t: number, out: Vector3): Vector3 {
  out.set(a[0] + (b[0] - a[0]) * t, 0.2 + Math.sin(Math.PI * t) * ARC_HEIGHT, a[2] + (b[2] - a[2]) * t);
  return out;
}

const PacketMesh = memo(function PacketMesh({
  packet,
  from,
  to,
  reducedMotion,
}: {
  packet: Packet;
  from: [number, number, number];
  to: [number, number, number];
  reducedMotion: boolean;
}) {
  const body = useRef<Group>(null);
  const bodyMat = useRef<MeshBasicMaterial>(null);
  const burst = useRef<Mesh>(null);
  const burstMat = useRef<MeshBasicMaterial>(null);
  const arrivedAt = useRef<number | null>(null);

  const color = packet.invalid ? KIND_COLOR.invalid : KIND_COLOR[packet.kind];
  const outcomeColor = packet.outcome ? OUTCOME_COLOR[packet.outcome] : color;

  useFrame((state) => {
    const g = body.current;
    if (!g) return;
    const now = performance.now();
    // A packet that was never sent only travels a short way before fizzling out.
    const reach = packet.neverSent ? 0.35 : 1;
    const t = Math.min(1, (now - packet.startedAt) / Math.max(packet.durationMs, 1));
    arc(from, to, t * reach, tmp);

    let done = false;
    if (t < 1) {
      g.position.copy(tmp);
      if (!reducedMotion) g.rotation.y += 0.08;
      g.visible = true;
    } else if (packet.outcome === "dropped") {
      // Lost: fall and fade where it stopped.
      const fall = (now - packet.startedAt - packet.durationMs) / 700;
      g.position.set(tmp.x, tmp.y - fall * 1.5, tmp.z);
      if (bodyMat.current) bodyMat.current.opacity = Math.max(0, 1 - fall);
      done = fall >= 1;
    } else if (packet.outcome === null) {
      // Arrived, outcome not reported yet: wait at the receiver.
      g.position.copy(tmp);
    } else {
      // Arrived with an outcome: hide the packet, play a burst ring at the receiver.
      g.visible = false;
      arrivedAt.current ??= now;
      const k = (now - arrivedAt.current) / EFFECT_MS;
      if (burst.current && burstMat.current) {
        burst.current.visible = k < 1;
        burst.current.position.set(to[0], 0.05, to[2]);
        burst.current.scale.setScalar(0.6 + k * 1.4);
        burstMat.current.opacity = Math.max(0, 0.9 * (1 - k));
      }
      done = k >= 1;
    }
    if (!done) state.invalidate();
  });

  const size = packet.kind === "transaction" ? 0.12 : 0.22;
  return (
    <>
      <group ref={body}>
        {packet.kind === "chain" ? (
          // A whole chain: a short row of blocks.
          [-0.26, 0, 0.26].map((x) => (
            <mesh key={x} position={[x, 0, 0]} raycast={() => null}>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshBasicMaterial ref={x === 0 ? bodyMat : undefined} color={color} transparent toneMapped={false} />
            </mesh>
          ))
        ) : packet.kind === "transaction" ? (
          <mesh raycast={() => null}>
            <sphereGeometry args={[size, 12, 8]} />
            <meshBasicMaterial ref={bodyMat} color={color} transparent toneMapped={false} />
          </mesh>
        ) : (
          <mesh raycast={() => null}>
            <boxGeometry args={[size * 1.4, size * 1.4, size * 1.4]} />
            <meshBasicMaterial ref={bodyMat} color={color} transparent toneMapped={false} />
          </mesh>
        )}
      </group>
      <mesh ref={burst} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.75, 0.95, 40]} />
        <meshBasicMaterial ref={burstMat} color={outcomeColor} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
});
