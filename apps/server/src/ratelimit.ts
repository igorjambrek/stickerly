/**
 * A sliding window, per caller, in memory.
 *
 * This exists for one job: pairing and invite codes are six characters, which
 * is short enough for a child to copy and short enough for a machine to guess
 * if it were allowed to try. The per-code attempt counter in the database stops
 * one code being ground down; this stops one caller working through many codes.
 *
 * In memory is the right amount of machinery here. The server is a single
 * process, a restart clearing the counters costs an attacker a few seconds of
 * lost progress, and the alternative is a dependency and a table for something
 * that is never read after sixty seconds.
 */

interface Window {
  hits: number[];
}

export interface RateLimiter {
  /** True when the call is allowed. Records the attempt as a side effect. */
  take(key: string): boolean;
  /** How many callers are currently being tracked. For the sweep's own test. */
  size(): number;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();
  let lastSweep = 0;

  const sweep = (now: number) => {
    // Cheap enough to do inline, rare enough not to matter: without it a long
    // uptime leaks one map entry per address that ever tried a code.
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, window] of windows) {
      if (window.hits.every((t) => now - t >= windowMs)) windows.delete(key);
    }
  };

  return {
    take(key) {
      const now = Date.now();
      sweep(now);
      const window = windows.get(key) ?? { hits: [] };
      window.hits = window.hits.filter((t) => now - t < windowMs);
      windows.set(key, window);
      if (window.hits.length >= limit) return false;
      window.hits.push(now);
      return true;
    },

    size: () => windows.size,
  };
}
