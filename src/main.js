// App: the time loop, player input, and the game view.
// The history is the creature: every event is appended to it and observed by the mind.

import { Mind } from './core/mind.js';
import { ENGINE_VERSION } from './core/params.js';
import { SLEEP, WAKE, YES, NO, ASK, ELEMENTALS, ENERGY } from './core/tokens.js';
import { recentEmojis, hourlySet } from './core/keyboard.js';
import { voiceFor, ARCHETYPES, PLAYER_VOICE } from './core/voice.js';
import { buildPalette } from './ui/palette.js';
import { buildPanel } from './ui/panel.js';
import { buildCreature } from './ui/creature.js';
import { buildMic } from './ui/mic.js';
import { playMelody, playDreamMelody, dreamSoundOn, setDreamSound, setDreaming, unlockAudio, setSound, soundOn } from './ui/sound.js';
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
  saveInfo: { bytes: 0, pruned: 0 },
};

function load(save) {
  s.save = save;
  s.clock = new Clock(save.clockOffset || 0);
  s.mind = Mind.replay(save, s.params);
  s.why = null;
  s.replyAt = s.wakeAt = null;
  s.dreamShown = -1;
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
/** Your sign (keyboard, gesture, or heard through the microphone: `heard`, then it plays nothing). */
function playerSend(tok, { heard = false } = {}) {
  unlockAudio();
  const now = s.clock.now();
  const m = s.mind;
  if (heard && (!m.awake || m.turn !== 'P')) return; // heard while it sleeps or is about to answer: ignored
  if (!m.awake) {
    // asleep: any tap or swipe on the stage wakes it, always as your ❓ (the keyboard is hidden).
    // Woken with little energy, it soon nods off again by itself.
    setDreaming(false); // the dream sounds stop the moment you wake it
    append({ t: now, who: 'S', tok: WAKE, m: 'manual' });
    tok = ASK;
  } else if (m.turn !== 'P') return;
  append({ t: s.clock.now(), who: 'P', tok });
  if (ELEMENTALS.includes(tok) && !heard) playMelody(tok, PLAYER_VOICE, 0.8, -1); // your ✓ ✗ ❓: an octave lower, in your own sound
  s.replyAt = null;
  render();
}

// ── gestures on the stage ──
// tap the creature (from its hat down to its legs, its middle) = ✓ · tap anywhere else = ❓ · swipe sideways anywhere = ✗
function gestures(stage, creature) {
  let g = null;
  // the creature: the middle of its frame from the top of its hat down to just above its legs, plus
  // the wider band where its eyes are (arms, legs and object don't count). Shares of its frame.
  const BODY = [
    { left: 0.3, right: 0.7, top: 0.04, bottom: 0.66 }, // hat, face, middle
    { left: 0.15, right: 0.85, top: 0.2, bottom: 0.46 }, // its eyes, out to the sides
  ];
  const inside = (r, x, y) => {
    const fx = (x - r.left) / r.width;
    const fy = (y - r.top) / r.height;
    return BODY.some((b) => fx >= b.left && fx <= b.right && fy >= b.top && fy <= b.bottom);
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (!s.mind.awake) {
      // touching the stage while it sleeps wakes it: the dream sounds stop right at the touch
      s.waking = true;
      setDreaming(false);
    }
    g = { x0: e.clientX, y0: e.clientY, t0: performance.now(), far: false };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (g && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 12) g.far = true;
  });
  const end = (e) => {
    if (!g) return;
    const d = g;
    g = null;
    if (e.type === 'pointercancel') return void (s.waking = false);
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.far && performance.now() - d.t0 < 700) playerSend(inside(creature.getBoundingClientRect(), d.x0, d.y0) ? YES : ASK);
    else if (Math.abs(dx) > Math.max(40, 1.5 * Math.abs(dy))) playerSend(NO); // a mostly sideways swipe
    else if (!s.mind.awake) playerSend(ASK); // asleep, any touch wakes it (as your ❓)
    s.waking = false;
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

  // left alone since: its last entry; in mic mode your (or a heard) last sign, its waking, or switching
  // mic mode on, since its own ❓ calls don't count as company
  const alone = s.mic ? Math.max(m.lastActivity, s.micSince) : m.lastEntryT;
  if (m.awake) {
    if (now - alone > idleMs) {
      // left alone (also when the app was closed): it fell asleep back then
      append({ t: alone + idleMs, who: 'S', tok: SLEEP });
    } else if (s.mic && m.turn === 'P' && now - m.lastEntryT > s.callAfter) {
      // mic mode: after a few quiet seconds it calls out ❓, so other creatures nearby hear it; when
      // tired it may nod off instead (the same chance as when it answers)
      const e = m.energy / m.capacity;
      const p = s.params;
      if (e < p.sleepyBelow && Math.random() < p.nodOffMax * ((p.sleepyBelow - e) / p.sleepyBelow) ** 2) append({ t: now, who: 'S', tok: SLEEP });
      else {
        append({ t: now, who: 'C', tok: ASK });
        playMelody(ASK, voiceFor(m.seats));
      }
      s.callAfter = 5000 + Math.random() * 5000;
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
  signs: document.getElementById('signs'),
  dreams: document.getElementById('dreams'),
  label: document.getElementById('label'),
  stageWidth: () => document.querySelector('.stage').clientWidth,
  stageHeight: () => document.querySelector('.stage').clientHeight,
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

/** The bottom-left row: the real signs of the current exchange, yours and its (its dimmer), since
 * your last ✓ or ✗ (your ❓ and its own specials don't clear the row). Starts fresh after sleep.
 * While you answer with ✗ (once or several times in a row), it keeps showing what came before the
 * sign your first ✗ rejected, plus its newest try, so you see the "not that, this" context until you
 * send something other than ✗. */
const ROW_MAX = 5;
const real = (e) => e.who !== 'S' && !ELEMENTALS.includes(e.tok);
const boundary = (e) => e.who === 'S' && e.tok !== ENERGY; // sleep, wake, birth end an exchange (setting energy doesn't)

/** The row's history indices as they stand just before history index `end`. */
function rowBefore(h, end) {
  const row = [];
  for (let i = end - 1; i >= 0 && row.length < ROW_MAX; i--) {
    const e = h[i];
    if (boundary(e)) break;
    if (ELEMENTALS.includes(e.tok)) {
      if (e.who === 'P' && e.tok !== ASK) break;
      continue;
    }
    if (!s.mind.takenBack.has(i)) row.unshift(i);
  }
  return row;
}

/**
 * The sign row above its head (history indices, oldest first): the real signs of the current exchange,
 * yours and its, since your last ✓ or ✗ (your ❓ and its own ✓ ✗ ❓ don't clear it). While you answer
 * with ✗ it keeps what came before the sign your first ✗ rejected, plus its newest try. The very latest
 * sign, if it is a ✓ ✗ ❓ (yours or its), is shown at the end until the next sign. Starts fresh after sleep.
 */
function exchangeRow() {
  const h = s.save.history;
  const tail = h.length - 1;
  const withLast = (row) => (tail >= 0 && ELEMENTALS.includes(h[tail].tok) && !row.includes(tail) ? [...row, tail] : row).slice(-ROW_MAX);
  // your latest answer (❓ doesn't count): only a ✗ keeps the context
  let last = -1;
  for (let i = tail; i >= 0 && !boundary(h[i]); i--) {
    if (h[i].who === 'P' && h[i].tok !== ASK) {
      last = i;
      break;
    }
  }
  if (last < 0 || h[last].tok !== NO) return withLast(rowBefore(h, h.length));
  // the first ✗ of your run of ✗ (❓ in between allowed), and the sign it rejected
  let first = last;
  for (let i = last - 1; i >= 0 && !boundary(h[i]); i--) {
    if (h[i].who !== 'P') continue;
    if (h[i].tok === NO) first = i;
    else if (h[i].tok !== ASK) break;
  }
  let rejected = first - 1;
  while (rejected >= 0 && !boundary(h[rejected]) && !real(h[rejected])) rejected--;
  if (rejected < 0 || boundary(h[rejected])) return withLast(rowBefore(h, h.length));
  // what came before it, plus its newest try after your latest ✗
  const tries = [];
  for (let i = last + 1; i <= tail; i++) if (real(h[i])) tries.push(i);
  return withLast([...rowBefore(h, rejected), ...tries]);
}

// the row is drawn above its head: the newest sign in the middle (right above the head), older ones to
// its left. A new sign slides in from the right and pushes the others left. Its signs are fully
// visible, yours at half strength.
const SLOT = 74; // px from one sign to the next
const shownSigns = new Map(); // history index -> node
function renderSigns(row) {
  const h = s.save.history;
  const want = new Set(row);
  for (const [i, node] of shownSigns)
    if (!want.has(i)) {
      shownSigns.delete(i);
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 450);
    }
  row.forEach((i, k) => {
    const x = -(row.length - 1 - k) * SLOT;
    const alpha = h[i].who === 'C' ? '1' : '0.5';
    let node = shownSigns.get(i);
    if (!node) {
      node = document.createElement('span');
      node.className = 'sign';
      node.textContent = h[i].tok;
      node.style.transform = `translateX(${x + SLOT}px)`; // comes in from the right
      node.style.opacity = '0';
      el.signs.append(node);
      shownSigns.set(i, node);
      node.getBoundingClientRect(); // start the slide from there
    }
    node.style.transform = `translateX(${x}px)`;
    node.style.opacity = alpha;
  });
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
  // its melody, slowed to last exactly until the next dream sign appears
  playDreamMelody(tok, s.params.dreamIntervalSec * 1000);
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
  driftClouds(now);
  look.animate(now, !s.mind.awake); // the parts breathe, the object floats
  requestAnimationFrame(animateDreams);
}
requestAnimationFrame(animateDreams);

function render() {
  const m = s.mind;
  const now = s.clock.now();
  el.creature.classList.toggle('asleep', !m.awake);
  look.render({ seats: m.seats, pose: m.pose, level: m.shownLevel(), spot: m.objectSpot });

  if (!m.awake && m.sleep) {
    el.label.textContent = ''; // the clouds show it's sleeping
    showDream(m);
    renderSigns([]);
  } else {
    if (flying.length) clearDreams(); // woke up: dreams vanish
    el.label.textContent = m.label();
    const row = exchangeRow();
    renderSigns(s.mic ? row.slice(-1) : row); // in mic mode only the newest sign, above its head
  }

  muteBtn.hidden = m.awake; // the dream mute button only while it sleeps
  setDreaming(!m.awake && !s.waking); // waking cuts the dream sounds off at once; falling asleep opens them (unless muted)

  // keyboard: most recent emojis | the hour's random set (✅ ❌ ❓ are gestures, not keys).
  // It slides away while it sleeps and slides back when it wakes.
  palette.setRecent(recentEmojis(s.save.history));
  palette.setRandom(hourlySet(s.save.seed, now));
  palette.setLocked(m.awake && m.turn !== 'P');
  slideKeyboard(m.awake);
  sleepClouds(1 - m.energyAt(now) / m.capacity, !m.awake);
}

// the keyboard slides down out of view (the stage grows into its place) and back up
const kbWrap = document.getElementById('palette-wrap');
// only the end of its own height slide counts (the keys' own little fades end earlier and bubble up)
kbWrap.addEventListener('transitionend', (e) => {
  if (e.target === kbWrap && e.propertyName === 'height' && kbShown) kbWrap.style.height = '';
});
let kbShown = null;
function slideKeyboard(show) {
  if (show === kbShown) return;
  const first = kbShown === null;
  kbShown = show;
  const full = kbWrap.firstElementChild.getBoundingClientRect().height; // exact (no rounding: no snap at the end)
  if (first) {
    kbWrap.style.height = show ? '' : '0px';
    return;
  }
  kbWrap.style.height = (show ? 0 : full) + 'px';
  kbWrap.offsetHeight; // start the transition from here
  kbWrap.style.height = (show ? full : 0) + 'px';
  // (when it has fully slid in it goes back to its natural height; see the listener below)
}

// clouds float slowly across the stage from right to left (born outside on the right, gone outside
// on the left), some behind the creature, some in front of it. They float all the time, but are only
// visible while it sleeps: falling asleep they slowly fade in (already spread out), waking they fade
// out. How many: from a few at full energy to many when it's empty, following its energy.
const CLOUDS_RESTED = 4; // clouds on the stage at full energy
const CLOUDS_EMPTY = 24; // … and at no energy
const clouds = []; // { node, x, fy (height of its centre, share of the stage), size, w, speed }
const cloudBack = document.getElementById('clouds-back');
const cloudFront = document.getElementById('clouds-front');
let cloudWant = 0;
let lastCloudFrame = 0;
let nextCloudBirth = 0;

/** tiredness 0 (full) … 1 (empty); asleep: show them */
function sleepClouds(tiredness, asleep) {
  const first = !cloudWant;
  cloudWant = Math.round(CLOUDS_RESTED + (CLOUDS_EMPTY - CLOUDS_RESTED) * Math.max(0, Math.min(1, tiredness)));
  if (first) {
    // the page just opened: fill the sky at once, spread out
    for (let i = clouds.length; i < cloudWant; i++) addCloud(null);
    nextCloudBirth = performance.now() + cloudGap() * (0.5 + Math.random());
  }
  document.querySelector('.stage').classList.toggle('sleeping', asleep);
  document.querySelector('.phone').classList.toggle('night', asleep); // the night sky (fades in and out)
}

/** Milliseconds between new clouds, so that about cloudWant are on the stage at a time. */
const cloudGap = () => (((el.stageWidth() + 200) / 12) * 1000) / Math.max(1, cloudWant);

/** Height of a cloud's centre, as a share of the stage: mostly low, below the creature, never up at the logo. */
const cloudHeight = () => 0.28 + 0.74 * Math.sqrt(Math.random());

/**
 * A new cloud at x (null: anywhere across the stage). Its place is the best of a few random tries:
 * the one farthest from the clouds already there (so they spread out instead of clumping).
 */
function addCloud(x) {
  const W = el.stageWidth();
  const H = el.stageHeight();
  const size = 40 + 220 * Math.random() ** 2.5; // 40–260 px: mostly small and medium, now and then a big one
  let best = null;
  for (let k = 0; k < 8; k++) {
    const cx = x === null ? Math.random() * W : x + size * 0.65;
    const fy = cloudHeight();
    const room = clouds.reduce((mn, c) => Math.min(mn, Math.hypot(cx - (c.x + c.w / 2), (fy - c.fy) * H) - (c.size + size) / 3), Infinity);
    if (!best || room > best.room) best = { cx, fy, room };
  }
  const node = document.createElement('span');
  node.className = 'cloud';
  node.textContent = '☁️';
  const front = Math.random() < 0.35; // some float in front of the creature
  node.style.fontSize = size.toFixed(0) + 'px';
  node.style.zIndex = String(Math.round(size));
  node.style.opacity = (front ? 0.22 + Math.random() * 0.3 : 0.35 + Math.random() * 0.45).toFixed(2);
  const w = size * 1.3;
  const c = { node, size, w, x: best.cx - w / 2, fy: best.fy, speed: 5 + size * 0.045 };
  place(c, H); // in place from the start (no flash at the top left)
  (front ? cloudFront : cloudBack).append(node);
  clouds.push(c);
}

/** Its height follows the stage's height (which grows when the keyboard slides away). */
function place(c, H) {
  const y = Math.max(H * 0.1, c.fy * H - c.size / 2);
  c.node.style.transform = `translate(${c.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

function driftClouds(now) {
  const dt = Math.min(0.1, (now - (lastCloudFrame || now)) / 1000);
  lastCloudFrame = now;
  if (!cloudWant) return;
  const W = el.stageWidth();
  const H = el.stageHeight();
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.x -= c.speed * dt; // px per second, bigger (closer) clouds a bit faster
    if (c.x < -c.w) {
      c.node.remove();
      clouds.splice(i, 1);
      continue;
    }
    place(c, H);
  }
  // new ones come in from the right at a steady pace (a little irregular), about cloudWant on the stage
  if (now >= nextCloudBirth) {
    if (clouds.length < cloudWant + 2) addCloud(W + 10);
    nextCloudBirth = now + cloudGap() * (0.75 + 0.5 * Math.random());
  }
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
  setEnergy(share) {
    append({ t: s.clock.now(), who: 'S', tok: ENERGY, m: String(share) });
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

// ── logo: the menu (Mic · New creature) ──
const menu = document.getElementById('menu');
const confirmBox = document.getElementById('confirm');
document.getElementById('logo').addEventListener('click', () => (menu.hidden = false));
menu.addEventListener('click', (e) => e.target === menu && (menu.hidden = true)); // tap outside: close
document.getElementById('menu-new').addEventListener('click', () => {
  menu.hidden = true;
  confirmBox.hidden = false; // asks first
});
document.getElementById('menu-mic').addEventListener('click', () => {
  menu.hidden = true;
  setMic(true);
});

// ── mic mode: the keyboard area listens instead (src/ui/mic.js) ──
const micPanel = document.getElementById('mic-panel');
const mic = buildMic(micPanel, { onSign: (tok) => playerSend(tok, { heard: true }), onExit: () => setMic(false) });
async function setMic(on) {
  if (on === !!s.mic) return;
  s.mic = on;
  s.micSince = s.clock.now();
  s.callAfter = 5000 + Math.random() * 5000;
  document.querySelector('.kb-inner').classList.toggle('mic', on);
  micPanel.hidden = !on;
  if (on) {
    unlockAudio();
    if (!s.mind.awake) {
      // switching mic mode on wakes it (it then waits; after a few quiet seconds it calls out ❓)
      setDreaming(false);
      append({ t: s.clock.now(), who: 'S', tok: WAKE, m: 'manual' });
    }
    render();
    await mic.start();
  } else mic.stop();
}
// leaving the app ends mic mode (the phone stops the microphone in the background anyway)
document.addEventListener('visibilitychange', () => document.hidden && setMic(false));
document.getElementById('confirm-no').addEventListener('click', () => (confirmBox.hidden = true));
document.getElementById('confirm-yes').addEventListener('click', () => {
  confirmBox.hidden = true;
  handlers.reset();
});
confirmBox.addEventListener('click', (e) => e.target === confirmBox && (confirmBox.hidden = true)); // tap outside: keep it

// ── dream sounds: mute / unmute (shown while it sleeps; remembered on this device) ──
const muteBtn = document.getElementById('dream-mute');
const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
function drawMute() {
  const on = dreamSoundOn();
  muteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${SPEAKER}${
    on ? '<path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/>' : '<path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>'
  }</svg>`;
  muteBtn.setAttribute('aria-label', on ? 'Mute dream sounds' : 'Unmute dream sounds');
}
drawMute();
// its own taps must not reach the stage (where a tap would wake the creature)
for (const type of ['pointerdown', 'pointerup', 'pointercancel']) muteBtn.addEventListener(type, (e) => e.stopPropagation());
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  unlockAudio();
  setDreamSound(!dreamSoundOn());
  drawMute();
});

