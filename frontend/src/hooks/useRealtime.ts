"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { WS_URL } from "@/lib/config";
import { RealtimeConnection, type RealtimeStatus, type ServerEvent } from "@/lib/realtime/connection";

interface Options {
  onEvent: (event: ServerEvent) => void;
  /** Reload state over REST (after connecting, or when events were missed). */
  onResync: (reason: "connected" | "gap") => void;
}

/**
 * One WebSocket per tab for the lifetime of the dashboard. All protocol and
 * reconnection logic lives in RealtimeConnection; this just binds it to React.
 */
export function useRealtime({ onEvent, onResync }: Options) {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  // Latest callbacks, without reconnecting when they change.
  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    onEventRef.current = onEvent;
    onResyncRef.current = onResync;
  });

  const connectionRef = useRef<RealtimeConnection | null>(null);
  useEffect(() => {
    const connection = new RealtimeConnection(WS_URL, {
      onEvent: (event) => onEventRef.current(event),
      onResync: (reason) => onResyncRef.current(reason),
      onStatus: setStatus,
    });
    connectionRef.current = connection;
    connection.start();
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, []);

  const retryNow = useCallback(() => connectionRef.current?.retryNow(), []);

  return { status, live: status === "open", retryNow };
}
