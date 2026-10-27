"use client";

import { CameraControls } from "@react-three/drei";
import { useEffect, useRef, type RefObject } from "react";
import { Box3, Vector3 } from "three";

import { CAMERA_OFFSET, SPACING } from "@/components/scene/sceneTheme";

/** Imperative camera commands used by the DOM toolbar (outside the Canvas). */
export interface CameraApi {
  /** Fly to world x, keeping the current viewing angle and distance. */
  focus: (x: number) => void;
  /** Fit the whole chain into view. */
  overview: () => void;
  /** Back to the default 3/4 view of the focused block. */
  reset: () => void;
}

interface CameraRigProps {
  apiRef: RefObject<CameraApi | null>;
  /** World x the camera should look at; changes trigger a smooth fly-to. */
  focusX: number;
  /** World x range covered by the chain (for "overview"). */
  minX: number;
  maxX: number;
  /** Reports the block index nearest the camera target when it comes to rest. */
  onRestIndex: (index: number) => void;
}

/**
 * drei's CameraControls (camera-controls library):
 *   left-drag = rotate · right-drag / two fingers = pan · wheel / pinch = zoom.
 * It also animates smooth transitions, which we use to fly between blocks.
 */
export function CameraRig({ apiRef, focusX, minX, maxX, onRestIndex }: CameraRigProps) {
  const controls = useRef<CameraControls>(null);
  const initialised = useRef(false);
  const focusRef = useRef(focusX);

  // Follow the focus (selected block, or the block being mined).
  useEffect(() => {
    focusRef.current = focusX;
    const c = controls.current;
    if (!c) return;
    if (!initialised.current) {
      initialised.current = true;
      void c.setLookAt(focusX + CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z, focusX, 0, 0, false);
      return;
    }
    void c.moveTo(focusX, 0, 0, true);
  }, [focusX]);

  // Expose commands to the toolbar.
  useEffect(() => {
    apiRef.current = {
      focus: (x) => void controls.current?.moveTo(x, 0, 0, true),
      overview: () => {
        const box = new Box3(new Vector3(minX - 1.5, -1.2, -1.5), new Vector3(maxX + 1.5, 2.2, 1.5));
        void controls.current?.fitToBox(box, true, { paddingLeft: 0.6, paddingRight: 0.6, paddingTop: 0.4, paddingBottom: 0.4 });
      },
      reset: () => {
        const x = focusRef.current;
        void controls.current?.setLookAt(x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z, x, 0, 0, true);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, minX, maxX]);

  const handleRest = () => {
    const c = controls.current;
    if (!c) return;
    const target = c.getTarget(new Vector3());
    onRestIndex(Math.round(target.x / SPACING));
  };

  // Allow zooming out far enough to see long chains.
  const extent = Math.max(30, (maxX - minX) * 1.3);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={2.5}
      maxDistance={extent}
      // Keep the camera above the floor.
      maxPolarAngle={Math.PI * 0.47}
      smoothTime={0.35}
      dollyToCursor
      onRest={handleRest}
    />
  );
}
