// What the keyboard shows (shared by the app and the simulator).
// Left: "Zuletzt" = the most recently used emojis (yours and the creature's), newest first, no duplicates,
// after the pinned signs ✅ ❌ ❓. Right: a random set that changes every full hour ("16 Uhr").

import { ALL } from './emojiIndex.js';
import { rngFor } from './rng.js';
import { ELEMENTALS, isContent } from './tokens.js';

export const KEYS_PER_HALF = 16; // a 4 × 4 grid per half
export const RECENT_SLOTS = KEYS_PER_HALF - ELEMENTALS.length;
const HOUR = 3600000;

/** Most recently used ordinary emojis (both speakers), newest first, without duplicates. */
export function recentEmojis(history, n = RECENT_SLOTS) {
  const out = [];
  for (let i = history.length - 1; i >= 0 && out.length < n; i--) {
    const e = history[i];
    if ((e.who === 'P' || e.who === 'C') && isContent(e.tok) && !out.includes(e.tok)) out.push(e.tok);
  }
  return out;
}

/** The random set for the hour of time `t`: the same 16 emojis for the whole hour (per creature). */
export function hourlySet(seed, t, n = KEYS_PER_HALF) {
  const rng = rngFor(seed, 'keyboard', Math.floor(t / HOUR));
  const set = new Set();
  while (set.size < n) set.add(ALL[Math.floor(rng() * ALL.length)]);
  return [...set];
}

/** Header of the random half, e.g. "16 Uhr" (local time). */
export function hourLabel(t) {
  return `${new Date(t).getHours()} Uhr`;
}
