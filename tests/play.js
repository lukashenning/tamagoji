// Simulated play with rule checks (docs/08). Plays many sessions with a scripted player and checks,
// after every step, that the engine follows its rules. Run with:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/play.js

import { DEFAULT_PARAMS } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { BIRTH, SLEEP, WAKE, YES, NO, ASK, isElemental } from '../src/core/tokens.js';
import { mulberry32 } from '../src/core/rng.js';
import { hourlySet } from '../src/core/keyboard.js';
import { makeCharacter } from '../src/core/emojiIndex.js';
import { rngFor } from '../src/core/rng.js';

const log = globalThis.print || console.log;
const P = { ...DEFAULT_PARAMS };
const MIN = 60000;
const pct = (x) => (Number.isFinite(x) ? Math.round(x * 100) + '%' : '–');

const problems = new Map(); // rule -> { n, example }
const flag = (rule, example) => {
  const p = problems.get(rule) || { n: 0, example };
  p.n++;
  problems.set(rule, p);
};
const stats = { steps: 0, creature: {}, reactYes: [0, 0], reactNo: [0, 0], takenBack: 0, sleeps: 0, chains: 0 };
const bump = (k) => (stats.creature[k] = (stats.creature[k] || 0) + 1);

// The player: speaks a small language (a few chains), answers its signs with ✓ when it continued a
// chain, ✗ when it didn't, sometimes waits with ☐, sometimes says something random.
const LANG = [
  ['🐶', '🌞', '🦴', '🎾'],
  ['🍕', '🚗', '🌙'],
  ['🎈', '🐟', '🦄', '⭐', '🍎'],
];
function player(rng, m, last) {
  const r = rng();
  const prev = m.seq[m.seq.length - 1]?.tok;
  const prev2 = m.seq[m.seq.length - 2]?.tok;
  if (last && last.who === 'C' && !isElemental(last.tok)) {
    // judge its sign: did it continue a chain correctly?
    const ok = LANG.some((c) => c.some((x, i) => i > 0 && x === last.tok && c[i - 1] === prev2));
    if (r < 0.25) return ok ? YES : NO;
  }
  if (r < 0.4) return ASK;
  if (r < 0.45) return ['🧊', '🎻', '🌵', '🪁', '🥐'][Math.floor(rng() * 5)];
  // continue a chain from the last real sign, or start one
  for (const c of LANG) {
    const i = c.indexOf(prev);
    if (i >= 0 && i < c.length - 1) return c[i + 1];
  }
  return LANG[Math.floor(rng() * LANG.length)][0];
}