// ── start ──
// always the newest files (see sw.js); also lets the game start without a connection. Only on the
// real site (https): on the local dev server it would quietly show an old copy when the server is off.
if ('serviceWorker' in navigator) {
  if (location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  else navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}
const look = buildCreature(el.creature);
s.styleCount = look.styleCount;
const palette = buildPalette(document.getElementById('palette'), {
  onPick: playerSend,
});
gestures(document.querySelector('.stage'), el.creature);
const updatePanel = buildPanel(document.getElementById('panel'), handlers);
// game only, without the lab panel: always on phones and tablets (touch, no mouse) and very narrow
// windows; on desktop, Escape switches between the game alone (whole window) and game + lab panel
const touchDevice = matchMedia('(hover: none) and (pointer: coarse), (max-width: 700px)');
let desktopGameOnly = false;
const gameOnly = () => touchDevice.matches || desktopGameOnly;
function applyLayout() {
  document.documentElement.classList.toggle('game-only', gameOnly());
}
touchDevice.addEventListener?.('change', applyLayout);
// the game stays put on phones: no dragging the whole app up or down (iOS needs this besides the CSS)
document.addEventListener('touchmove', (e) => gameOnly() && e.cancelable && e.preventDefault(), { passive: false });
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!confirmBox.hidden) return void (confirmBox.hidden = true); // Escape closes the question first
  if (!menu.hidden) return void (menu.hidden = true); // … and the menu
  if (touchDevice.matches) return;
  desktopGameOnly = !desktopGameOnly;
  applyLayout();
  if (!gameOnly()) updatePanel(s);
});
applyLayout();

load(loadCreature() || newCreature(Date.now(), s.params));
setInterval(tick, 100);
setInterval(() => gameOnly() || updatePanel(s), 400);
tick();
updatePanel(s);
