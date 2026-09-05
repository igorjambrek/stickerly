/**
 * Deterministic pseudo-randomness.
 *
 * Decorative artwork is scattered randomly, but the editor and the PDF must
 * scatter it IDENTICALLY or the printed page will not match the screen. Every
 * generator therefore draws from a seeded stream rather than Math.random.
 */

/** FNV-1a, so a template id and page number can seed a stream. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  bool(probability?: number): boolean;
}

/** mulberry32 — small, fast, and identical across every JS runtime. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
    bool: (probability = 0.5) => next() < probability,
  };
}

/** Convenience: a stream seeded from arbitrary identifying parts. */
export const rngFrom = (...parts: (string | number)[]): Rng => makeRng(hashSeed(...parts));
