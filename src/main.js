// App: the time loop, player input, and the game view.
// The history is the creature: every event is appended to it and observed by the mind.

import { Mind, wakeChance } from './core/mind.js';
import { ENGINE_VERSION } from './core/params.js';
import { SLEEP, WAKE, ASK, ELEMENTALS, isContent } from './core/tokens.js';
import { recentEmojis, hourlySet, hourLabel } from './core/keyboard.js';
import { voiceFor, ARCHETYPES } from './core/voice.js';
import { buildPalette } from './ui/palette.js';
import { buildPanel } from './ui/panel.js';
import { playMelody, unlockAudio, setSound, soundOn } from './ui/sound.js';
import { newCreature, loadCreature, saveCreature, loadParams, saveParams, exportFile, importFile } from './ui/store.js';

// ── clock (with fast-forward for testing) ──
class Clock {
  constructor(offset = 0) {
    this.offset = offset;
    this.warp = 1;
    this.lastReal = Date.now();
  }
  tick() {
    const r = Date.now();
    this.offset += (r - this.lastReal) * (this.warp - 1);
    this.lastReal = r;
  }
  now() {
    return Date.now() + this.offset;
  }
}

const rand = ([a, b]) => a + Math.random() * (b - a);

const s = {
  engine: ENGINE_VERSION,
  params: loadParams(),
  save: null,
  mind: null,
  clock: null,
  why: null,
  replyAt: null,
  wakeAt: null,
  dreamShown: -1,
  tiredUntil: 0, // real time until which input is blocked ("Zu müde...")
  saveInfo: { bytes: 0, pruned: 0 },
};

function load(save) {
  s.save = save;
  s.clock = new Clock(save.clockOffset || 0);
  s.mind = Mind.replay(save, s.params);
  s.why = null;
  s.replyAt = s.wakeAt = null;
  s.dreamShown = -1;
  s.tiredUntil = 0;
  persist();
}

function persist() {
  s.save.clockOffset = s.clock.offset;
  const info = saveCreature(s.save, s.params.maxSaveMB);
  s.saveInfo = info;
  if (info.pruned) s.mind = Mind.replay(s.save, s.params); // the oldest history was dropped: rebuild
}

function append(entry) {
  s.save.history.push(entry);
  s.mind.observe(entry);
  if (entry.tok === SLEEP) {
    s.dreamShown = -1;
    s.wakeAt = null;
  }
  if (entry.tok === WAKE) {
    s.clock.warp = 1; // back to normal time when it wakes up
    s.wakeAt = null;
  }
  persist();
}

// ── player input ──
function playerSend(tok) {
  unlockAudio();
  const now = s.clock.now();
  const m = s.mind;
  if (!m.awake) {
    // asleep: a sign only sometimes wakes it. Never below 10% energy, 70% at 70% energy, always when full.
    if (Date.now() < s.tiredUntil) return;
    if (Math.random() >= wakeChance(m.energyAt(now) / m.capacity, s.params)) {
      s.tiredUntil = Date.now() + s.params.tiredBlockSec * 1000; // "Zu müde..."
      render();
      return;
    }
    append({ t: now, who: 'S', tok: WAKE, m: 'manual' });
  } else if (m.turn !== 'P') return;
  append({ t: s.clock.now(), who: 'P', tok });
  s.replyAt = null;
  render();
}

