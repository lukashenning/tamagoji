// App: the time loop, player input, and the game view.
// The history is the creature: every event is appended to it and observed by the mind.

import { Mind, wakeChance } from './core/mind.js';
import { ENGINE_VERSION } from './core/params.js';
import { SLEEP, WAKE, YES, NO, ASK, ELEMENTALS } from './core/tokens.js';
import { recentEmojis, hourlySet, hourLabel } from './core/keyboard.js';
import { voiceFor, ARCHETYPES, PLAYER_VOICE } from './core/voice.js';
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
  tired: null, // "Zu müde...": the slots (0–31) that still show a 💤 to tap away, else null
  saveInfo: { bytes: 0, pruned: 0 },
};

function load(save) {
  s.save = save;
  s.clock = new Clock(save.clockOffset || 0);
  s.mind = Mind.replay(save, s.params);
  s.why = null;
  s.replyAt = s.wakeAt = null;
  s.dreamShown = -1;
  s.tired = null;
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
    if (s.tired) return;
    if (Math.random() >= wakeChance(m.energyAt(now) / m.capacity, s.params)) {
      // "Zu müde...": a few 💤 strewn over the keyboard; tap them all away to get the keys back
      const slots = [...Array(32).keys()];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      s.tired = new Set(slots.slice(0, s.params.tiredZz));
      render();
      return;
    }
    append({ t: now, who: 'S', tok: WAKE, m: 'manual' });
  } else if (m.turn !== 'P') return;
  append({ t: s.clock.now(), who: 'P', tok });
  if (ELEMENTALS.includes(tok)) {
    playMelody(tok, PLAYER_VOICE, 0.8, -1); // your ✓ ✗ ❓: an octave lower, in your own sound
    flash(tok);
  }
  s.replyAt = null;
  render();
}

// a soft, quick flash of the background: ✓ green, ✗ red, ❓ white
const FLASH = { [YES]: ['#7fd99a', 0.11], [NO]: ['#f08a8a', 0.09], [ASK]: ['#ffffff', 0.45] };
function flash(tok) {
  const node = document.getElementById('flash');
  const [color, peak] = FLASH[tok];
  node.style.background = color;
  // full colour at once (no fade-in), held a moment, then a slow, even fade (~3.5 s in all)
  node.getAnimations().forEach((a) => a.cancel());
  node.animate(
    [{ opacity: peak }, { opacity: peak, offset: 0.06, easing: 'cubic-bezier(0.25, 0.1, 0.5, 1)' }, { opacity: 0 }],
    { duration: 3500 },
  );
}

// ── gestures on the stage ──
// tap the creature = ✓ · tap anywhere around it = ❓ · swipe through it (left↔right) = ✗
function gestures(stage, creature) {
  let g = null;
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    g = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), through: false, far: false };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!g) return;
    const r = creature.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    // did this stretch of the path cross its middle, at its height?
    if ((g.x - cx) * (e.clientX - cx) <= 0 && g.x !== e.clientX) {
      const y = g.y + ((cx - g.x) / (e.clientX - g.x)) * (e.clientY - g.y);
      if (y >= r.top && y <= r.bottom) g.through = true;
    }
    g.x = e.clientX;
    g.y = e.clientY;
    if (Math.hypot(g.x - g.x0, g.y - g.y0) > 12) g.far = true;
  });
  const end = (e) => {
    if (!g) return;
    const d = g;
    g = null;
    if (e.type === 'pointercancel') return;
    const r = creature.getBoundingClientRect();
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.far && performance.now() - d.t0 < 700) playerSend(inside(r, d.x0, d.y0) ? YES : ASK);
    else if (d.through && Math.abs(dx) > Math.max(40, 1.5 * Math.abs(dy))) playerSend(NO);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
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

/** The bottom-right row: the real signs of the current exchange, yours and its (its dimmer), since
 * your last ✓ ✗ ❓ (they break the sequence; its own don't clear the row). Starts fresh after sleep. */
