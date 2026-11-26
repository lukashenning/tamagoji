// Hearing melodies (mic mode, D108): turns microphone sound into signs. Pure JavaScript on plain
// sample arrays, so the same code runs in the browser and in the offline test (tests/hearing.js).
//
// 1. Pitch: every ~10 ms the last ~21 ms of sound are analysed with YIN (a standard pitch method: it
//    finds how far the wave has to be shifted to match itself, which is the length of one vibration).
//    The frequency is snapped to the nearest semitone; it counts only if it lies close to one of the
//    pitches the melodies use (so voices, timbre and loudness don't matter, only the pitch).
// 2. Melody: when sound with a clear pitch starts after a quiet moment, that is the start of a melody.
//    The next 5 steps (100 ms each) are read: each step's note is the pitch heard most often in it, or
//    a pause if there was hardly anything. If the 5 steps are exactly some sign's melody, it is heard.
//    Melodies differ in at least 2 steps (src/core/melody.js), so one misheard note gives no sign at all
//    rather than a wrong one.

import { MELODY_STEPS, MELODY_MS, melodyPitches, signForMelody, midiToHz } from './melody.js';

const STEP_MS = MELODY_MS / MELODY_STEPS;

/** YIN pitch of one frame: { hz, clarity 0…1 } or null. */
export function yin(frame, sampleRate, minHz = 400, maxHz = 3600, threshold = 0.2) {
  const n = frame.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / minHz));
  const w = n - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < w; j++) {
      const diff = frame[j] - frame[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // cumulative mean normalised difference (over all shifts from 1, also the ones too short to be a
  // melody pitch, or the highest notes would be measured an octave too low)
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // octave check: rich tones (strong overtones) can match at twice the real period; if half the
  // period matches well too, the real pitch is an octave higher
  const half = tau / 2;
  if (half >= tauMin) {
    const lo = Math.floor(half);
    const dh = d[lo] + (d[lo + 1] - d[lo]) * (half - lo);
    if (dh < threshold * 1.6) {
      tau = Math.round(half);
      while (tau - 1 >= tauMin && d[tau - 1] < d[tau]) tau--;
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
    }
  }
  // parabolic interpolation for a precise period
  let better = tau;
  if (tau > tauMin && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const den = a + c - 2 * b;
    if (den > 0) better = tau + (a - c) / (2 * den);
  }
  return { hz: sampleRate / better, clarity: 1 - d[tau] };
}

const rms = (frame) => {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / frame.length);
};

/**
 * Listens to a stream of sound frames and reports the signs whose melodies it hears.
 * Feed it frames (Float32Array, ~1024 samples, every ~10 ms) with the time (ms) of each frame's middle.
 */
export class MelodyListener {
  constructor({ sampleRate, onSign = () => {}, onFrame = () => {} }) {
    this.sampleRate = sampleRate;
    this.onSign = onSign;
    this.onFrame = onFrame; // (info) for the visualiser
    const pitches = melodyPitches();
    this.pitches = new Set(pitches);
    this.minHz = midiToHz(pitches[0]) * 0.9;
    this.maxHz = midiToHz(pitches[pitches.length - 1]) * 1.1;
    this.floor = 0.002; // background noise level (adapts)
    this.frames = []; // { t, level, midi } of the melody being heard
    this.start = null; // time its first step started
    this.quietSince = 0;
  }

  /** The pitch of one frame as a melody note (MIDI) or null, with its loudness. */
  hear(frame) {
    const level = rms(frame);
    let midi = null;
    let exact = null;
    if (level > this.floor * 3) {
      const p = yin(frame, this.sampleRate, this.minHz, this.maxHz);
      if (p && p.clarity > 0.7) {
        exact = 69 + 12 * Math.log2(p.hz / 440);
        const m = Math.round(exact);
        if (Math.abs(exact - m) < 0.4 && this.pitches.has(m)) midi = m;
      }
    }
    return { level, midi, exact };
  }

  /** Forget what is being heard (e.g. while it plays itself). */
  reset() {
    this.frames = [];
    this.start = null;
  }

  feed(t, frame) {
    const { level, midi, exact } = this.hear(frame);
    this.onFrame({ t, level, midi, listening: this.start !== null });
    const loud = level > Math.max(this.floor * 6, 0.004);
    // the background noise level follows the quiet moments slowly
    if (!loud) this.floor = Math.max(0.0005, this.floor * 0.995 + Math.min(level, this.floor * 2) * 0.005);
    if (this.start === null) {
      if (!loud) {
        if (!this.quietSince) this.quietSince = t;
        return;
      }
      // sound rising after a quiet moment: a melody may start
      if (this.quietSince && t - this.quietSince >= 60) {
        this.start = t - 12; // the frame's middle is a little after the sound's start
        this.frames = [];
      }
      this.quietSince = 0;
      if (this.start === null) return;
    }
    this.frames.push({ t, level, midi, exact });
    if (t >= this.start + MELODY_MS + 20) {
      const sign = this.decode();
      this.reset();
      this.quietSince = 0; // it needs a quiet moment again before the next melody
      if (sign) this.onSign(sign);
    }
  }

  /** The 5 steps of what was heard, tried at a few small shifts of the start; a sign or null. */
  decode() {
    for (const shift of [0, -15, 15, -30, 30]) {
      const sign = signForMelody(this.steps(this.start + shift));
      if (sign) return sign;
    }
    return null;
  }

  steps(t0) {
    const notes = [];
    let first = 0;
    for (let i = 0; i < MELODY_STEPS; i++) {
      // loudness from the whole step; the pitch from its later part, after a note's start has settled
      // (glide into the note, the shimmer of bell-like voices)
      const inStep = this.frames.filter((f) => f.t >= t0 + i * STEP_MS + 5 && f.t <= t0 + i * STEP_MS + STEP_MS * 0.8);
      const late = inStep.filter((f) => f.t >= t0 + i * STEP_MS + STEP_MS * 0.3);
      let peak = 0;
      for (const f of inStep) peak = Math.max(peak, f.level);
      if (i === 0) first = peak;
      const pitched = (late.length ? late : inStep).filter((f) => f.exact !== null);
      const ex = pitched.map((f) => f.exact).sort((a, b) => a - b);
      const median = ex.length ? ex[Math.floor(ex.length / 2)] : null;
      const m = median === null ? null : Math.round(median);
      // unsteady pitch within the step (e.g. a strong bell shimmer): not trusted, the melody is dropped
      const spread = ex.length >= 3 ? ex[Math.floor(ex.length * 0.8)] - ex[Math.floor(ex.length * 0.2)] : 0;
      if (spread > 1.0) return Array(MELODY_STEPS).fill(undefined);
      // a pause: hardly any clear pitch, or only the fading echo of the step before
      const pause = !inStep.length || m === null || !this.pitches.has(m) || Math.abs(median - m) > 0.45 || pitched.length < Math.max(1, (late.length || inStep.length) * 0.34) || peak < first * 0.3;
      notes.push(pause ? null : m);
    }
    return notes;
  }
}
