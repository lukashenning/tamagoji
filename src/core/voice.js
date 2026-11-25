// The creature's voice: how its melodies sound (docs/08). Every sign has its own fixed synth settings;
// the voice is a blend of the 6 seat signs' settings, weighted by how often it used each. So a new
// sign entering the top 6 (usually at #6, with few uses) shifts the voice only slightly. The synth is
// one recipe with continuous settings (src/ui/sound.js); familiar instruments are regions of that
// space (see ARCHETYPES).

import { hashString } from './rng.js';

export const DEFAULT_VOICE = { rich: 0.2, struck: 0.7, metal: 0.1, length: 0.8, hollow: 0, glide: 0.06, breath: 0, wobble: 0, chorus: 0 };

// your ✓ ✗ ❓ (played an octave lower): a steady, soft, hollow held tone, no glide or vibrato, the
// same for every creature, so it never sounds like one
export const PLAYER_VOICE = { rich: 0.4, struck: 0, metal: 0, length: 0.95, hollow: 1, glide: 0, breath: 0.15, wobble: 0, chorus: 0.5 };

// where familiar instruments sit in the space (for the panel label and the "▶ archetypes" button)
export const ARCHETYPES = {
  whistle: { rich: 0, struck: 0.1, metal: 0, hollow: 0, breath: 0 },
  flute: { rich: 0.15, struck: 0.1, metal: 0, hollow: 0, breath: 0.7 },
  organ: { rich: 0.75, struck: 0.1, metal: 0, hollow: 0.1, breath: 0 },
  chip: { rich: 0.85, struck: 0.05, metal: 0, hollow: 1, breath: 0 },
  marimba: { rich: 0.15, struck: 0.9, metal: 0.1, hollow: 0, breath: 0 },
  bell: { rich: 0.2, struck: 0.85, metal: 0.9, hollow: 0, breath: 0 },
  pluck: { rich: 0.9, struck: 0.9, metal: 0.05, hollow: 0.2, breath: 0 },
  brass: { rich: 1, struck: 0.3, metal: 0.2, hollow: 0, breath: 0.15 },
};

// each setting's range
const RANGES = {
  rich: [0, 1], // pure tone … many overtones
  struck: [0, 1], // held … struck and ringing
  metal: [0, 1], // wood … bell-like
  length: [0.35, 0.95], // share of a step the note is held
  hollow: [0, 1], // fewer even overtones ("chip")
  glide: [-0.08, 0.08], // scoop up … drop down into each note
  breath: [0, 0.8], // airy noise
  wobble: [0, 0.03], // vibrato
  chorus: [0, 1], // a second, detuned voice
};

/** A sign's own settings, 0…1 each (fixed per sign). */
const own = (tok, key) => hashString(`voice:${key}:${tok}`) / 4294967296;

/** @param {{ tok: string, uses: number }[]} seats mind.seats */
export function voiceFor(seats = []) {
  if (!seats.length) return { ...DEFAULT_VOICE };
  const w = seats.map((s) => Math.max(1, s.uses || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const q = w.map((x) => x / sum);
  // a blend of many signs drifts to the middle; rescale so a blend varies about as much as one sign
  const spread = Math.sqrt(q.reduce((a, x) => a + x * x, 0)) || 1;
  const v = {};
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const m = seats.reduce((a, s, i) => a + q[i] * own(s.tok, key), 0);
    const x = Math.min(1, Math.max(0, 0.5 + (m - 0.5) / spread));
    v[key] = +(lo + (hi - lo) * x).toFixed(3);
  }
  return v;
}

/** The archetype the voice is closest to. */
export function nearestArchetype(v) {
  let best = null;
  let bestD = Infinity;
  for (const [name, a] of Object.entries(ARCHETYPES)) {
    const d = Object.keys(a).reduce((s, k) => s + (v[k] - a[k]) ** 2, 0);
    if (d < bestD) [best, bestD] = [name, d];
  }
  return best;
}

/** Short description for the test panel. */
export function voiceText(v) {
  const n = (x) => x.toFixed(2);
  const glide = Math.abs(v.glide) < 0.02 ? 'no glide' : v.glide > 0 ? `drops ${Math.round(v.glide * 100)}%` : `scoops ${Math.round(-v.glide * 100)}%`;
  return `closest to ${nearestArchetype(v)} · rich ${n(v.rich)} · struck ${n(v.struck)} · metal ${n(v.metal)} · hollow ${n(v.hollow)} · breath ${n(v.breath)} · chorus ${n(v.chorus)} · length ${n(v.length)} · ${glide} · wobble ${(v.wobble * 100).toFixed(1)}%`;
}
