// Seeded randomness, so replaying the same history always rebuilds the same creature.

export function hashString(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic random generator for a named purpose, e.g. rngFor(seed, 'dream', 3). */
export function rngFor(seed, ...parts) {
  return mulberry32(hashString(parts.join('|'), seed >>> 0));
}

/** Sample a key from [[key, weight], ...]. */
export function sample(entries, rng) {
  let total = 0;
  for (const [, w] of entries) total += w;
  if (total <= 0) return entries.length ? entries[0][0] : null;
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
