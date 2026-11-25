// App: the time loop, player input, and the game view.
// The history is the creature: every event is appended to it and observed by the mind.

import { Mind } from './core/mind.js';
import { ENGINE_VERSION } from './core/params.js';
import { SLEEP, WAKE, YES, NO, ASK, ELEMENTALS } from './core/tokens.js';
import { recentEmojis, hourlySet } from './core/keyboard.js';
import { voiceFor, ARCHETYPES, PLAYER_VOICE } from './core/voice.js';
import { buildPalette } from './ui/palette.js';
import { buildPanel } from './ui/panel.js';
import { buildCreature } from './ui/creature.js';
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
function playerSend(tok) {
  unlockAudio();
  const now = s.clock.now();
  const m = s.mind;
  if (!m.awake) {
    // asleep: any tap or swipe on the stage wakes it, always as your ❓ (the keyboard is hidden).
    // Woken with little energy, it soon nods off again by itself.
    append({ t: now, who: 'S', tok: WAKE, m: 'manual' });
    tok = ASK;
  } else if (m.turn !== 'P') return;
  append({ t: s.clock.now(), who: 'P', tok });
  if (ELEMENTALS.includes(tok)) playMelody(tok, PLAYER_VOICE, 0.8, -1); // your ✓ ✗ ❓: an octave lower, in your own sound
  s.replyAt = null;
  render();
}

// ── gestures on the stage ──
// tap the creature = ✓ · tap anywhere around it = ❓ · swipe left or right anywhere on the stage = ✗
function gestures(stage, creature) {
  let g = null;
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
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
    if (e.type === 'pointercancel') return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.far && performance.now() - d.t0 < 700) playerSend(inside(creature.getBoundingClientRect(), d.x0, d.y0) ? YES : ASK);
    else if (Math.abs(dx) > Math.max(40, 1.5 * Math.abs(dy))) playerSend(NO); // a mostly sideways swipe
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

/** The bottom-left row: the real signs of the current exchange, yours and its (its dimmer), since
 * your last ✓ or ✗ (your ❓ and its own specials don't clear the row). Starts fresh after sleep.
 * While you answer with ✗ (once or several times in a row), it keeps showing what came before the
 * sign your first ✗ rejected, plus its newest try, so you see the "not that, this" context until you
 * send something other than ✗. */
const ROW_MAX = 5;
const real = (e) => e.who !== 'S' && !ELEMENTALS.includes(e.tok);

/** The row as it stands just before history index `end`. */
function rowBefore(h, end) {
  const row = [];
  for (let i = end - 1; i >= 0 && row.length < ROW_MAX; i--) {
    const e = h[i];
    if (e.who === 'S') break;
    if (ELEMENTALS.includes(e.tok)) {
      if (e.who === 'P' && e.tok !== ASK) break;
      continue;
    }
    if (!s.mind.takenBack.has(i)) row.unshift(e);
  }
  return row;
}

function exchangeRow() {
  const h = s.save.history;
  // your latest answer (❓ doesn't count): only a ✗ keeps the context
  let last = -1;
  for (let i = h.length - 1; i >= 0 && h[i].who !== 'S'; i--) {
    if (h[i].who === 'P' && h[i].tok !== ASK) {
      last = i;
      break;
    }
  }
  if (last < 0 || h[last].tok !== NO) return rowBefore(h, h.length);
  // the first ✗ of your run of ✗ (❓ in between allowed), and the sign it rejected
  let first = last;
  for (let i = last - 1; i >= 0 && h[i].who !== 'S'; i--) {
    if (h[i].who !== 'P') continue;
    if (h[i].tok === NO) first = i;
    else if (h[i].tok !== ASK) break;
  }
  let rejected = first - 1;
  while (rejected >= 0 && h[rejected].who !== 'S' && !real(h[rejected])) rejected--;
  if (rejected < 0 || h[rejected].who === 'S') return rowBefore(h, h.length);
  // what came before it, plus its newest try after your latest ✗
  const tries = h.slice(last + 1).filter(real);
  return [...rowBefore(h, rejected), ...tries].slice(-ROW_MAX);
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
    el.bubble.className = 'bubble empty';
    el.bubbleEmoji.textContent = '';
    el.bubbleMark.textContent = '';
    el.label.textContent = ''; // the clouds show it's sleeping
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

  muteBtn.hidden = m.awake; // the dream mute button only while it sleeps
  setDreaming(!m.awake); // waking cuts the dream sounds off at once; falling asleep opens them (unless muted)

  // keyboard: most recent emojis | the hour's random set (✅ ❌ ❓ are gestures, not keys).
  // It slides away while it sleeps and slides back when it wakes.
  palette.setRecent(recentEmojis(s.save.history));
  palette.setRandom(hourlySet(s.save.seed, now));
  palette.setLocked(m.awake && m.turn !== 'P');
  slideKeyboard(m.awake);
  sleepClouds(m.awake ? 0 : 1 - m.energyAt(now) / m.capacity);
}

