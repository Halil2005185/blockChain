/** Small, pure formatting helpers used across the UI. */

/** "000abc123def…9f2e" - enough to recognise a hash at a glance. */
export function shortHash(hash: string, head = 10, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** Splits "000ab12" into ["000", "ab12"] so leading zeros can be highlighted. */
export function splitLeadingZeros(hash: string): [string, string] {
  const match = /^0*/.exec(hash);
  const zeros = match ? match[0] : "";
  return [zeros, hash.slice(zeros.length)];
}

/** Unix seconds -> "14:03:27". */
export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour12: false });
}

/** Unix seconds -> "2025-01-01 00:00:00". */
export function formatDateTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

const integer = new Intl.NumberFormat("en-US");
export const formatInt = (n: number) => integer.format(Math.round(n));

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const formatCompact = (n: number) => compact.format(n);

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
export const formatAmount = (n: number) => `${amount.format(n)} EDU`;

export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} sn`;
  const m = Math.floor(seconds / 60);
  return `${m} dk ${Math.round(seconds - m * 60)} sn`;
}

/**
 * Keeps a left-to-right run such as "#12" in the right order inside Arabic
 * (right-to-left) text, using a Unicode isolate: LRI (U+2066) … PDI (U+2069).
 * Without it, "الكتلة #3" displays as "الكتلة 3#". In JSX, <bdi> does the same.
 */
const LRI = String.fromCharCode(0x2066); // left-to-right isolate
const PDI = String.fromCharCode(0x2069); // pop directional isolate
export const ltr = (text: string | number) => `${LRI}${text}${PDI}`;
