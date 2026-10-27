/**
 * Tests for the WebSocket protocol + reconnection logic.
 * Run with:  npm test   (Node's built-in test runner; Node 24 strips the types)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backoffDelay,
  parseServerMessage,
  RealtimeConnection,
  SequenceTracker,
  type RealtimeStatus,
  type ServerEvent,
  type ServerMessage,
  type SocketLike,
  type Timers,
} from "../src/lib/realtime/connection.ts";

// ------------------------------------------------------------------ helpers
const msg = (type: string, seq: number, data: object = {}, origin: string | null = null) =>
  JSON.stringify({ type, seq, ts: 1, origin, data });

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  sent: string[] = [];
  closedWith: number | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? 1000;
  }
  // Server-side helpers
  open() {
    this.onopen?.({});
  }
  receive(text: string) {
    this.onmessage?.({ data: text });
  }
  drop() {
    this.onclose?.({ code: 1006 });
  }
}

class FakeTimers implements Timers {
  private next = 1;
  pending = new Map<number, { fn: () => void; ms: number }>();
  setTimeout(fn: () => void, ms: number) {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.pending.delete(handle as number);
  }
  /** Delays of the timers currently scheduled. */
  delays() {
    return [...this.pending.values()].map((t) => t.ms).sort((a, b) => a - b);
  }
  /** Fire the timer with the given delay (or the shortest one). */
  fire(ms?: number) {
    const entry = [...this.pending.entries()].find(([, t]) => ms === undefined || t.ms === ms);
    assert.ok(entry, `no timer with delay ${ms}`);
    this.pending.delete(entry[0]);
    entry[1].fn();
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const timers = new FakeTimers();
  const events: ServerEvent[] = [];
  const statuses: RealtimeStatus[] = [];
  const resyncs: string[] = [];
  const conn = new RealtimeConnection(
    "ws://test/api/ws",
    {
      onEvent: (e) => events.push(e),
      onStatus: (s) => statuses.push(s),
      onResync: (r) => resyncs.push(r),
    },
    {
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      timers,
      random: () => 0.5, // no jitter: delays are exactly 1s, 2s, 4s...
    },
  );
  const latest = () => sockets[sockets.length - 1]!;
  return { conn, sockets, timers, events, statuses, resyncs, latest };
}

// ------------------------------------------------------------------- parsing
describe("parseServerMessage", () => {
  it("accepts a well-formed event", () => {
    const parsed = parseServerMessage(msg("difficulty.changed", 3, { difficulty: 4 }, "tab-1"));
    assert.deepEqual(parsed, { type: "difficulty.changed", seq: 3, ts: 1, origin: "tab-1", data: { difficulty: 4 } });
  });

  it("accepts network simulation events", () => {
    const raw = msg("network.message_sent", 9, { message_id: "m1", kind: "block", from_node: "node-1", to_node: "node-2", latency_ms: 800 });
    assert.equal(parseServerMessage(raw)?.type, "network.message_sent");
  });

  it("rejects malformed or unknown messages", () => {
    for (const raw of [
      "not json",
      "42",
      "null",
      JSON.stringify({ type: "evil.event", seq: 1, ts: 1, data: {} }),
      JSON.stringify({ type: "hello", ts: 1, data: {} }), // no seq
      JSON.stringify({ type: "hello", seq: 1, ts: 1, data: "x" }),
      JSON.stringify({ type: "hello", seq: 1, ts: 1, origin: 5, data: {} }),
    ]) {
      assert.equal(parseServerMessage(raw), null, raw);
    }
    assert.equal(parseServerMessage(new ArrayBuffer(4)), null);
  });
});

describe("SequenceTracker", () => {
  const ev = (seq: number) => ({ type: "difficulty.changed", seq, ts: 0, origin: null, data: { difficulty: 1 } }) as ServerMessage;
  const hb = (seq: number) => ({ type: "heartbeat", seq, ts: 0, origin: null, data: {} }) as ServerMessage;

  it("detects gaps and duplicates", () => {
    const t = new SequenceTracker();
    t.reset(5);
    assert.equal(t.observe(ev(6)), "ok");
    assert.equal(t.observe(ev(6)), "duplicate");
    assert.equal(t.observe(ev(9)), "gap");
    assert.equal(t.observe(ev(10)), "ok");
  });

  it("uses control messages to notice events missed while idle", () => {
    const t = new SequenceTracker();
    t.reset(5);
    assert.equal(t.observe(hb(5)), "ok");
    assert.equal(t.observe(hb(7)), "gap");
    assert.equal(t.observe(ev(8)), "ok");
  });
});

describe("backoffDelay", () => {
  it("doubles up to the cap, with ±20% jitter", () => {
    const mid = () => 0.5;
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((a) => backoffDelay(a, 1000, 15000, mid)), [1000, 2000, 4000, 8000, 15000, 15000]);
    assert.equal(backoffDelay(0, 1000, 15000, () => 0), 800);
    assert.equal(backoffDelay(0, 1000, 15000, () => 1), 1200);
  });
});