// the keyboard slides down out of view (the stage grows into its place) and back up
const kbWrap = document.getElementById('palette-wrap');
let kbShown = null;
function slideKeyboard(show) {
  if (show === kbShown) return;
  const first = kbShown === null;
  kbShown = show;
  const full = kbWrap.firstElementChild.offsetHeight;
  if (first) {
    kbWrap.style.height = show ? '' : '0px';
    return;
  }
  kbWrap.style.height = (show ? 0 : full) + 'px';
  kbWrap.offsetHeight; // start the transition from here
  kbWrap.style.height = (show ? full : 0) + 'px';
  if (show) kbWrap.addEventListener('transitionend', () => kbShown && (kbWrap.style.height = ''), { once: true });
}

// sleeping: soft clouds drift below it, the more the more tired it is; they thin out one by one as
// its energy comes back (none when it's nearly rested)
const CLOUDS_MAX = 14;
const clouds = []; // { node, x, y, amp, period, phase, leaving }
const cloudBox = document.getElementById('clouds');
function sleepClouds(tiredness) {
  const want = Math.round(CLOUDS_MAX * Math.max(0, Math.min(1, tiredness)));
  const here = clouds.filter((c) => !c.leaving);
  for (let i = here.length; i < want; i++) {
    const node = document.createElement('span');
    node.className = 'cloud';
    node.textContent = '☁️';
    const size = 48 + Math.random() ** 1.5 * 72; // 48–120 px, mostly mid-sized, a few big ones
    node.style.fontSize = size.toFixed(0) + 'px';
    node.style.zIndex = String(Math.round(size)); // bigger ones in front
    const c = { node, x: (Math.random() - 0.5) * 420, y: Math.random() * 120, amp: 3 + Math.random() * 7, period: 14000 + Math.random() * 14000, phase: Math.random() * 6.3, alpha: 0.25 + Math.random() * 0.5, leaving: false };
    cloudBox.append(node);
    clouds.push(c);
    requestAnimationFrame(() => (node.style.opacity = c.alpha.toFixed(2))); // fade in
  }
  for (let i = here.length; i > want; i--) {
    const c = here[Math.floor(Math.random() * here.length)];
    if (c.leaving) continue;
    c.leaving = true;
    c.node.style.opacity = '0'; // fade out, then go
    setTimeout(() => {
      c.node.remove();
      clouds.splice(clouds.indexOf(c), 1);
    }, 2500);
  }
}
function driftClouds(now) {
  for (const c of clouds) {
    const a = (now / c.period) * 2 * Math.PI + c.phase;
    c.node.style.transform = `translate(${(c.x + c.amp * Math.sin(a)).toFixed(1)}px, ${(c.y + 0.25 * c.amp * Math.sin(2 * a)).toFixed(1)}px)`;
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

// ── logo: tap it to start over with a new creature (after asking) ──
const confirmBox = document.getElementById('confirm');
document.getElementById('logo').addEventListener('click', () => (confirmBox.hidden = false));
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
