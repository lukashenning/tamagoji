// The creature's look (D77): it is made of up to 7 parts, one per top sign, shown by level.
//
//  - Parts, in rank order: the most used sign drives the eyes, the 2nd the hat, … the 7th the object.
//  - Level 1–6 from complexity: level L shows the first L + 1 parts (level 1: eyes + hat).
//  - Each sign maps to one style + colour (the same for every creature): signs are spread evenly over
//    the styles a part has, and the 64 gbc1 colours fill up the rest.
//  - Each style has up to 6 variants; variant 1 is the default. Fixed variants: eyes 2 = closed (asleep),
//    mouth 2 = ✓, mouth 3 = ✗, arms 2 = ? .
//  - A move = 7 digits 1–6, one variant per part. Every sign it says has its own move (random when it
//    first says it). Your answer to its sign changes that sign's move: ✓ keeps it, ✗ re-rolls it,
//    anything else changes one digit. A digit beyond the style's variants shows variant 1.
//  - The pose (what is shown now) = the move of its current sign, or a fixed pose after ✓ ✗ ❓ (yours
//    or its), 2111111 while asleep, all 1 after waking.

import { ALL } from './emojiIndex.js';
import { hashString } from './rng.js';
import { YES, NO, ASK } from './tokens.js';
import { GBC1 } from './palettes.js';

export const PARTS = ['eyes', 'hat', 'mouth', 'legs', 'arms', 'nose', 'object'];
export const PART_EMOJI = ['👀', '🎩', '👄', '🦵', '🦾', '🐽', '🎸'];
export const VARIANTS = 6;

const pose = (part, variant) => PARTS.map((p) => (p === part ? variant : 1));
export const DEFAULT_POSE = pose(null, 1);
export const SLEEP_POSE = pose('eyes', 2);
/** Fixed poses for ✓ ✗ ❓, yours or its. */
export const SPECIAL_POSE = { [YES]: pose('mouth', 2), [NO]: pose('mouth', 3), [ASK]: pose('arms', 2) };

/** Level 1–6 for a complexity value. `at` = the complexity needed for levels 2…6. */
export function levelFor(complexity, at) {
  let level = 1;
  for (const x of at) if (complexity >= x) level++;
  return level;
}

/** How many parts a level shows. */
export const partsShown = (level) => Math.min(PARTS.length, level + 1);

// every sign's place in one fixed shuffled order (the same for every creature)
const ORDER = new Map(
  [...ALL]
    .sort((a, b) => hashString('look:' + a) - hashString('look:' + b) || (a < b ? -1 : 1))
    .map((tok, i) => [tok, i]),
);

/**
 * A sign's style and colour for a part that has `styles` styles: signs are spread evenly over the
 * styles, the colours fill up the rest. Signs outside the list get a place from their hash.
 */
export function lookOf(tok, styles) {
  const i = ORDER.get(tok) ?? hashString('look:' + tok) % Math.max(ALL.length, 1);
  const n = Math.max(1, styles);
  const colorIndex = Math.floor(i / n) % GBC1.length;
  return { style: i % n, colorIndex, color: GBC1[colorIndex] };
}

/** A random move: 7 digits 1–6. */
export const randomMove = (rng) => PARTS.map(() => 1 + Math.floor(rng() * VARIANTS));

/** The same move with one digit changed to a different digit. */
export function mutateMove(move, rng) {
  const out = move.slice();
  const k = Math.floor(rng() * out.length);
  out[k] = 1 + ((out[k] - 1 + 1 + Math.floor(rng() * (VARIANTS - 1))) % VARIANTS);
  return out;
}

export const moveText = (move) => move.join('');

// ── colours for line art ──
// Thin monochrome lines in very light gbc1 colours (cream, off-white, pale blue …) would hardly show
// on the light background, so the parts are drawn in a darker shade of such colours: the colour scaled
// towards black (same hue and tone, like the colour in shadow) until its contrast with the background
// is at least INK_CONTRAST.
const BACKGROUND = '#f8f8f8';
const INK_CONTRAST = 2.5;

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = ([r, g, b]) => {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const hexOf = (rgb) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');

/** The colour a part is drawn in: its gbc1 colour, darkened if it is too light for thin lines. */
export function inkColor(hex) {
  const maxL = (luminance(rgbOf(BACKGROUND)) + 0.05) / INK_CONTRAST - 0.05;
  const rgb = rgbOf(hex);
  if (luminance(rgb) <= maxL) return hex;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const k = (lo + hi) / 2;
    if (luminance(rgb.map((c) => c * k)) <= maxL) lo = k;
    else hi = k;
  }
  return hexOf(rgb.map((c) => c * lo));
}
