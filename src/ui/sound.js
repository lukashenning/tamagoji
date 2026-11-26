// Plays a symbol's 5-note melody in the creature's voice (Web Audio).
// The voice (src/core/voice.js) sets one continuous synth recipe (overtones, metal, breath, chorus,
// struck/held, length, glide, wobble). The browser only allows sound after a user gesture, so the audio context starts on the first click.

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

/** The audio context (made on first use; the microphone's listening runs on it too). */
export function audioContext() {
  return audio();
}

let busyUntil = 0; // performance.now() until which this device is making sound (mic mode doesn't listen then)
/** Is this device playing (or just played) a melody? Mic mode ignores what it hears meanwhile. */
export const playingNow = () => performance.now() < busyUntil;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state !== 'running') ctx.resume(); // 'suspended', or 'interrupted' on iPhone
  return ctx;
}

/** Call from a click handler once, so later melodies (e.g. the creature's) are allowed to play. */
let unlocked = false;
export function unlockAudio() {
  const ac = audio();
  if (!ac || unlocked) return;
  // iPhone: sound only starts after the audio is switched on inside a touch; playing a tiny silent
  // sound right then makes sure it is really on
  const src = ac.createBufferSource();
  src.buffer = ac.createBuffer(1, 1, 22050);
  src.connect(ac.destination);
  src.start(0);
  if (ac.state === 'running') unlocked = true;
}

/**
 * Start the audio fresh: the old audio context is closed and everything built on it forgotten; the
 * next touch makes a new one. On iPhone, a context that was in the background (app or tab closed and
 * reopened, phone locked) often stays silent even when it says it is running, so we don't trust it.
 */
function resetAudio() {
  if (ctx) {
    try {
      ctx.close();
    } catch {}
  }
  ctx = null;
  noise = null;
  bus = null;
  dreamOut = null;
  unlocked = false;
}

// switch the audio on at the very first touch, anywhere (not only when a sign is sent); when the app
// comes back to the screen, start the audio fresh (switched on again at the next touch)
if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  let wasHidden = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) wasHidden = true;
    else if (wasHidden) {
      wasHidden = false;
      resetAudio();
    }
  });
  // reopened from the browser's back-forward memory (iPhone keeps closed tabs like that)
  window.addEventListener('pageshow', (e) => e.persisted && resetAudio());
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
// One recipe with continuous settings (src/core/voice.js), so the sound can change gradually:
// a tone with overtones (rich, hollow), an optional metallic shimmer (metal = fast pitch modulation),
// breath noise, a detuned second voice (chorus), and a loudness curve from held to struck (struck).

function playNote(ac, out, freq, t, step, v, volume) {
  const len = step * v.length; // how long the note is held
  const note = ac.createGain(); // the note's loudness curve
  note.connect(out);

  let lfo = null; // shared vibrato
  if (v.wobble > 0.001) {
    lfo = ac.createOscillator();
    lfo.frequency.value = 16;
    lfo.start(t);
  }
  const stops = [];
  const osc = (ratio, level) => {
    const f = freq * ratio;
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(f * (1 + v.glide), t); // glide into the note ("boop" when it drops)
    o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.03, len * 0.5));
    if (lfo) {
      const depth = ac.createGain();
      depth.gain.value = f * v.wobble;
      lfo.connect(depth).connect(o.frequency);
    }
    const g = ac.createGain();
    g.gain.value = level;
    o.connect(g).connect(note);
    o.start(t);
    stops.push(o);
    return o;
  };

  // overtones 1…6: "rich" lets more through, "hollow" removes the even ones (a hollow, chip-like sound)
  let energy = 0;
  let fundamental = null;
  for (let n = 1; n <= 6; n++) {
    let amp = n === 1 ? 1 : Math.pow(0.8 * v.rich, n - 1);
    if (n % 2 === 0) amp *= 1 - v.hollow;
    if (amp < 0.01) continue;
    const o = osc(n, amp);
    if (n === 1) fundamental = o;
    energy += amp * amp;
  }
  // metal: a fast modulation of the base tone at an uneven ratio gives a bell-like shimmer that fades
  if (v.metal > 0.02) {
    const mod = ac.createOscillator();
    mod.frequency.value = freq * 2.76;
    const idx = ac.createGain();
    // the shimmer is only in the strike: it fades within ~12 ms (D108), so the pitch is clear right after
    // (a long shimmer bends the pitch and makes melodies hard to recognise by ear and in mic mode)
    idx.gain.setValueAtTime(freq * 3 * v.metal, t);
    idx.gain.setTargetAtTime(0.0001, t, 0.012);
    mod.connect(idx).connect(fundamental.frequency);
    mod.start(t);
    stops.push(mod);
  }
  // chorus: a second, slightly detuned base tone (a fuller, beating sound)
  if (v.chorus > 0.02) {
    osc(1 + 0.006 * v.chorus, 0.7 * v.chorus);
    energy += (0.7 * v.chorus) ** 2;
  }
  // breath: a little band of noise around the tone
  if (v.breath > 0.02) {
    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 2;
    bp.Q.value = 1.5;
    const ng = ac.createGain();
    ng.gain.value = 0.6 * v.breath;
    n.connect(bp).connect(ng).connect(note);
    n.start(t);
    stops.push(n);
  }

  // loudness: held (organ, flute) … struck (marimba, bell, pluck: quick fade, rings a bit after)
  const peak = (0.28 * volume) / Math.sqrt(Math.max(1, energy));
  const attack = 0.003 + (1 - v.struck) * 0.02;
  const ring = 0.008 + v.struck * 0.05;
  note.gain.setValueAtTime(0.0001, t);
  note.gain.linearRampToValueAtTime(peak, t + attack);
  let stopAt;
  if (v.decay) {
    // a struck bar ringing out on its own (glockenspiel): one long natural fade
    note.gain.setTargetAtTime(0.0001, t + attack, v.decay);
    stopAt = t + attack + v.decay * 6;
  } else {
    note.gain.setTargetAtTime(peak * (1 - 0.85 * v.struck), t + attack, 0.03);
    note.gain.setTargetAtTime(0.0001, t + len, ring);
    stopAt = t + len + ring * 6;
  }
  stops.forEach((o) => o.stop(stopAt));
  if (lfo) lfo.stop(stopAt);
}