function play(seed, steps) {
  const rng = mulberry32(seed * 7919);
  const m = new Mind(P, seed);
  const history = [];
  let t = 1.7e12 + seed * 1e9;
  const o = (e) => {
    history.push(e);
    m.observe(e);
  };
  o({ t, who: 'S', tok: BIRTH, m: makeCharacter(rngFor(seed, 'character'), P.characterSize).join(' ') });
  let last = null;
  let waitRun = 0;
  for (let s = 0; s < steps; s++) {
    stats.steps++;
    t += 1500;
    if (!m.awake) {
      // sleep through, then wake
      t = m.sleep.restedAt + 1000;
      const dream = m.sleep.dream;
      if (dream.some((x) => !x || isElemental(x))) flag('dreams contain only real signs', dream.join(''));
      o({ t, who: 'S', tok: WAKE });
      if (m.turn !== 'P') flag('after waking it waits for you', m.turn);
      last = null;
      continue;
    }
    if (m.turn === 'C') {
      const before = { ev: m.lastEval, lastPlayer: m.lastPlayer, seqLen: m.seq.length, set: hourlySet(seed, t) };
      const d = m.decide(rng, t);
      const tok = d.tok;
      const who = tok === SLEEP ? 'S' : 'C';
      bump(d.m || (tok === YES ? '✓' : tok === NO ? '✗' : tok === ASK ? '☐' : tok === SLEEP ? 'sleep' : '?'));
      // rule checks for its move
      if (tok === YES || tok === NO) {
        if (before.lastPlayer !== 'sign') flag('its ✓/✗ only right after your real sign', `${tok} after ${before.lastPlayer}`);
        const ev = before.ev;
        if (tok === YES && ev && ev.p === 0) flag('its ✓ only for a sign it expected', `${tok} p=${ev.p}`);
        if (tok === NO && ev && ev.p >= P.reactYesAt) flag('no ✗ for a sign it expected enough for a ✓', `${tok} for ${ev.tok} p=${pct(ev.p)} · top ${ev.top} ${pct(ev.pTop)} · why: ${d.why.mode}`);
        if (tok === NO && ev && ev.p > 0 && !(ev.top !== ev.tok && ev.pTop >= P.reactNoTop && ev.p < P.reactNoBelow)) flag('its ✗ for an expected sign only when it strongly expected another', `p=${pct(ev.p)} top ${pct(ev.pTop)} · ${d.why.mode}`);
      }
      if (tok === ASK && before.lastPlayer === ASK) flag('no ☐ right after your ☐', '');
      if (d.m === 'surprise' && !before.set.includes(tok)) flag('surprises come from the hourly set', tok);
      if (tok === SLEEP) stats.sleeps++;
      o({ t, who, tok, ...(d.m ? { m: d.m } : {}) });
      last = { who, tok };
    } else {
      // your move
      const tok = player(rng, m, last);
      const ex = m.expect();
      const p = ex.probs.find(([x]) => x === tok)?.[1] ?? 0;
      const wasArmed = m.armed;
      const backBefore = m.takenBack.size;
      const levels = Math.min(P.levels, m.seq.length);
      const ctx = m.context();
      o({ t, who: 'P', tok });
      if (!isElemental(tok)) {
        if (Math.abs(m.lastEval.p - p) > 1e-9) flag('its recorded expectation = what it expected before your sign', `${p} vs ${m.lastEval.p}`);
        for (let L = 1; L <= levels; L++) {
          if (!m.assoc.table.get(L + '|' + ctx.slice(ctx.length - L).join('\u0001'))?.has(tok)) flag('your sign is linked on all levels', `L${L}`);
        }
        if (p >= P.reactYesAt) stats.reactYes[1]++;
        if (ex.probs[0] && ex.probs[0][0] !== tok && ex.probs[0][1] >= P.reactNoTop && p < P.reactNoBelow) stats.reactNo[1]++;
      }
      if (tok === YES && m.takenBack.size > backBefore) {
        stats.takenBack += m.takenBack.size - backBefore;
        if (!wasArmed) flag('take-back only after ✗ → its sign → ✓', '');
      }
      if (tok === ASK) waitRun++;
      else waitRun = 0;
      last = { who: 'P', tok };
    }
    // invariants
    if (m.seq.some((x) => isElemental(x.tok))) flag('special signs are never in the sequence', '');
    if (m.seq.some((x) => m.takenBack.has(x.h))) flag('taken-back signs are not in the sequence', '');
    if (m.energy > m.capacity + 1e-9) flag('energy within capacity', m.energy);
    if (new Set(m.seats.map((x) => x.tok)).size !== m.seats.length || m.seats.length !== P.seats) flag('6 distinct seats', m.seats.map((x) => x.tok).join(''));
  }
  // count its reactions against their opportunities
  for (let i = 1; i < history.length; i++) {
    if (history[i].who === 'C' && history[i].tok === YES) stats.reactYes[0]++;
    if (history[i].who === 'C' && history[i].tok === NO) stats.reactNo[0]++;
  }
  const again = Mind.replay({ seed, history }, P);
  const key = (x) => JSON.stringify([[...x.assoc.table].map(([k, v]) => [k, [...v]]), x.seq.map((e) => e.tok), x.seats]);
  if (key(again) !== key(m)) flag('replay rebuilds the same mind', `seed ${seed}`);
  return m;
}

const minds = [];
for (let seed = 1; seed <= 40; seed++) minds.push(play(seed, 1500));

log(`Simulated play: 40 creatures × 1500 steps = ${stats.steps} steps, ${stats.sleeps} times fell asleep.\n`);
log('Rule checks:');
const rules = [
  'its ✓/✗ only right after your real sign',
  'its ✓ only for a sign it expected',
  'no ✗ for a sign it expected enough for a ✓',
  'its ✗ for an expected sign only when it strongly expected another',
  'no ☐ right after your ☐',
  'surprises come from the hourly set',
  'its recorded expectation = what it expected before your sign',
  'your sign is linked on all levels',
  'take-back only after ✗ → its sign → ✓',
  'special signs are never in the sequence',
  'taken-back signs are not in the sequence',
  'energy within capacity',
  '6 distinct seats',
  'dreams contain only real signs',
  'after waking it waits for you',
  'replay rebuilds the same mind',
];
for (const r of rules) {
  const p = problems.get(r);
  log(`${p ? 'FAIL' : 'ok  '} ${r}${p ? ` — ${p.n}× e.g. ${p.example}` : ''}`);
}
for (const [r, p] of problems) if (!rules.includes(r)) log(`FAIL ${r} — ${p.n}× e.g. ${p.example}`);

const total = Object.values(stats.creature).reduce((a, b) => a + b, 0);
log('\nIts moves: ' + Object.entries(stats.creature).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n / total)}`).join(' · '));
log(`Its ✓: ${stats.reactYes[0]} (chances where your sign was ≥ 40% expected: ${stats.reactYes[1]}) · its ✗: ${stats.reactNo[0]} (chances where it strongly expected another: ${stats.reactNo[1]})`);
log(`"Not that, this": ${stats.takenBack} signs taken back`);
const avg = (f) => minds.reduce((a, m) => a + f(m), 0) / minds.length;
log(`Per creature: ${avg((m) => m.assoc.table.size).toFixed(0)} contexts known · ${avg((m) => m.outputs.length).toFixed(0)} outputs · seats e.g. ${minds[0].seats.map((x) => x.tok).join('')} · top ${minds[0].topSigns().slice(0, 8).map((r) => r.tok + r.uses).join(' ')}`);
log(problems.size ? `\n${problems.size} rule(s) FAILED` : '\nall rules held');
