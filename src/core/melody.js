// Every symbol has its own 5-step melody (docs/07). Deterministic: the same emoji always gets the same
// melody. Melodies are diatonic (major scale): they start on a note of the home chord, move mostly in
// steps, and end on a note of the home chord, mostly the home note itself. Emojis of the same palette
// section share a key; each subgroup sits in that key or a closely related one (one fifth up or down),
// so similar emojis sound related. The middle three steps can be pauses; the first and last always sound.
// ✅ ❌ ❓ have fixed melodies in C major.

import { hashString, mulberry32 } from './rng.js';
import { INFO } from './emojiIndex.js';
import { YES, NO, ASK } from './tokens.js';

export const MELODY_STEPS = 5;
export const MELODY_MS = 500; // whole melody; 100 ms per step

// MIDI note numbers (84 = C6). null = pause.
const FIXED = {
  [YES]: [91, null, null, null, 96], // G – C: rising fourth
  [NO]: [91, null, null, null, 84], // G – C: falling fifth
  [ASK]: [88, null, 88, null, 88], // E E E: the third, three times
};

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

/** @returns {(number|null)[]} 5 MIDI note numbers; null = pause */
export function melodyNotes(tok) {
  if (FIXED[tok]) return FIXED[tok];
  const rng = mulberry32(hashString('melody:' + tok));
  const key = keyOf(tok);
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
    deg += pickW([-2, -1, 1, 2, 0], [2, 4, 4, 2, 1]); // mostly steps
    deg = Math.max(0, Math.min(MAX_DEGREE, deg));
    degrees.push(deg);
  }
  // end on the home chord, nearest to the last note: mostly the home note (or its octave)
  const target = pickW([0, 4, 2], [6, 3, 1]);
  const ends = [target, target + 7].filter((d) => d <= MAX_DEGREE);
  degrees.push(ends.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a)));
  return degrees.map((d) => (d === null ? null : degreeToMidi(key, d)));
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