/**
 * Play the melody of `tok` in a voice (src/core/voice.js): the creature's signs in its voice, your
 * ✓ ✗ ❓ in PLAYER_VOICE an octave lower. `volume` 0…1, `octave` shifts by whole octaves.
 */
export function playMelody(tok, voice = DEFAULT_VOICE, volume = 1, octave = 0, { durationMs = MELODY_MS, reverb = false } = {}) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const step = durationMs / MELODY_STEPS / 1000;
  const t0 = ac.currentTime + 0.02;
  const out = reverb ? reverbBus(ac) : ac.destination;
  // busy while it sounds, plus its ring and echo in the room
  busyUntil = Math.max(busyUntil, performance.now() + 20 + durationMs + (reverb ? 1700 : 450));
  melodyFor(tok).forEach((freq, i) => {
    if (freq) playNote(ac, out, freq * Math.pow(2, octave), t0 + i * step, step, voice, volume);
  });
}

// ── dreams: a very quiet glockenspiel in a soft, roomy space ──
export const GLOCK_VOICE = { rich: 0.08, struck: 1, metal: 0.5, length: 1, hollow: 0, glide: 0, breath: 0, wobble: 0, chorus: 0, decay: 0.55 };

const DREAM_KEY = 'tamagoji.dreamSound';
let dreamOn = (() => {
  try {
    return localStorage.getItem(DREAM_KEY) !== 'off';
  } catch {
    return true;
  }
})();
export const dreamSoundOn = () => dreamOn;

let dreamOut = null; // the dream sounds' own channel: everything of the dreams (notes and reverb) runs through it
let dreaming = false;
const channelOpen = () => dreaming && dreamOn; // open only while it sleeps and you haven't muted the dreams

/** Open or cut off the dream channel at once (a 10 ms fade, no click), ringing notes and reverb too. */
function updateChannel() {
  if (dreamOut) dreamOut.gain.setTargetAtTime(channelOpen() ? 1 : 0, dreamOut.context.currentTime, 0.01);
}

/** Your mute / unmute choice (remembered on this device; it also holds for the next sleeps). */
export function setDreamSound(on) {
  dreamOn = on;
  try {
    localStorage.setItem(DREAM_KEY, on ? 'on' : 'off');
  } catch {}
  updateChannel();
}

/** It fell asleep (true) or woke up (false): waking cuts the dream channel off, falling asleep opens it (unless muted). */
export function setDreaming(asleep) {
  if (asleep === dreaming) return;
  dreaming = asleep;
  updateChannel();
}

let bus = null;
/**
 * A roomy space: the direct sound plus a short, soft reverb (a made-up ~1.6 s tail of fading noise,
 * high tones damped), so the notes sound roomy without lingering into each other.
 */
function reverbBus(ac) {
  if (bus) return bus;
  const len = Math.round(ac.sampleRate * 1.6);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  const conv = ac.createConvolver();
  conv.buffer = ir;
  const pre = ac.createDelay(0.2);
  pre.delayTime.value = 0.025;
  const soft = ac.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 3600;
  const wet = ac.createGain();
  wet.gain.value = 0.45;
  const dry = ac.createGain();
  dry.gain.value = 0.7;
  dreamOut = ac.createGain();
  dreamOut.gain.value = channelOpen() ? 1 : 0;
  dreamOut.connect(ac.destination);
  bus = ac.createGain();
  bus.connect(dry).connect(dreamOut);
  bus.connect(pre).connect(conv).connect(soft).connect(wet).connect(dreamOut);
  return bus;
}

/** A dream sign's melody: very quiet glockenspiel in a roomy space, stretched to last `durationMs`. */
export function playDreamMelody(tok, durationMs) {
  if (!channelOpen()) return;
  playMelody(tok, GLOCK_VOICE, 0.1, 0, { durationMs, reverb: true });
}
