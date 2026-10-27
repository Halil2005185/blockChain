/**
 * Conceptual Proof of Work vs Proof of Stake comparison (browser only).
 *
 * This is a teaching model, NOT an implementation of Proof of Stake:
 * - PoW: each round, the chance a miner wins equals its share of total hash
 *   power, and the round costs about 16^difficulty hash attempts of work.
 * - PoS: each round, a proposer is drawn with probability equal to its share
 *   of total stake. No hashing race happens, so the "work" is zero.
 * Real PoS needs secure randomness, attestations, finality and slashing.
 */

export interface Participant {
  name: string;
  /** Hash power (PoW) or stake (PoS); any non-negative weight. */
  weight: number;
}

export interface RoundSummary {
  wins: Record<string, number>;
  rounds: number;
  /** Hash attempts spent in total (0 for PoS). */
  work: number;
}

/** Small, seedable PRNG (mulberry32) so results are reproducible in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one participant with probability proportional to its weight. */
export function weightedPick(participants: readonly Participant[], random: () => number): string {
  const total = participants.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) throw new Error("at least one participant needs a positive weight");
  let r = random() * total;
  for (const p of participants) {
    r -= Math.max(0, p.weight);
    if (r < 0) return p.name;
  }
  return participants[participants.length - 1]!.name;
}

export function simulate(
  participants: readonly Participant[],
  rounds: number,
  random: () => number,
  workPerRound: number,
): RoundSummary {
  const wins: Record<string, number> = Object.fromEntries(participants.map((p) => [p.name, 0]));
  for (let i = 0; i < rounds; i++) wins[weightedPick(participants, random)]! += 1;
  return { wins, rounds, work: workPerRound * rounds };
}

export const simulatePoW = (miners: readonly Participant[], rounds: number, random: () => number, difficulty: number) =>
  simulate(miners, rounds, random, 16 ** difficulty);

export const simulatePoS = (validators: readonly Participant[], rounds: number, random: () => number) =>
  simulate(validators, rounds, random, 0);
