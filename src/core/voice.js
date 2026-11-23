// The creature's voice: how its melodies sound. Derived from its appearance basis (mind.look), so the
// same slots that will later shape how it looks also shape how it sounds. A slot that isn't unlocked
// yet keeps the default, so the voice gets richer as the creature grows more complex.
//
//   face        shape → instrument (8 small synth instruments, see src/ui/sound.js)
//               colour → the instrument's own tone setting (e.g. a bell's metal, an organ's stops)
//   extremities shape → articulation (short and plucked … long and smooth)
//   hair        shape → pitch glide at the start of each note (scoop up … drop down = "boop")
//   object      shape → wobble (vibrato)

import { LOOK_COLORS } from './mind.js';

export const INSTRUMENTS = ['chip', 'bell', 'marimba', 'pluck', 'flute', 'organ', 'brass', 'whistle'];

export const DEFAULT_VOICE = { instrument: 'marimba', tone: 0.5, length: 0.8, glide: 0.06, wobble: 0 };

/** @param {object} look mind.look  @param {number} variants shapes per slot (params.lookVariants) */
export function voiceFor(look = {}, variants = 8) {
  const v = { ...DEFAULT_VOICE };
  const f = (slot) => (look[slot] ? look[slot].shape / Math.max(1, variants - 1) : null); // 0…1
  if (look.face) {
    v.instrument = INSTRUMENTS[look.face.shape % INSTRUMENTS.length];
    v.tone = +(Math.max(0, LOOK_COLORS.indexOf(look.face.color)) / (LOOK_COLORS.length - 1)).toFixed(2);
  }
  if (f('extremities') !== null) v.length = +(0.35 + f('extremities') * 0.6).toFixed(2); // share of a step
  if (f('hair') !== null) v.glide = +(-0.08 + f('hair') * 0.16).toFixed(3); // −8% (scoop up) … +8% (drop)
  if (f('object') !== null) v.wobble = +(f('object') * 0.03).toFixed(3); // vibrato depth, 0–3%
  return v;
}

/** Short description for the test panel. */
export function voiceText(v) {
  const len = v.length < 0.55 ? 'short' : v.length < 0.8 ? 'medium' : 'long';
  const glide = Math.abs(v.glide) < 0.02 ? 'no glide' : v.glide > 0 ? `drops ${Math.round(v.glide * 100)}%` : `scoops ${Math.round(-v.glide * 100)}%`;
  const wob = v.wobble ? `wobble ${(v.wobble * 100).toFixed(1)}%` : 'no wobble';
  return `${v.instrument} (tone ${v.tone}) · ${len} notes (${v.length}) · ${glide} · ${wob}`;
}
