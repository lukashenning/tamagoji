// Every symbol has its own 5-step melody (docs/07, D108). Deterministic: the same emoji always gets
// the same melody, on every device. Melodies are diatonic (major scale): they start on a note of the
// home chord, move mostly in steps, and end on a note of the home chord, mostly the home note itself.
// Emojis of the same palette section share a key; each subgroup sits in that key or a closely related
// one (one fifth up or down), so similar emojis sound related. The middle three steps can be pauses;
// the first and last always sound. ✅ ❌ ❓ have fixed melodies in C major.
//
// Unique and robust for listening (mic mode): no two signs share a melody, and any two melodies differ
// in at least 2 of their 5 steps, so one misheard note never turns into another sign (it is noticed
// and ignored instead). Each emoji draws musical candidates from its own random stream and takes the
// first that keeps this distance to all melodies assigned before it (in a fixed order).

import { hashString, mulberry32 } from './rng.js';
import { INFO, ALL } from './emojiIndex.js';
import { YES, NO, ASK } from './tokens.js';

export const MELODY_STEPS = 5;
export const MELODY_MS = 500; // whole melody; 100 ms per step

// MIDI note numbers (84 = C6). null = pause.
const FIXED = {
  [YES]: [91, null, null, null, 96], // G – C: rising fourth
  [NO]: [91, null, null, null, 84], // G – C: falling fifth
  [ASK]: [88, null, 88, null, 88], // E E E: the third, three times
};
export const PLAYER_OCTAVE = -1; // your ✓ ✗ ❓ sound an octave lower (src/ui/sound.js)

// home key per palette section (semitones above C)
const SECTION_KEY = { smileys: 0, animals: 5, food: 2, activity: 9, travel: 3, objects: 10, symbols: 4 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const CHORD = [0, 2, 4, 7]; // scale degrees of the home chord: 1, 3, 5, 8
const MAX_DEGREE = 7; // range: one octave, from the home note up to its octave

const mod = (a, n) => ((a % n) + n) % n;

/** The key of an emoji: its section's key, shifted a fifth up or down for some subgroups. */
export function keyOf(tok) {
  const info = INFO.get(tok);
  if (!info) return FIXED[tok] ? 0 : hashString('key:' + tok) % 12;
  const shift = [-7, 0, 0, 7][hashString('sub:' + info.subgroup) % 4];
  return mod((SECTION_KEY[info.section] ?? 0) + shift, 12);
}

function degreeToMidi(key, degree) {
  const home = 84 + (key > 6 ? key - 12 : key); // home note between F#5 and F#6
  return home + 12 * Math.floor(degree / 7) + MAJOR[mod(degree, 7)];
}

/** One musical candidate melody for a key, drawn from `rng`; `free`: any degrees (last resort). */
function candidate(rng, key, free = false) {
  const pickW = (items, weights) => {
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
    return items[items.length - 1];
  };
  let deg = pickW(CHORD, [3, 2, 3, 1]);
  const degrees = [deg];
  for (let i = 1; i < MELODY_STEPS - 1; i++) {
    if (rng() < 0.25) {
      degrees.push(null);
      continue;
    }
    deg = free ? Math.floor(rng() * (MAX_DEGREE + 1)) : Math.max(0, Math.min(MAX_DEGREE, deg + pickW([-2, -1, 1, 2, 0], [2, 4, 4, 2, 1]))); // mostly steps
    degrees.push(deg);
  }
  // end on the home chord, nearest to the last note: mostly the home note (or its octave)
  const target = pickW([0, 4, 2], [6, 3, 1]);
  const ends = [target, target + 7].filter((d) => d <= MAX_DEGREE);
  degrees.push(free ? pick(ends, rng) : ends.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a)));
  return degrees.map((d) => (d === null ? null : degreeToMidi(key, d)));
}
const pick = (xs, rng) => xs[Math.floor(rng() * xs.length)];

const melodyKey = (notes) => notes.map((n) => (n === null ? '-' : n)).join(',');

// ── the table of all melodies, built once ──
let TABLE = null; // tok -> notes
let BY_MELODY = null; // melody key -> tok (also your ✓ ✗ ❓ an octave lower)

function build() {
  TABLE = new Map();
  BY_MELODY = new Map();
  const taken = new Set(); // melody keys with one step blanked: a new melody may not share one
  const blanks = (notes) => notes.map((_, i) => melodyKey(notes.map((n, j) => (j === i ? '*' : n))));
  const take = (tok, notes, alias = false) => {
    for (const b of blanks(notes)) taken.add(b);
    BY_MELODY.set(melodyKey(notes), tok);
    if (!alias) TABLE.set(tok, notes);
  };
  for (const [tok, notes] of Object.entries(FIXED)) {
    take(tok, notes);
    take(tok, notes.map((n) => (n === null ? null : n + 12 * PLAYER_OCTAVE)), true); // as you play them
  }
  for (const tok of ALL) {
    if (TABLE.has(tok)) continue;
    const rng = mulberry32(hashString('melody:' + tok));
    const key = keyOf(tok);
    let notes = null;
    for (let k = 0; k < 4000 && !notes; k++) {
      const c = candidate(rng, k < 600 ? key : (key + k) % 12, k >= 1500); // more freedom if it's crowded
      if (!blanks(c).some((b) => taken.has(b))) notes = c;
    }
    take(tok, notes || candidate(rng, key));
  }
}

/** @returns {(number|null)[]} 5 MIDI note numbers; null = pause */
export function melodyNotes(tok) {
  if (FIXED[tok]) return FIXED[tok];
  if (!TABLE) build();
  return TABLE.get(tok) || candidate(mulberry32(hashString('melody:' + tok)), keyOf(tok)); // (not in the emoji list: not unique)
}

/** The sign whose melody this is (also your ✓ ✗ ❓ an octave lower), or null. notes: 5 MIDI numbers / null. */
export function signForMelody(notes) {
  if (!BY_MELODY) build();
  return BY_MELODY.get(melodyKey(notes)) ?? null;
}

/** Every pitch (MIDI) any melody uses, lowest first (for listening). */
export function melodyPitches() {
  if (!TABLE) build();
  const set = new Set();
  for (const k of BY_MELODY.keys()) for (const n of k.split(',')) if (n !== '-') set.add(Number(n));
  return [...set].sort((a, b) => a - b);
}

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** @returns {(number|null)[]} 5 frequencies in Hz; null = pause */
export function melodyFor(tok) {
  return melodyNotes(tok).map((m) => (m === null ? null : midiToHz(m)));
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** e.g. "G4 · · · C5" */
export function melodyText(tok) {
  return melodyNotes(tok)
    .map((m) => (m === null ? '·' : NAMES[m % 12] + (Math.floor(m / 12) - 1)))
    .join(' ');
}

export const KEY_NAMES = NAMES;
