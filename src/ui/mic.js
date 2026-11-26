// Mic mode (D108): the keyboard area shows a small live picture of the microphone, and melodies heard
// through it become signs, entered exactly like keyboard input. Two devices in mic mode can talk to
// each other. While this device plays a melody, what the microphone hears is ignored.
//
// The microphone needs a secure page (https, or localhost): on the live site it works; on the local
// network address (http://192.168.…) browsers don't allow it.

import { MelodyListener } from '../core/hearing.js';
import { audioContext, playingNow } from './sound.js';

const WINDOW = 1024; // samples analysed at a time (~21 ms at 48 kHz)
const HOP = 512; // analysed every this many samples (~10 ms)
const HISTORY_MS = 3000; // the picture shows the last 3 seconds

export function buildMic(panel, { onSign, onExit }) {
  panel.innerHTML = `
    <label class="mic-switch"><input type="checkbox" checked><span class="track"><span class="knob"></span></span><span class="mic-label">Mic</span></label>
    <canvas class="mic-view"></canvas>
    <div class="mic-note"></div>
    <div class="mic-heard"></div>`;
  const toggle = panel.querySelector('input');
  const canvas = panel.querySelector('canvas');
  const note = panel.querySelector('.mic-note');
  const heardEl = panel.querySelector('.mic-heard');
  toggle.addEventListener('change', () => !toggle.checked && onExit());

  let stream = null;
  let source = null;
  let proc = null;
  let sink = null;
  let listener = null;
  let samples = 0;
  const ring = new Float32Array(WINDOW);
  let filled = 0;
  let pos = 0;
  let sinceHop = 0;
  const trace = []; // { t, level, midi } for the picture
  let raf = 0;

  async function start() {
    toggle.checked = true;
    note.textContent = '';
    heardEl.textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      note.textContent = 'No microphone here (it needs the https site).';
      return false;
    }
    try {
      // iPhone: keep playing through the loudspeaker while the microphone is on
      if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
      // the browser's speech processing (noise suppression, automatic volume) would bend the tones
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      note.textContent = 'The microphone is not allowed.';
      return false;
    }
    const ac = audioContext();
    const sr = ac.sampleRate;
    listener = new MelodyListener({
      sampleRate: sr,
      onSign: (tok) => {
        heardEl.textContent = tok;
        heardEl.classList.remove('show');
        heardEl.getBoundingClientRect();
        heardEl.classList.add('show');
        onSign(tok);
      },
      onFrame: (f) => {
        trace.push(f);
        while (trace.length && trace[0].t < f.t - HISTORY_MS) trace.shift();
      },
    });
    source = ac.createMediaStreamSource(stream);
    proc = ac.createScriptProcessor(1024, 1, 1);
    sink = ac.createGain();
    sink.gain.value = 0; // the processor has to be connected to run; nothing is played
    proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const busy = playingNow();
      if (busy) listener.reset(); // it doesn't listen to itself
      for (let i = 0; i < input.length; i++) {
        ring[pos] = input[i]; // a circular buffer of the last WINDOW samples
        pos = (pos + 1) % WINDOW;
        samples++;
        if (filled < WINDOW) filled++;
        if (++sinceHop >= HOP && filled === WINDOW) {
          sinceHop = 0;
          const t = ((samples - WINDOW / 2) / sr) * 1000;
          if (busy) trace.push({ t, level: 0, midi: null, busy: true });
          else {
            const frame = new Float32Array(WINDOW);
            for (let k = 0; k < WINDOW; k++) frame[k] = ring[(pos + k) % WINDOW];
            listener.feed(t, frame);
          }
        }
      }
    };
    source.connect(proc);
    proc.connect(sink).connect(ac.destination);
    draw();
    return true;
  }

  function stop() {
    cancelAnimationFrame(raf);
    proc?.disconnect();
    source?.disconnect();
    sink?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    stream = source = proc = sink = listener = null;
    trace.length = 0;
    if (navigator.audioSession) navigator.audioSession.type = 'auto';
  }

  // the picture: the loudness as a soft line over the last seconds, the heard notes as dots
  function draw() {
    raf = requestAnimationFrame(draw);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!trace.length) return;
    const now = trace[trace.length - 1].t;
    const x = (t) => w - ((now - t) / HISTORY_MS) * w;
    const style = getComputedStyle(canvas);
    g.strokeStyle = style.getPropertyValue('--mic-line') || '#b8b4bc';
    g.lineWidth = 1.5;
    g.beginPath();
    trace.forEach((f, i) => {
      const y = h * 0.62 - Math.min(1, Math.sqrt(f.level) * 4) * h * 0.5;
      if (i) g.lineTo(x(f.t), y);
      else g.moveTo(x(f.t), y);
    });
    g.stroke();
    g.fillStyle = style.getPropertyValue('--mic-dot') || '#b5838d';
    for (const f of trace)
      if (f.midi !== null) {
        const y = h * 0.92 - ((f.midi - 70) / 34) * h * 0.84;
        g.beginPath();
        g.arc(x(f.t), y, 2.2, 0, 2 * Math.PI);
        g.fill();
      }
  }

  return { start, stop };
}
