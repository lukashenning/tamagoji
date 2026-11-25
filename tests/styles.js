// How does complexity develop for different kinds of players? (docs/08 complexity, D75)
// Simulates several days of realistic play per player style: 4 sessions a day (8:00, 12:00, 17:00,
// 21:00). In a session you play until it gets tired and nods off; then you leave it alone, so it
// sleeps until rested, dreams, and (if the dream had 700+ signs) measures its complexity. It wakes
// by itself before your next session. Run with:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/styles.js

import { DEFAULT_PARAMS } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { BIRTH, SLEEP, WAKE, YES, NO, ASK, isElemental } from '../src/core/tokens.js';
import { mulberry32, rngFor } from '../src/core/rng.js';
import { makeCharacter, ALL } from '../src/core/emojiIndex.js';
import { levelFor } from '../src/core/look.js';

const log = globalThis.print || console.log;
// a wrapper can set globalThis.SIM = { params: {…}, styles: ['…'], days, label } before importing this
const SIM = globalThis.SIM || {};
const P = { ...DEFAULT_PARAMS, ...(SIM.params || {}) };
const MIN = 60000;
const HOUR = 60 * MIN;
const DAYS = SIM.days || 4;
const SESSIONS = [8, 12, 17, 21]; // hours of the day
const CREATURES = SIM.creatures || 10;
const START = Date.UTC(2027, 0, 4, 0, 0); // a Monday, 0:00

// ── languages a player speaks ──
// chains of signs; `next` = sign -> list of signs that follow it somewhere
function language(chains) {
  const next = new Map();
  for (const c of chains)
    for (let i = 0; i + 1 < c.length; i++) {
      if (!next.has(c[i])) next.set(c[i], []);
      if (!next.get(c[i]).includes(c[i + 1])) next.get(c[i]).push(c[i + 1]);
    }
  return { chains, next };
}

// ── player styles ──
// each: setup(rng, pool) -> state; session(state, day, s) at the start of each session; move(state, m, last, rng) -> token
function chainPlayer({ feedback = true, ask = 0.2, judge = 0.35, recent = 0 } = {}) {
  return (st, m, last, rng) => {
    const { next, chains } = st.lang;
    if (feedback && last && last.who === 'C' && !isElemental(last.tok) && rng() < judge) {
      const before = m.seq[m.seq.length - 2]?.tok;
      return (next.get(before) || []).includes(last.tok) ? YES : NO;
    }
    if (rng() < ask) return ASK;
    const cur = m.seq[m.seq.length - 1]?.tok;
    const opts = next.get(cur);
    if (opts && (!last || last.who === 'C' || rng() < 0.9)) return opts[Math.floor(rng() * opts.length)];
    const from = recent ? chains.slice(-recent) : chains; // recent: starts only its newest chains
    const c = from[Math.floor(rng() * from.length)];
    return c[0];
  };
}

const take = (st, n) => st.pool.splice(0, n);

const STYLES = {
  'teacher (growing language, ✓/✗)': {
    note: 'fixed chains of 4, one new chain per session, every sign in one chain only; judges its signs',
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: (st) => (st.lang = language([...st.lang.chains, take(st, 4)])),
    move: chainPlayer(),
  },
  'teacher, only newest chains': {
    note: 'same growing language with ✓/✗, but only starts its 2 newest chains (never revisits old ones)',
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: (st) => (st.lang = language([...st.lang.chains, take(st, 4)])),
    move: chainPlayer({ recent: 2 }),
  },
  'teacher without ✓/✗': {
    note: 'same growing language, but never judges',
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: (st) => (st.lang = language([...st.lang.chains, take(st, 4)])),
    move: chainPlayer({ feedback: false }),
  },
  'small vocabulary (12 signs)': {
    note: '3 fixed chains of 4 forever, with ✓/✗',
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: () => {},
    move: chainPlayer(),
  },
  'shared signs (ambiguous)': {
    note: 'growing set of chains drawn from only 16 signs, so signs have several followers; ✓/✗',
    setup: (st) => {
      st.base = take(st, 16);
      st.mk = () => {
        const b = st.base.slice();
        for (let i = b.length - 1; i > 0; i--) {
          const j = Math.floor(st.rng() * (i + 1));
          [b[i], b[j]] = [b[j], b[i]];
        }
        return b.slice(0, 4);
      };
      st.lang = language([st.mk(), st.mk(), st.mk()]);
    },
    session: (st) => (st.lang = language([...st.lang.chains, st.mk()])),
    move: chainPlayer(),
  },
  'contradicting (reshuffles daily)': {
    note: '16 signs in 4 chains, but every day in a new order; ✓/✗ by the current order',
    setup: (st) => {
      st.base = take(st, 16);
      st.shuffle = () => {
        const b = st.base.slice();
        for (let i = b.length - 1; i > 0; i--) {
          const j = Math.floor(st.rng() * (i + 1));
          [b[i], b[j]] = [b[j], b[i]];
        }
        st.lang = language([b.slice(0, 4), b.slice(4, 8), b.slice(8, 12), b.slice(12, 16)]);
      };
      st.shuffle();
    },
    session: (st, day, s) => s === 0 && day > 0 && st.shuffle(),
    move: chainPlayer(),
  },
  'random babbler': {
    note: 'a random sign from 60 every turn, sometimes ❓, never judges',
    setup: (st) => (st.base = take(st, 60)),
    session: () => {},
    move: (st, m, last, rng) => (rng() < 0.1 ? ASK : st.base[Math.floor(rng() * st.base.length)]),
  },
  '❓ presser': {
    note: '85% ❓, otherwise a sign of a small language (3 chains), never judges',
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: () => {},
    move: chainPlayer({ feedback: false, ask: 0.85 }),
  },
  'repeater': {
    note: 'always the same sign',
    setup: (st) => (st.base = take(st, 1)),
    session: () => {},
    move: (st) => st.base[0],
  },
  'teacher, then only ❓ (from day 3)': {
    note: 'growing language with ✓/✗ for 2 days, then 90% ❓ and no new signs',
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: (st, day) => day < 2 && (st.lang = language([...st.lang.chains, take(st, 4)])),
    move: (st, m, last, rng, day) => (day < 2 ? chainPlayer()(st, m, last, rng) : chainPlayer({ feedback: false, ask: 0.9 })(st, m, last, rng)),
  },
  'teacher who always wakes it early': {
    note: 'growing language with ✓/✗, but comes back and wakes it 10 min after it falls asleep',
    nap: 10,
    setup: (st) => (st.lang = language([take(st, 4), take(st, 4), take(st, 4)])),
    session: (st) => (st.lang = language([...st.lang.chains, take(st, 4)])),
    move: chainPlayer(),
  },
};

