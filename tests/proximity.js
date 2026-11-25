// Does dream proximity learning (D70) leave the sequence learning intact? Plays the same scripted
// sessions as tests/play.js with different proximity weights and compares, per setting:
//  - in play: how often its sign right after one of your chain signs continues that chain
//  - at the end: how much it expects the next chain sign after the chain so far (forward),
//    and how much it expects the previous chain sign after a chain sign alone (backward, the new tendency)
// Run with:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/proximity.js

import { DEFAULT_PARAMS } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { BIRTH, SLEEP, WAKE, isElemental } from '../src/core/tokens.js';
import { mulberry32, rngFor } from '../src/core/rng.js';
import { makeCharacter } from '../src/core/emojiIndex.js';
import { player, LANG } from './player.js';

const log = globalThis.print || console.log;
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const CREATURES = 40;
const STEPS = 1500;

function play(P, seed) {
  const rng = mulberry32(seed * 7919);
  const m = new Mind(P, seed);
  let t = 1.7e12 + seed * 1e9;
  m.observe({ t, who: 'S', tok: BIRTH, m: makeCharacter(rngFor(seed, 'character'), P.characterSize).join(' ') });
  let last = null;
  const cont = [0, 0]; // [continued the chain, chances]
  for (let s = 0; s < STEPS; s++) {
    t += 1500;
    if (!m.awake) {
      t = m.sleep.restedAt + 1000;
      m.observe({ t, who: 'S', tok: WAKE });
      last = null;
      continue;
    }
    if (m.turn === 'C') {
      const prev = last && last.who === 'P' && !isElemental(last.tok) ? last.tok : null;
      const d = m.decide(rng, t);
      if (prev) {
        const c = LANG.find((c) => c.indexOf(prev) >= 0 && c.indexOf(prev) < c.length - 1);
        if (c) {
          cont[1]++;
          if (d.tok === c[c.indexOf(prev) + 1]) cont[0]++;
        }
      }
      m.observe({ t, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
      last = { who: 'C', tok: d.tok };
    } else {
      const tok = player(rng, m, last);
      m.observe({ t, who: 'P', tok });
      last = { who: 'P', tok };
    }
  }
  // what it expects now
  const r = { fwd: 0, fwdTop: 0, fwd1: 0, back: 0, backTop: 0, n: 0 };
  const prob = (ctx, tok) => m.expect(ctx).probs.find(([x]) => x === tok)?.[1] ?? 0;
  const top = (ctx) => m.expect(ctx).probs[0]?.[0];
  for (const c of LANG) {
    for (let i = 0; i < c.length - 1; i++) {
      const ctx = c.slice(Math.max(0, i - 3), i + 1);
      r.n++;
      r.fwd += prob(ctx, c[i + 1]);
      r.fwdTop += top(ctx) === c[i + 1] ? 1 : 0;
      r.fwd1 += prob([c[i]], c[i + 1]);
      r.back += prob([c[i + 1]], c[i]);
      r.backTop += top([c[i + 1]]) === c[i] ? 1 : 0;
    }
  }
  return { cont, r, dreamt: m.stats.dreamLearned };
}

const weights = [0, 0.02, 0.04, 0.06, 0.1];
log(`${CREATURES} creatures × ${STEPS} steps per setting (same seeds)\n`);
log('proximity │ in play: continues │ at the end: next after chain │ next after 1 sign │ previous after 1 sign');
log('weight    │ your chain         │  expected   top choice       │  expected         │  expected   top choice');
for (const w of weights) {
  const P = { ...DEFAULT_PARAMS, proximityWeight: w };
  const sum = { c: [0, 0], fwd: 0, fwdTop: 0, fwd1: 0, back: 0, backTop: 0, n: 0 };
  for (let seed = 1; seed <= CREATURES; seed++) {
    const { cont, r } = play(P, seed);
    sum.c[0] += cont[0];
    sum.c[1] += cont[1];
    for (const k of ['fwd', 'fwdTop', 'fwd1', 'back', 'backTop', 'n']) sum[k] += r[k];
  }
  log(
    `${w.toFixed(2).padEnd(9)} │ ${pct(sum.c[0] / sum.c[1]).padEnd(18)} │ ${pct(sum.fwd / sum.n)}     ${pct(sum.fwdTop / sum.n)}           │ ${pct(sum.fwd1 / sum.n)}            │ ${pct(sum.back / sum.n)}     ${pct(sum.backTop / sum.n)}`,
  );
}
