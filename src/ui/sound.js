// Plays a symbol's 5-note melody in the creature's voice (Web Audio).
// The voice (src/core/voice.js) picks one of 8 small synth instruments plus articulation, glide and
// wobble. The browser only allows sound after a user gesture, so the audio context starts on the first click.

import { melodyFor, MELODY_MS, MELODY_STEPS } from '../core/melody.js';
import { DEFAULT_VOICE } from '../core/voice.js';

const KEY = 'tamagoji.sound';
let ctx = null;
let noise = null;
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();

export const soundOn = () => enabled;

export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from a click handler once, so later melodies (e.g. the creature's) are allowed to play. */
export function unlockAudio() {
  audio();
}

function noiseBuffer(ac) {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// ── one note ──
// Each instrument is a tiny recipe: which oscillators (partials) at which frequency ratios and levels,
// and how the loudness moves over time (percussive = strike and fade, sustained = hold and release).

function playNote(ac, out, freq, t, step, v, volume) {
  const len = step * v.length; // how long the note sounds
  const tone = v.tone;
  const note = ac.createGain(); // the note's loudness envelope
  note.connect(out);

  // a shared vibrato for all partials
  let lfo = null;
  if (v.wobble) {
    lfo = ac.createOscillator();
    lfo.frequency.value = 16;
    lfo.start(t);
  }
  const stops = [];
  // add an oscillator at `ratio` × the note's frequency
  const partial = (type, ratio, level, dest = note) => {
    const f = freq * ratio;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f * (1 + v.glide), t); // glide into the note ("boop" when it drops)
    osc.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.03, len * 0.5));
    if (lfo) {
      const depth = ac.createGain();
      depth.gain.value = f * v.wobble;
      lfo.connect(depth).connect(osc.frequency);
    }
    const g = ac.createGain();
    g.gain.value = level;
    osc.connect(g).connect(dest);
    osc.start(t);
    stops.push(osc);
    return { osc, g };
  };
  const perc = (peak, decay) => {
    note.gain.setValueAtTime(0.0001, t);
    note.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    note.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return decay;
  };
  const sustain = (peak, attack) => {
    note.gain.setValueAtTime(0.0001, t);
    note.gain.exponentialRampToValueAtTime(peak, t + attack);
    note.gain.setValueAtTime(peak, t + Math.max(attack, len - 0.015));
    note.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.01);
    return len + 0.01;
  };

  let dur;
  switch (v.instrument) {
    case 'chip': {
      // retro game console: square wave; tone adds a thin octave above
      partial('square', 1, 0.5);
      partial('square', 2, 0.25 * tone);
      dur = sustain(0.22 * volume, 0.003);
      break;
    }
    case 'bell': {
      // FM bell: a second oscillator wobbles the pitch very fast; tone picks how metallic (the ratio)
      const ratio = [1.41, 2.0, 2.76, 3.5][Math.min(3, Math.floor(tone * 4))];
      const car = partial('sine', 1, 1);
      const mod = ac.createOscillator();
      mod.frequency.value = freq * ratio;
      const idx = ac.createGain();
      idx.gain.setValueAtTime(freq * 2.5, t);
      idx.gain.exponentialRampToValueAtTime(freq * 0.05, t + len * 1.5);
      mod.connect(idx).connect(car.osc.frequency);
      mod.start(t);
      stops.push(mod);
      dur = perc(0.3 * volume, len * 1.8);
      break;
    }
    case 'marimba': {
      // wooden bar: a pure tone plus a short knock at ~4× (tone = how loud the knock is)
      partial('sine', 1, 1);
      const knock = partial('sine', 3.98, 0.15 + 0.5 * tone);
      knock.g.gain.setValueAtTime(0.15 + 0.5 * tone, t);
      knock.g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      dur = perc(0.45 * volume, len * 1.3);
      break;
    }
    case 'pluck': {
      // plucked string: bright sawtooth that quickly turns soft (tone = how bright the pluck is)
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(freq * (4 + 6 * tone), t);
      lp.frequency.exponentialRampToValueAtTime(freq * 1.2, t + len);
      lp.connect(note);
      partial('sawtooth', 1, 1, lp);
      dur = perc(0.3 * volume, len * 1.2);
      break;
    }
    case 'flute': {
      // airy tone: soft attack, a little breath noise (tone = how breathy)
      partial('sine', 1, 1);
      partial('sine', 2, 0.15);
      const n = ac.createBufferSource();
      n.buffer = noiseBuffer(ac);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * 2;
      bp.Q.value = 1.5;
      const ng = ac.createGain();
      ng.gain.value = 0.1 + 0.5 * tone;
      n.connect(bp).connect(ng).connect(note);
      n.start(t);
      stops.push(n);
      dur = sustain(0.32 * volume, 0.025);
      break;
    }
    case 'organ': {
      // drawbar organ: a few harmonics at once (tone = which mix of stops)
      partial('sine', 1, 1);
      partial('sine', 2, 0.6 * (1 - tone) + 0.2);
      partial('sine', 3, 0.5 * tone);
      partial('sine', 4, 0.3 * tone);
      dur = sustain(0.22 * volume, 0.006);
      break;
    }
    case 'brass': {
      // tiny horn: sawtooth that opens up at the start of each note (tone = how much it blares)
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(freq * 1.5, t);
      lp.frequency.exponentialRampToValueAtTime(freq * (3 + 5 * tone), t + 0.025);
      lp.frequency.exponentialRampToValueAtTime(freq * 2.5, t + len);
      lp.connect(note);
      partial('sawtooth', 1, 1, lp);
      partial('sawtooth', 1.005, 0.6, lp); // slightly detuned: fuller
      dur = sustain(0.2 * volume, 0.015);
      break;
    }
    default: {
      // whistle: a pure tone; tone adds a second, slightly detuned one that "beats"
      partial('sine', 1, 1);
      partial('sine', 1 + 0.004 * tone, 0.7 * tone);
      dur = sustain(0.3 * volume, 0.01);
    }
  }
  const stopAt = t + dur + 0.02;
  stops.forEach((o) => o.stop(stopAt));
  if (lfo) lfo.stop(stopAt);
}

/**
 * Play the melody of `tok` (only the creature's signs play) in the creature's voice (src/core/voice.js).
 * `volume` 0…1.
 */
export function playMelody(tok, voice = DEFAULT_VOICE, volume = 1) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const step = MELODY_MS / MELODY_STEPS / 1000;
  const t0 = ac.currentTime + 0.02;
  melodyFor(tok).forEach((freq, i) => {
    if (freq) playNote(ac, ac.destination, freq, t0 + i * step, step, voice, volume);
  });
}