// ── one creature with one player ──
function live(style, seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const m = new Mind(P, seed);
  let t = START + 7.5 * HOUR;
  const o = (e) => m.observe(e);
  o({ t, who: 'S', tok: BIRTH, m: makeCharacter(rngFor(seed, 'character'), P.characterSize).join(' ') });
  // its own shuffled pool of emojis to speak with
  const pool = ALL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const st = { pool, rng };
  style.setup(st);
  let last = null;
  const sessions = [];
  let cont = [0, 0]; // its replies right after your chain sign (that has a follower): [continued your chain, chances]
  let used = new Set(); // its real signs this session
  const creatureMove = () => {
    const d = m.decide(rng, t);
    const prev = last && last.who === 'P' && !isElemental(last.tok) ? last.tok : null;
    const want = prev && st.lang ? st.lang.next.get(prev) : null;
    if (want && m.awake) {
      cont[1]++;
      if (want.includes(d.tok)) cont[0]++;
    }
    if (m.awake && d.tok !== SLEEP && !isElemental(d.tok)) used.add(d.tok);
    o({ t, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
    last = { who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok };
    t += 1000;
  };
  // it sleeps until rested, wakes by itself shortly after and greets (the app does that while open);
  // a napping player wakes it after `nap` minutes instead
  const restUntil = (until) => {
    if (m.awake) return;
    if (style.nap) {
      t = Math.max(t, m.lastEntryT + style.nap * MIN);
      o({ t, who: 'S', tok: WAKE, m: 'manual' });
      o({ t: t + 10, who: 'P', tok: ASK });
      last = { who: 'P', tok: ASK };
      return;
    }
    const wake = m.sleep.restedAt + 2000;
    if (wake <= until) {
      t = wake;
      o({ t, who: 'S', tok: WAKE });
      creatureMove(); // its greeting
    } else {
      t = until; // you come back before it is rested: you wake it (as your ❓)
      o({ t, who: 'S', tok: WAKE, m: 'manual' });
      o({ t: t + 10, who: 'P', tok: ASK });
      last = { who: 'P', tok: ASK };
    }
  };
  for (let day = 0; day < DAYS; day++) {
    SESSIONS.forEach((hour, s) => {
      const begin = START + day * 24 * HOUR + hour * HOUR;
      restUntil(begin);
      t = Math.max(t, begin);
      style.session(st, day, s);
      // play until it nods off (a napping player keeps going, ~70 of your signs per session)
      let yours = 0;
      cont = [0, 0];
      used = new Set();
      for (let k = 0; k < 600; k++) {
        if (!m.awake) {
          if (!style.nap || yours >= 70) break;
          restUntil(Infinity);
          continue;
        }
        if (m.turn === 'C') creatureMove();
        else {
          const tok = style.move(st, m, last, rng, day);
          t += 2500;
          o({ t, who: 'P', tok });
          last = { who: 'P', tok };
          yours++;
        }
      }
      // diagnostics: how much of your language is still in its memory (link to the right follower > 0.5)
      const kept = st.lang ? [...st.lang.next].filter(([a, bs]) => bs.some((b) => m.assoc.get([a], b) > 0.5)).length : NaN;
      const taught = st.lang ? st.lang.next.size : NaN;
      // left alone it falls asleep (if it hasn't), and dreams until the next session
      if (m.awake) {
        t = m.lastEntryT + Math.min(m.idleSleepMs(), 30 * MIN);
        o({ t, who: 'S', tok: SLEEP });
      }
      const next = s + 1 < SESSIONS.length ? START + day * 24 * HOUR + SESSIONS[s + 1] * HOUR : START + (day + 1) * 24 * HOUR + SESSIONS[0] * HOUR;
      if (SIM.onSleep && m.sleep) SIM.onSleep(m, st, day, s); // a wrapper can look at the dream
      restUntil(next - 1); // (this is where it measures, on waking)
      sessions.push({ day, s, yours, kept, taught, cont: cont.slice(), distinct: used.size, c: m.complexity ? { ...m.complexity } : null, n: m.complexityLog.length });
    });
  }
  return { m, sessions };
}

// ── run all styles ──
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const t0 = Date.now();
const results = {};
for (const [name, style] of Object.entries(STYLES)) {
  if (SIM.styles && !SIM.styles.includes(name)) continue;
  const runs = [];
  for (let c = 1; c <= CREATURES; c++) runs.push(live(style, c * 101 + name.length));
  results[name] = runs;
}

if (SIM.label) log(`=== ${SIM.label} ===`);
log(`${CREATURES} creatures per style · ${DAYS} days · sessions at ${SESSIONS.join(':00, ')}:00 · play until it nods off, then let it sleep\n`);
log('complexity = known signs × order, measured after dreams of 700+ signs; level 2 / 3 / 4 / 5 from 6 / 10 / 15 / 21\n');
for (const [name, runs] of Object.entries(results)) {
  log(`■ ${name} — ${STYLES[name].note}`);
  const perDay = [];
  for (let day = 0; day < DAYS; day++) {
    const ends = runs.map((r) => r.sessions.filter((x) => x.day === day).at(-1));
    const cs = ends.map((x) => x.c).filter(Boolean);
    const vals = cs.map((c) => c.value).sort((a, b) => a - b);
    const turns = mean(runs.map((r) => mean(r.sessions.filter((x) => x.day === day).map((x) => x.yours))));
    perDay.push(
      `  day ${day + 1}: complexity ${f(mean(vals))} (${f(vals[0], 0)}–${f(vals[vals.length - 1], 0)}) = ${f(mean(cs.map((c) => c.known)), 0)} known × ${f(100 * mean(cs.map((c) => c.order)), 0)}% order · level ${f(mean(vals.map((v) => levelFor(v, P.levelAt))), 1)} · measured ${cs.length}/${runs.length} · ${f(turns, 0)} of your signs per session`,
    );
  }
  log(perDay.join('\n'));
  const contAll = runs.flatMap((r) => r.sessions).reduce((a, x) => [a[0] + x.cont[0], a[1] + x.cont[1]], [0, 0]);
  const distinct = mean(runs.flatMap((r) => r.sessions.map((x) => x.distinct)));
  log(`  awake: continues your chain ${contAll[1] ? f((100 * contAll[0]) / contAll[1], 0) + '%' : '–'} of its replies · ${f(distinct, 0)} different signs of its own per session`);
  const traj = Array.from({ length: DAYS * SESSIONS.length }, (_, i) => mean(runs.map((r) => r.sessions[i].c?.value).filter((v) => v !== undefined)));
  log(`  by session: ${traj.map((v) => f(v, 0)).join(' ')}`);
  const kept = Array.from({ length: DAYS * SESSIONS.length }, (_, i) => mean(runs.map((r) => r.sessions[i].kept)));
  const taught = Array.from({ length: DAYS * SESSIONS.length }, (_, i) => mean(runs.map((r) => r.sessions[i].taught)));
  if (Number.isFinite(kept[0])) log(`  links of your language still in memory at bedtime / taught: ${kept.map((v, i) => f(v, 0) + '/' + f(taught[i], 0)).join(' ')}`);
  log('');
}
// a compact summary a wrapper can read (globalThis.SIM_RESULT)
globalThis.SIM_RESULT = Object.fromEntries(
  Object.entries(results).map(([name, runs]) => {
    const day = (d) => {
      const cs = runs.map((r) => r.sessions.filter((x) => x.day === d).at(-1).c).filter(Boolean);
      const vals = cs.map((c) => c.value);
      return { value: mean(vals), known: mean(cs.map((c) => c.known)), order: mean(cs.map((c) => c.order)), level: mean(vals.map((v) => levelFor(v, P.levelAt))), max: Math.max(...vals), at5: vals.filter((v) => levelFor(v, P.levelAt) >= 5).length, n: cs.length };
    };
    const ct = runs.flatMap((r) => r.sessions).reduce((a, x) => [a[0] + x.cont[0], a[1] + x.cont[1]], [0, 0]);
    return [name, { days: Array.from({ length: DAYS }, (_, d) => day(d)), cont: ct[1] ? ct[0] / ct[1] : NaN, distinct: mean(runs.flatMap((r) => r.sessions.map((x) => x.distinct))), traj: Array.from({ length: DAYS * SESSIONS.length }, (_, i) => mean(runs.map((r) => r.sessions[i].c?.value).filter((v) => v !== undefined))) }];
  }),
);
log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