// ── time loop ──
function tick() {
  s.clock.tick();
  const now = s.clock.now();
  const m = s.mind;
  const idleMs = m.idleSleepMs(); // shorter the more tired; never at full energy

  if (m.awake) {
    if (now - m.lastEntryT > idleMs) {
      // left alone (also when the app was closed): it fell asleep back then
      append({ t: m.lastEntryT + idleMs, who: 'S', tok: SLEEP });
    } else if (m.turn === 'C') {
      if (s.replyAt === null) s.replyAt = now + rand(s.params.replyDelaySec) * 1000;
      if (now >= s.replyAt) {
        s.replyAt = null;
        const d = m.decide(Math.random, now);
        s.why = d.why;
        append({ t: now, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
        if (d.tok !== SLEEP) playMelody(d.tok, voiceFor(m.seats));
      }
    }
  } else if (m.sleep) {
    // dream display: catch up quickly if time passed while away
    const target = m.dreamIndex(now);
    if (s.dreamShown < target) s.dreamShown = Math.min(target, s.dreamShown + Math.max(1, Math.ceil((target - s.dreamShown) / 30)));
    // rested (energy full) → wakes up by itself a few real seconds later while the app is open
    if (m.isRested(now) && s.dreamShown >= m.dreamIndex(now)) {
      if (s.wakeAt === null) s.wakeAt = Date.now() + rand(s.params.wakeDelaySec) * 1000;
      if (Date.now() >= s.wakeAt) append({ t: now, who: 'S', tok: WAKE });
    }
  }
  render();
}

// ── game view ──
const el = {
  creature: document.getElementById('creature'),
  bubble: document.getElementById('bubble'),
  bubbleEmoji: document.getElementById('bubble-emoji'),
  bubbleMark: document.getElementById('bubble-mark'),
  dreams: document.getElementById('dreams'),
  label: document.getElementById('label'),
  you: document.getElementById('you'),
};

function lastEntry(who) {
  const h = s.save.history;
  for (let i = h.length - 1; i >= 0; i--) {
    const e = h[i];
    if (e.tok === SLEEP || e.tok === WAKE) return null; // only within the current session
    if (e.who === who) return e;
  }
  return null;
}

// dreaming: each new dream emoji rises straight up from its head, growing as it goes.
// Rising speed follows the pace of the dreams: the shorter the time between dream emojis, the faster
// all of them rise (and they slow down again when the dreams come slower), so about 3 are visible.
let dreamSpawned = -1;
let lastSpawn = 0;
let dreamGap = 3000; // smoothed real ms between dream emojis
const flying = []; // { node, start (progress clock at spawn) }
const RISE_PX = 200;

// a shared "progress clock": how far (in whole rises) everything has moved. Its speed follows the
// dream pace, so all dream emojis speed up or slow down together, at any frame rate.
let progress = 0;
let progressAt = performance.now();
function advance() {
  const now = performance.now();
  const gap = Math.max(dreamGap, Date.now() - lastSpawn); // no new dream for a while → slower
  const riseMs = Math.min(30000, Math.max(1500, 3 * gap)); // about 3 visible at a time
  progress += Math.min(3000, now - progressAt) / riseMs;
  progressAt = now;
}

function showDream(m) {
  if (s.dreamShown < dreamSpawned) dreamSpawned = -1; // a new sleep
  if (s.dreamShown <= dreamSpawned || Date.now() - lastSpawn < 900) return; // catching up: not too dense
  const tok = m.sleep.dream[s.dreamShown];
  dreamSpawned = s.dreamShown;
  if (!tok) return;
  advance();
  const t = Date.now();
  if (lastSpawn && t - lastSpawn < 60000) dreamGap = 0.6 * dreamGap + 0.4 * (t - lastSpawn);
  lastSpawn = t;
  const node = document.createElement('span');
  node.className = 'dream-emoji';
  node.textContent = tok;
  el.dreams.append(node);
  flying.push({ node, start: progress });
}

function clearDreams() {
  flying.length = 0;
  el.dreams.replaceChildren();
}

function animateDreams() {
  advance();
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    const p = progress - f.start; // 0…1 of the way up
    if (p >= 1) {
      f.node.remove();
      flying.splice(i, 1);
      continue;
    }
    f.node.style.transform = `translateY(${(-RISE_PX * p).toFixed(1)}px) scale(${(0.7 + 1.2 * p).toFixed(3)})`;
    f.node.style.opacity = String(Math.min(1, p / 0.1) * (p > 0.7 ? (1 - p) / 0.3 : 1) * 0.75);
  }
  requestAnimationFrame(animateDreams);
}
requestAnimationFrame(animateDreams);

function render() {
  const m = s.mind;
  const now = s.clock.now();
  el.creature.classList.toggle('asleep', !m.awake);

  if (!m.awake && m.sleep) {
    el.bubble.className = 'bubble empty';
    el.bubbleEmoji.textContent = '';
    el.bubbleMark.textContent = '';
    el.label.textContent = 'sleeping';
    showDream(m);
    el.you.textContent = '';
  } else {
    if (flying.length) clearDreams(); // woke up: dreams vanish
    const c = lastEntry('C');
    const p = lastEntry('P');
    el.bubble.className = 'bubble' + (m.turn === 'C' ? ' faded' : '') + (c ? '' : ' empty');
    el.bubbleEmoji.textContent = c ? c.tok : '';
    el.bubbleMark.textContent = '';
    el.label.textContent = m.label();
    el.you.textContent = p ? p.tok : '';
  }

  // keyboard: "Zuletzt" (pinned signs + most recent emojis) | the hour's random set ("16 Uhr")
  // too tired: every key shows 💤, draining like a bar (bottom row from the right, then up) until the block ends
  const tired = Date.now() < s.tiredUntil;
  palette.setTitles(tired ? 'Zu müde...' : 'Zuletzt', hourLabel(now));
  if (tired) palette.setSleepy(1 - (s.tiredUntil - Date.now()) / (s.params.tiredBlockSec * 1000));
  else {
    palette.setRecent(ELEMENTALS, recentEmojis(s.save.history));
    palette.setRandom(hourlySet(s.save.seed, now));
  }
  palette.setLocked(tired || (m.awake && m.turn !== 'P'));
}

// ── panel handlers ──
let replayTimer = null;
const handlers = {
  setWarp(w) {
    s.clock.tick();
    s.clock.warp = w;
  },
  skip(ms) {
    s.clock.offset += ms;
    persist();
  },
  sleepNow() {
    if (s.mind.awake) append({ t: s.clock.now(), who: 'S', tok: SLEEP });
  },
  wakeNow() {
    if (!s.mind.awake) append({ t: s.clock.now(), who: 'S', tok: WAKE, m: 'manual' });
  },
  exportCreature() {
    exportFile(s.save);
  },
  // no browser popups (confirm/alert); reset happens right away (user's choice).
  async importCreature(file) {
    try {
      load(await importFile(file));
      return 'imported';
    } catch (e) {
      return 'could not import: ' + e.message;
    }
  },
  reset() {
    load(newCreature(Date.now(), s.params));
  },
  toggleSound() {
    unlockAudio();
    setSound(!soundOn());
    return soundOn();
  },
  // listen: its last sign (or ❓) in its voice, or in each archetype voice one after another
  hearVoice() {
    unlockAudio();
    playMelody(lastEntry('C')?.tok || ASK, voiceFor(s.mind.seats));
  },
  hearInstruments(show) {
    unlockAudio();
    const tok = lastEntry('C')?.tok || ASK;
    const voice = voiceFor(s.mind.seats);
    Object.entries(ARCHETYPES).forEach(([name, a], i) =>
      setTimeout(() => {
        show(`${tok} as ${name}`);
        playMelody(tok, { ...voice, ...a });
      }, i * 800),
    );
  },
  setParam(key, value) {
    handlers.setParams({ ...s.params, [key]: value });
  },
  setParams(params) {
    s.params = params;
    saveParams(params);
    clearTimeout(replayTimer);
    // re-run: rebuild the mind from the same history with the new settings
    replayTimer = setTimeout(() => (s.mind = Mind.replay(s.save, s.params)), 250);
  },
};

// ── start ──
const palette = buildPalette(document.getElementById('palette'), { onPick: playerSend });
const updatePanel = buildPanel(document.getElementById('panel'), handlers);
load(loadCreature() || newCreature(Date.now(), s.params));
setInterval(tick, 100);
setInterval(() => updatePanel(s), 400);
tick();
updatePanel(s);
