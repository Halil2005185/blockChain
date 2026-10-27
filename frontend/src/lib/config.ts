/**
 * Runtime configuration.
 *
 * NEXT_PUBLIC_* variables are replaced with their literal values when Next.js
 * builds the browser bundle, so they are safe to read in client components.
 * Set it in frontend/.env.local (see .env.example).
 */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

/**
 * Real-time event stream. Defaults to the API host with ws:// (or wss:// for
 * an https API). Override with NEXT_PUBLIC_WS_URL if they ever differ.
 */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? `${API_BASE_URL.replace(/^http/, "ws")}/api/ws`;

/** Mirrors the backend limits in app/core (block.py, transaction.py). */
export const LIMITS = {
  minDifficulty: 1,
  maxDifficulty: 6,
  maxAccountName: 64,
  maxAmount: 1_000_000_000,
  reservedSender: "NETWORK",
} as const;