const ROW_MAX = 5;
function exchangeRow() {
  const h = s.save.history;
  const row = [];
  for (let i = h.length - 1; i >= 0 && row.length < ROW_MAX; i--) {
    const e = h[i];
    if (e.who === 'S') break;
    if (ELEMENTALS.includes(e.tok)) {
      if (e.who === 'P') break;
      continue;
    }
    if (!s.mind.takenBack.has(i)) row.unshift(e);
  }
  return row;
}

let rowKey = '';
function renderRow(row) {
  const key = row.map((e) => e.who + e.tok).join('');
  if (key === rowKey) return;
  rowKey = key;
  el.you.replaceChildren(
    ...row.map((e) => {
      const n = document.createElement('span');
      n.className = e.who === 'C' ? 'its' : 'yours';
      n.textContent = e.tok;
      return n;
    }),
  );
}

// dreaming: dream emojis rise straight up from its head, growing as they go. They come out at the
// normal (1×) dream pace, one every dreamIntervalSec real seconds, also when time runs faster: then
// each one shows the dream emoji of that moment (the dream itself is not affected).
let dreamSpawned = -1;
let lastSpawn = 0;
const flying = []; // { node, born (real ms) }
const RISE_PX = 200;
const riseMs = () => 3 * s.params.dreamIntervalSec * 1000; // about 3 visible at a time

function showDream(m) {
  if (s.dreamShown < dreamSpawned) dreamSpawned = -1; // a new sleep
  const t = performance.now();
  if (s.dreamShown <= dreamSpawned || t - lastSpawn < 0.95 * s.params.dreamIntervalSec * 1000) return;
  const tok = m.sleep.dream[s.dreamShown];
  dreamSpawned = s.dreamShown;
  if (!tok) return;
  lastSpawn = t;
  const node = document.createElement('span');
  node.className = 'dream-emoji';
  node.textContent = tok;
  el.dreams.append(node);
  flying.push({ node, born: t });
}

function clearDreams() {
  flying.length = 0;
  el.dreams.replaceChildren();
}

function animateDreams() {
  const now = performance.now();
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    const p = (now - f.born) / riseMs(); // 0…1 of the way up
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
    renderRow([]);
  } else {
    if (flying.length) clearDreams(); // woke up: dreams vanish
    const c = lastEntry('C');
    el.bubble.className = 'bubble' + (m.turn === 'C' ? ' faded' : '') + (c ? '' : ' empty');
    el.bubbleEmoji.textContent = c ? c.tok : '';
    el.bubbleMark.textContent = '';
    el.label.textContent = m.label();
    renderRow(exchangeRow());
  }

  // keyboard: "Zuletzt" (pinned signs + most recent emojis) | the hour's random set ("16 Uhr")
  // too tired: tap away the 💤 (or wait until it wakes by itself) to get the keyboard back
  if (s.tired && m.awake) s.tired = null;
  const tired = !!s.tired;
  palette.setTitles(tired ? 'Zu müde...' : 'Zuletzt', hourLabel(now));
  if (tired) palette.setSleepy(s.tired);
  else {
    palette.setRecent(ELEMENTALS, recentEmojis(s.save.history));
    palette.setRandom(hourlySet(s.save.seed, now));
  }
  palette.setLocked(!tired && m.awake && m.turn !== 'P');
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
const palette = buildPalette(document.getElementById('palette'), {
  onPick: playerSend,
  onZz(slot) {
    if (!s.tired) return;
    s.tired.delete(slot);
    if (!s.tired.size) s.tired = null; // all tapped away: the keyboard is back
    render();
  },
});
gestures(document.querySelector('.stage'), el.creature);
const updatePanel = buildPanel(document.getElementById('panel'), handlers);
load(loadCreature() || newCreature(Date.now(), s.params));
setInterval(tick, 100);
setInterval(() => updatePanel(s), 400);
tick();
updatePanel(s);
