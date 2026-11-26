// Can the listener (src/core/hearing.js) recognise the melodies? Synthesises melodies the way the
// game's synth does (src/ui/sound.js: overtones, hollow, struck/held, metal shimmer in the strike, glide, chorus,
// breath), in many creature voices, plays them into a simulated room (echo) with background noise,
// and feeds the sound to the listener in ~10 ms steps, like the browser does. Run with:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/hearing.js

import { ALL } from '../src/core/emojiIndex.js';
import { melodyFor, MELODY_MS, MELODY_STEPS, PLAYER_OCTAVE } from '../src/core/melody.js';
import { voiceFor, ARCHETYPES, DEFAULT_VOICE, PLAYER_VOICE } from '../src/core/voice.js';
import { MelodyListener } from '../src/core/hearing.js';
import { mulberry32 } from '../src/core/rng.js';
import { YES, NO, ASK } from '../src/core/tokens.js';

const log = globalThis.print || console.log;
const SR = 24000; // enough for the melodies' notes (up to ~2.9 kHz) and their main overtones
const SIM = globalThis.SIM || {};
const TRIALS = SIM.trials || 160;

/** Synthesise one melody (like src/ui/sound.js playNote) into `out` starting at sample `at`. */
function synth(out, at, tok, voice, rng, { octave = 0, stepMs = MELODY_MS / MELODY_STEPS } = {}) {
  const step = stepMs / 1000;
  melodyFor(tok).forEach((f0, i) => {
    if (!f0) return;
    const f = f0 * Math.pow(2, octave);
    const t0 = at + Math.round(i * step * SR);
    const len = step * voice.length;
    const attack = 0.003 + (1 - voice.struck) * 0.02;
    const ring = 0.008 + voice.struck * 0.05;
    const hold = 1 - 0.85 * voice.struck;
    const total = Math.round((len + ring * 6) * SR);
    const harmonics = [];
    for (let n = 1; n <= 6; n++) {
      let amp = n === 1 ? 1 : Math.pow(0.8 * voice.rich, n - 1);
      if (n % 2 === 0) amp *= 1 - voice.hollow;
      if (amp >= 0.01 && n * f < SR / 2) harmonics.push([n, amp]);
    }
    const energy = Math.sqrt(harmonics.reduce((a, [, x]) => a + x * x, 0) + (voice.chorus > 0.02 ? (0.7 * voice.chorus) ** 2 : 0));
    let phase = 0;
    let phase2 = 0;
    let mphase = 0;
    for (let k = 0; k < total && t0 + k < out.length; k++) {
      const t = k / SR;
      // loudness curve: attack, (struck: quick drop to the hold level), release after len
      let env = t < attack ? t / attack : hold + (1 - hold) * Math.exp(-(t - attack) / 0.03);
      if (t > len) env *= Math.exp(-(t - len) / ring);
      const glide = t < Math.min(0.03, len * 0.5) ? 1 + voice.glide * (1 - t / Math.min(0.03, len * 0.5)) : 1;
      const fNow = f * glide * (1 + voice.wobble * Math.sin(2 * Math.PI * 16 * t));
      // metal: fast modulation of the base tone (bell shimmer), fading
      const idx = voice.metal > 0.02 ? 3 * voice.metal * Math.exp(-t / (SIM.metalFade || 0.012)) : 0;
      mphase += (2 * Math.PI * f * 2.76) / SR;
      phase += (2 * Math.PI * fNow) / SR;
      phase2 += (2 * Math.PI * fNow * (1 + 0.006 * voice.chorus)) / SR;
      let v = 0;
      for (const [n, amp] of harmonics) v += amp * Math.sin(n * phase + (n === 1 ? idx * Math.sin(mphase) : 0));
      if (voice.chorus > 0.02) v += 0.7 * voice.chorus * Math.sin(phase2);
      if (voice.breath > 0.02) v += 0.3 * voice.breath * (rng() * 2 - 1);
      out[t0 + k] += (0.28 * env * v) / energy;
    }
  });
}

