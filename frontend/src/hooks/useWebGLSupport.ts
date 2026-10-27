"use client";

import { useEffect, useState } from "react";

/**
 * null while checking (first render), then true/false.
 * Add `?3d=off` to the URL to force the 2D fallback (handy for testing).
 */
export function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let ok = false;
    try {
      const forcedOff = new URLSearchParams(window.location.search).get("3d") === "off";
      const canvas = document.createElement("canvas");
      ok = !forcedOff && Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      ok = false;
    }
    setSupported(ok);
  }, []);

  return supported;
}