// ---------------------------------------------------------------- connection
describe("RealtimeConnection", () => {
  it("connects, resyncs on hello, and delivers events in order", () => {
    const { conn, latest, statuses, resyncs, events } = setup();
    conn.start();
    assert.equal(latest().url, "ws://test/api/ws");
    latest().open();
    latest().receive(msg("hello", 10, { heartbeat_interval: 15 }));
    latest().receive(msg("transaction.created", 11, { transaction: {}, pending_count: 1 }));
    latest().receive(msg("mining.started", 12, { job: {} }, "tab-x"));

    assert.deepEqual(statuses, ["connecting", "open"]);
    assert.deepEqual(resyncs, ["connected"]);
    assert.deepEqual(events.map((e) => [e.type, e.seq, e.origin]), [
      ["transaction.created", 11, null],
      ["mining.started", 12, "tab-x"],
    ]);
  });

  it("drops duplicates and asks for a resync on gaps", () => {
    const { conn, latest, resyncs, events } = setup();
    conn.start();
    latest().open();
    latest().receive(msg("hello", 0, { heartbeat_interval: 15 }));
    latest().receive(msg("difficulty.changed", 1, { difficulty: 2 }));
    latest().receive(msg("difficulty.changed", 1, { difficulty: 2 })); // duplicate
    latest().receive(msg("difficulty.changed", 4, { difficulty: 3 })); // missed 2-3
    latest().receive("garbage");
    assert.deepEqual(events.map((e) => e.seq), [1, 4]);
    assert.deepEqual(resyncs, ["connected", "gap"]);
  });

  it("reconnects with exponential backoff and resets it after success", () => {
    const { conn, sockets, timers, latest, statuses } = setup();
    conn.start();
    latest().drop(); // server unreachable
    assert.deepEqual(timers.delays(), [1000]);
    timers.fire(1000);
    latest().drop();
    assert.deepEqual(timers.delays(), [2000]);
    timers.fire(2000);
    latest().drop();
    assert.deepEqual(timers.delays(), [4000]);
    timers.fire(4000);

    latest().open(); // server is back
    latest().receive(msg("hello", 0, { heartbeat_interval: 15 }));
    latest().drop();
    assert.deepEqual(timers.delays(), [1000], "backoff resets after a successful connection");
    assert.equal(sockets.length, 4);
    assert.ok(statuses.includes("closed"));
  });

  it("treats a silent connection as dead (heartbeat watchdog)", () => {
    const { conn, sockets, timers, latest, statuses } = setup();
    conn.start();
    latest().open();
    latest().receive(msg("hello", 0, { heartbeat_interval: 2 }));
    assert.deepEqual(timers.delays(), [5000]); // 2.5 x heartbeat
    latest().receive(msg("heartbeat", 0));
    assert.deepEqual(timers.delays(), [5000], "traffic re-arms the watchdog");

    timers.fire(5000); // nothing arrived in time
    assert.equal(sockets[0]!.closedWith, 4000);
    assert.equal(statuses.at(-1), "closed");
    assert.deepEqual(timers.delays(), [1000]);
    timers.fire(1000);
    assert.equal(sockets.length, 2);
  });

  it("ignores callbacks from a socket it has already replaced", () => {
    const { conn, sockets, timers, latest, events } = setup();
    conn.start();
    latest().open();
    timers.fire(); // watchdog -> replace socket
    timers.fire(1000);
    const old = sockets[0]!;
    old.receive(msg("difficulty.changed", 99, { difficulty: 6 })); // handlers were detached
    old.drop();
    assert.equal(events.length, 0);
    assert.equal(sockets.length, 2);
    assert.deepEqual(timers.delays(), [], "no extra reconnect scheduled");
  });

  it("retryNow() skips the remaining backoff, but never doubles a live socket", () => {
    const { conn, sockets, timers, latest } = setup();
    conn.start();
    for (const ms of [1000, 2000, 4000]) {
      latest().drop();
      timers.fire(ms);
    }
    latest().drop();
    assert.deepEqual(timers.delays(), [8000]); // long wait ahead...
    conn.retryNow(); // ...but REST says the server is back
    assert.equal(sockets.length, 5);
    assert.deepEqual(timers.delays(), [], "pending backoff timer was cancelled");

    conn.retryNow(); // socket already connecting: no-op
    latest().open();
    conn.retryNow(); // socket open: no-op
    assert.equal(sockets.length, 5);
    conn.stop();
  });

  it("stop() closes the socket and never reconnects", () => {
    const { conn, sockets, timers, latest } = setup();
    conn.start();
    latest().open();
    conn.stop();
    assert.equal(sockets[0]!.closedWith, 1000);
    assert.equal(timers.pending.size, 0);
    sockets[0]!.drop();
    assert.equal(timers.pending.size, 0);
    assert.equal(sockets.length, 1);
  });

  it("survives a WebSocket constructor that throws", () => {
    const timers = new FakeTimers();
    let calls = 0;
    const conn = new RealtimeConnection(
      "ws://bad",
      { onEvent() {}, onStatus() {}, onResync() {} },
      {
        timers,
        random: () => 0.5,
        createSocket: () => {
          calls += 1;
          throw new Error("SecurityError");
        },
      },
    );
    conn.start();
    assert.deepEqual(timers.delays(), [1000]);
    timers.fire(1000);
    assert.equal(calls, 2);
    conn.stop();
  });
});
