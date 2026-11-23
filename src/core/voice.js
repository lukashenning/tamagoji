// The creature's voice: how its melodies sound. Derived from the continuous traits of its appearance
// basis (mind.look), so look and sound change together, and gradually: a small change in its patterns
// moves the voice a little, a big change a lot. The synth is one recipe with continuous settings
// (src/ui/sound.js); familiar instruments are just regions of that space (see ARCHETYPES).
//
//   face        shape → rich (pure tone … many overtones)   size → struck (held … struck and ringing)
//               texture → metal (wood … bell-like)
//   extremities shape → note length (short … long)          size → hollow (fewer even overtones: "chip")
//   hair        shape → glide into each note (scoop up … drop down)   size → breath (airy noise)
//   object      shape → wobble (vibrato)                    size → chorus (a second, detuned voice)
//
// A slot's influence fades in with its presence (it unlocks with complexity); until then it keeps the default.

export const DEFAULT_VOICE = { rich: 0.2, struck: 0.7, metal: 0.1, length: 0.8, hollow: 0, glide: 0.06, breath: 0, wobble: 0, chorus: 0 };

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

const MAP = {
  face: { shape: ['rich', 0, 1], size: ['struck', 0, 1], texture: ['metal', 0, 1] },
  extremities: { shape: ['length', 0.35, 0.95], size: ['hollow', 0, 1] },
  hair: { shape: ['glide', -0.08, 0.08], size: ['breath', 0, 0.8] },
  object: { shape: ['wobble', 0, 0.03], size: ['chorus', 0, 1] },
};

/** @param {object} look mind.look (continuous traits per slot) */
export function voiceFor(look = {}) {
  const v = { ...DEFAULT_VOICE };
  for (const [slot, traits] of Object.entries(MAP)) {
    const x = look[slot];
    if (!x) continue;
    const presence = x.presence ?? 1;
    for (const [trait, [key, lo, hi]] of Object.entries(traits)) {
      const raw = lo + (hi - lo) * x[trait];
      v[key] = +(v[key] + presence * (raw - v[key])).toFixed(3);
    }
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
