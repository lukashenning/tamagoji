// App: the time loop, player input, and the game view.
// The history is the creature: every event is appended to it and observed by the mind.

import { Mind } from './core/mind.js';
import { ENGINE_VERSION } from './core/params.js';
import { SLEEP, WAKE, ELEMENTALS, isContent } from './core/tokens.js';
import { ALL } from './core/emojiIndex.js';
import { LABELS } from './core/emotions.js';
import { Frequent } from './core/frequent.js';
import { buildPalette } from './ui/palette.js';
import { buildPanel } from './ui/panel.js';
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
  randomSel: [], // the 25 emojis in the right half of the keyboard
};

const FREQUENT_SLOTS = 25 - ELEMENTALS.length;

function load(save) {
  s.save = save;
  // "frequently used", weighted by recency (sessions = wake-ups)
  s.freq = new Frequent(s.params.frequentHalfLife);
  for (const e of save.history) trackFrequent(e);
  s.clock = new Clock(save.clockOffset || 0);
  s.mind = Mind.replay(save, s.params);
  s.why = null;
  s.replyAt = s.wakeAt = null;
  s.dreamShown = -1;
  persist();
  updateFrequent();
  refreshRandom();
}

function persist() {
  s.save.clockOffset = s.clock.offset;
  saveCreature(s.save);
}

function trackFrequent(e) {
  if (e.tok === WAKE) s.freq.nextSession();
  if (e.who === 'P' && isContent(e.tok)) s.freq.use(e.tok);
}

function append(entry) {
  s.save.history.push(entry);
  trackFrequent(entry);
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
  const now = s.clock.now();
  const m = s.mind;
  if (!m.awake) append({ t: now, who: 'S', tok: WAKE, m: 'manual' }); // sending an emoji wakes it
  else if (m.turn !== 'P') return;
  append({ t: s.clock.now(), who: 'P', tok });
  s.replyAt = null;
  updateFrequent();
  refreshRandom(); // a new random selection after every input
  render();
}

// ── time loop ──
function tick() {
  s.clock.tick();
  const now = s.clock.now();
  const m = s.mind;
  const idleMs = s.params.idleSleepMin * 60000;

  if (m.awake) {
    if (now - m.lastEntryT > idleMs) {
      // left alone (also when the app was closed): it fell asleep back then
      append({ t: m.lastEntryT + idleMs, who: 'S', tok: SLEEP });
    } else if (m.turn === 'C') {
      if (s.replyAt === null) s.replyAt = now + rand(s.params.replyDelaySec) * 1000;
      if (now >= s.replyAt) {
        s.replyAt = null;
        const d = m.decide();
        s.why = d.why;
        append({ t: now, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
        offerCreatureEmoji(d.tok);
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

function render() {
  const m = s.mind;
  const now = s.clock.now();
  el.creature.style.setProperty('--size', 90 + m.stage * 22 + 'px');
  el.creature.classList.toggle('asleep', !m.awake);

  if (!m.awake && m.sleep) {
    const dream = m.sleep.dream[Math.max(0, s.dreamShown)];
    const remaining = m.isRested(now) ? 0 : (m.sleep.restedAt - now) / (m.sleep.restedAt - m.sleep.start);
    el.bubble.className = 'bubble dream';
    el.bubbleEmoji.textContent = s.dreamShown >= 0 && dream ? dream : '';
    el.bubbleMark.textContent = 'z'.repeat(1 + Math.round(remaining * 2)) + 'Z';
    el.label.textContent = 'sleeping';
    el.you.textContent = '';
  } else {
    const c = lastEntry('C');
    const p = lastEntry('P');
    el.bubble.className = 'bubble' + (m.turn === 'C' && !m.elab ? ' faded' : '') + (c ? '' : ' empty');
    el.bubbleEmoji.textContent = c ? c.tok : '';
    el.bubbleMark.textContent = '';
    const lab = m.label();
    el.label.textContent = lab ? LABELS[lab] : '';
    el.you.textContent = p ? p.tok : '';
  }
  palette.setLocked(m.awake && m.turn !== 'P');
}

// ── keyboard contents ──
function frequentList() {
  return s.freq.top(FREQUENT_SLOTS);
}

function updateFrequent() {
  palette.setFrequent(ELEMENTALS, frequentList());
}

/** The creature's latest emojis in this session, so you can always answer with them. */
function creatureEmojis(n) {
  const out = [];
  const h = s.save.history;
  for (let i = h.length - 1; i >= 0 && out.length < n; i--) {
    const e = h[i];
    if (e.tok === SLEEP || e.tok === WAKE) break;
    if (e.who === 'C' && isContent(e.tok) && !out.includes(e.tok)) out.push(e.tok);
  }
  return out;
}

function refreshRandom() {
  const freq = new Set(frequentList());
  const sel = new Set(creatureEmojis(3).filter((e) => !freq.has(e)));
  while (sel.size < 25) {
    const e = ALL[Math.floor(Math.random() * ALL.length)];
    if (!freq.has(e)) sel.add(e);
  }
  s.randomSel = [...sel].sort(() => Math.random() - 0.5);
  palette.setRandom(s.randomSel);
}

/** When it uses an emoji you can't see on your keyboard, it appears in the random half. */
function offerCreatureEmoji(tok) {
  if (!isContent(tok) || s.randomSel.includes(tok) || frequentList().includes(tok)) return;
  const keep = new Set(creatureEmojis(3));
  const slots = s.randomSel.map((e, i) => i).filter((i) => !keep.has(s.randomSel[i]));
  s.randomSel[slots[Math.floor(Math.random() * slots.length)]] = tok;
  palette.setRandom(s.randomSel);
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
  // no browser popups (confirm/alert): the built-in browser pane blocks them.
  // Confirmation happens in the panel itself (click twice).
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
