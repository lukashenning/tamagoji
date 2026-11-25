// The scripted player for simulated play (tests/play.js, tests/proximity.js).
import { YES, NO, ASK, isElemental } from '../src/core/tokens.js';

// The player: speaks a small language (a few chains), answers its signs with ✓ when it continued a
// chain, ✗ when it didn't, sometimes waits with ☐, sometimes says something random.
export const LANG = [
  ['🐶', '🌞', '🦴', '🎾'],
  ['🍕', '🚗', '🌙'],
  ['🎈', '🐟', '🦄', '⭐', '🍎'],
];
export function player(rng, m, last) {
  const r = rng();
  const prev = m.seq[m.seq.length - 1]?.tok;
  const prev2 = m.seq[m.seq.length - 2]?.tok;
  if (last && last.who === 'C' && !isElemental(last.tok)) {
    // judge its sign: did it continue a chain correctly?
    const ok = LANG.some((c) => c.some((x, i) => i > 0 && x === last.tok && c[i - 1] === prev2));
    if (r < 0.25) return ok ? YES : NO;
  }
  if (r < 0.4) return ASK;
  if (r < 0.45) return ['🧊', '🎻', '🌵', '🪁', '🥐'][Math.floor(rng() * 5)];
  // continue a chain from the last real sign, or start one
  for (const c of LANG) {
    const i = c.indexOf(prev);
    if (i >= 0 && i < c.length - 1) return c[i + 1];
  }
  return LANG[Math.floor(rng() * LANG.length)][0];
}