/** A small room: a few delayed, softened echoes that fade (a Schroeder-style reverb), mixed in. */
function room(x, wet, seconds = 0.45) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => Math.round(d * SR));
  const out = new Float32Array(x.length);
  for (const d of combs) {
    const g = Math.pow(0.001, d / SR / seconds);
    const buf = new Float32Array(x.length);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const fb = i >= d ? buf[i - d] : 0;
      lp = 0.7 * fb + 0.3 * lp; // walls swallow high tones
      buf[i] = x[i] + g * lp;
      out[i] += buf[i] / combs.length;
    }
  }
  for (let i = 0; i < x.length; i++) out[i] = (1 - wet) * x[i] + wet * out[i];
  return out;
}

function noise(x, snrDb, rng) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const sig = Math.sqrt(s / x.length) || 1e-6;
  const amp = sig / Math.pow(10, snrDb / 20);
  let brown = 0;
  for (let i = 0; i < x.length; i++) {
    brown = 0.97 * brown + 0.03 * (rng() * 2 - 1) * 4; // more low rumble than hiss, like a room
    x[i] += amp * (0.6 * brown + 0.4 * (rng() * 2 - 1));
  }
}

/** Play one melody into a room and let the listener hear it; returns the signs it reported. */
function trial(tok, voice, rng, cond) {
  const before = 0.25 + rng() * 0.3;
  const x = new Float32Array(Math.round((before + MELODY_MS / 1000 + 0.7) * SR));
  synth(x, Math.round(before * SR), tok, voice, rng, cond);
  const y = cond.wet ? room(x, cond.wet) : x;
  if (cond.snr !== undefined) noise(y, cond.snr, rng);
  const heard = [];
  const L = new MelodyListener({ sampleRate: SR, onSign: (s) => heard.push(s) });
  const N = 512; // ~21 ms at 24 kHz (in the browser: 1024 at 48 kHz)
  const hop = 256; // ~10 ms
  for (let i = N; i <= y.length; i += hop) L.feed(((i - N / 2) / SR) * 1000, y.subarray(i - N, i));
  return heard;
}

const voices = [
  ['default', DEFAULT_VOICE],
  ...Object.entries(ARCHETYPES).map(([n, a]) => [n, { ...DEFAULT_VOICE, ...a }]),
  ['random creatures', null],
];
const conditions = [
  { label: 'clean', cond: {} },
  { label: 'room echo', cond: { wet: 0.35 } },
  { label: 'noise (20 dB)', cond: { snr: 20 } },
  { label: 'echo + noise (15 dB)', cond: { wet: 0.35, snr: 15 } },
  { label: 'strong echo + noise (10 dB)', cond: { wet: 0.55, snr: 10 } },
];

const rng = mulberry32(7);
const toks = ALL.slice();
const t0 = Date.now();
log(`${TRIALS} random signs per voice and condition · right / wrong sign / nothing heard\n`);
log(`voice              ${conditions.map((c) => c.label.padEnd(28)).join('')}`);
for (const [name, fixed] of voices) {
  const cells = [];
  for (const { cond } of conditions) {
    let right = 0;
    let wrong = 0;
    for (let k = 0; k < TRIALS; k++) {
      const tok = toks[Math.floor(rng() * toks.length)];
      const voice = fixed || voiceFor(Array.from({ length: 7 }, () => ({ tok: toks[Math.floor(rng() * toks.length)], uses: 1 + Math.floor(rng() * 20) })));
      const heard = trial(tok, voice, rng, cond);
      if (heard.length === 1 && heard[0] === tok) right++;
      else if (heard.some((s) => s !== tok)) wrong++;
    }
    cells.push(`${Math.round((100 * right) / TRIALS)}% / ${Math.round((100 * wrong) / TRIALS)}% / ${Math.round((100 * (TRIALS - right - wrong)) / TRIALS)}%`.padEnd(28));
  }
  log(`${name.padEnd(19)}${cells.join('')}`);
}
// your ✓ ✗ ❓ (an octave lower, your own sound)
let ok = 0;
let n = 0;
for (const tok of [YES, NO, ASK])
  for (const { cond } of conditions) {
    n++;
    const heard = trial(tok, PLAYER_VOICE, rng, { ...cond, octave: PLAYER_OCTAVE });
    if (heard.length === 1 && heard[0] === tok) ok++;
  }
log(`\nyour ✓ ✗ ❓ (octave lower, your sound), all conditions: ${ok} of ${n} heard right`);
log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
