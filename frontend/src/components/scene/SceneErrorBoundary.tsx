"use client";

import { Component, type ReactNode } from "react";

interface Props {
  onError: (message: string) => void;
  children: ReactNode;
}

/**
 * Catches errors thrown while rendering the 3D scene (shader compile errors,
 * driver issues, ...) so they can't take the whole dashboard down.
 * React only supports error boundaries as class components.
 */
export class SceneErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
