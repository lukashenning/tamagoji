// Headless tests for the core logic. Run with macOS's built-in JavaScript engine:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run.js
// (or any engine with ES modules, e.g. `node tests/run.js` once Node is installed)

import { DEFAULT_PARAMS } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { BIRTH, WAIT, SLEEP, WAKE, PASS, YES, NO, ASK } from '../src/core/tokens.js';
import { mulberry32 } from '../src/core/rng.js';
import { ALL } from '../src/core/emojiIndex.js';

const log = globalThis.print || console.log;
let failed = 0;
function check(name, ok, detail = '') {
  log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

const P = { ...DEFAULT_PARAMS };
const MIN = 60000;

/** Simulate a scripted player against the creature, writing a real history. */
function simulate({ seed = 42, rounds = 600, playerPick, rngSeed = 7 }) {
  const rng = mulberry32(rngSeed);
  const save = { seed, history: [] };
  const mind = new Mind(P, seed);
  let t = Date.UTC(2026, 10, 23);
  const push = (e) => {
    save.history.push(e);
    mind.observe(e);
  };
  push({ t, who: 'S', tok: BIRTH });
  for (let i = 0; i < rounds; i++) {
    t += 3000;
    if (!mind.awake) {
      t = Math.max(t, mind.sleep.restedAt + 5000);
      push({ t, who: 'S', tok: WAKE });
    }
    if (mind.turn === 'C') {
      const d = mind.decide(rng);
      push({ t, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, m: d.m });
      continue;
    }
    const tok = playerPick(mind, rng, i);
    push({ t, who: 'P', tok });
  }
  return { save, mind };
}

function summary(m) {
  return JSON.stringify({
    seq: m.seq.length,
    stage: m.stage,
    complexity: m.complexity,
    energy: m.energy.toFixed(6),
    trust: Object.values(m.trust).map((x) => x.toFixed(6)),
    emo: Object.values(m.emo).map((x) => x.toFixed(6)),
    gut: m.gut.checksum().toFixed(6),
    habits: m.activeHabits.size,
  });
}

// 1. A pair teacher: answers 🌞 with 🌻, otherwise sends from a small set.
const teacher = (mind, rng) => {
  const last = mind.seq[mind.seq.length - 1];
  if (last === '🌞') return '🌻';
  const set = ['🌞', '🌞', '🐶', '🍎', '🎈', '🌙', '⭐'];
  return set[Math.floor(rng() * set.length)];
};

const t0 = Date.now();
const a = simulate({ playerPick: teacher, rounds: 1500 });
const simMs = Date.now() - t0;
check('simulation runs', a.mind.seq.length > 500, `${a.mind.seq.length} tokens, ${a.mind.sleepCount} sleeps, ${simMs} ms`);

// 2. Determinism: replaying the history rebuilds exactly the same mind.
const t1 = Date.now();
const replayed = Mind.replay(a.save, P);
const replayMs = Date.now() - t1;
check('replay is deterministic', summary(replayed) === summary(a.mind), `replay ${replayMs} ms`);

// 3. It learned the pair: after 🌞 it expects 🌻.
{
  const m = new Mind(P, 1);
  let t = 0;
  m.observe({ t, who: 'S', tok: BIRTH });
  for (let i = 0; i < 3; i++) {
    m.observe({ t: (t += 1000), who: 'C', tok: WAIT });
    m.observe({ t: (t += 1000), who: 'P', tok: '🌞' });
    m.observe({ t: (t += 1000), who: 'C', tok: WAIT });
    m.observe({ t: (t += 1000), who: 'P', tok: '🌻' });
  }
  m.observe({ t: (t += 1000), who: 'C', tok: WAIT });
  m.observe({ t: (t += 1000), who: 'P', tok: '🌞' });
  const pred = m.predict();
  check('learns 🌞 → 🌻 after 3 reps', pred.top === '🌻', `top=${pred.top} p=${(pred.dist.get('🌻') || 0).toFixed(2)} conf=${pred.conf.toFixed(2)}`);
}

// 4. Sleep timing: an exhausted creature needs ~60 min.
{
  const m = new Mind(P, 3);
  m.observe({ t: 0, who: 'S', tok: BIRTH });
  m.energy = 0;
  m.observe({ t: 1000, who: 'S', tok: SLEEP });
  const mins = (m.sleep.restedAt - m.sleep.start) / MIN;
  check('full recovery ≈ 60 min', Math.abs(mins - 60) < 1.5, `${mins.toFixed(1)} min, ${m.sleep.count} dream tokens`);
  m.observe({ t: 1000 + 30 * MIN, who: 'S', tok: WAKE });
  check('woken early is groggy', m.energy / m.capacity > 0.4 && m.energy / m.capacity < 0.6, `energy ${(m.energy / m.capacity).toFixed(2)}`);
}

// 5. Teacher run: stats.
{
  const m = a.mind;
  const rules = m.rules.filter((r) => !r.structural).slice(0, 5).map((r) => r.ctx.join('') + '→' + r.next);
  log(`     stage ${m.stage}, complexity ${m.complexity}, habits ${m.activeHabits.size}, vocab ${m.vocab.size}, rules: ${rules.join('  ')}`);
  log(`     trust ${JSON.stringify(Object.fromEntries(Object.entries(m.trust).map(([k, v]) => [k, +v.toFixed(2)])))}`);
  log(`     emotions ${JSON.stringify(Object.fromEntries(Object.entries(m.emo).map(([k, v]) => [k, +v.toFixed(2)])))}`);
  const creature = a.save.history.filter((e) => e.who === 'C').slice(-40).map((e) => (e.tok === WAIT ? '·' : e.tok)).join('');
  log(`     last creature moves: ${creature}`);
  check('grows past stage 0', m.stage >= 1);
  check('no NaN in emotions/energy', !Object.values(m.emo).some(Number.isNaN) && !Number.isNaN(m.energy));
}

// 6. Mirror player: always echoes the creature → echo voice gains trust.
{
  const mirror = (mind, rng) => {
    const last = mind.seq[mind.seq.length - 1];
    return last && rng() < 0.85 ? last : ALL[Math.floor(rng() * 40)];
  };
  const b = simulate({ playerPick: mirror, rounds: 800, seed: 9 });
  check('mirror player → echo voice trusted', b.mind.trust.echo > b.mind.trust.phrasebook * 0.8, JSON.stringify(Object.fromEntries(Object.entries(b.mind.trust).map(([k, v]) => [k, +v.toFixed(2)]))));
}

// 7. A random player (chaos) → no crashes, some passes.
{
  const chaos = (mind, rng) => (rng() < 0.1 ? PASS : ALL[Math.floor(rng() * ALL.length)]);
  const c = simulate({ playerPick: chaos, rounds: 600, seed: 11 });
  check('chaos player survives', c.mind.seq.length > 100, `unease=${c.mind.emo.unease.toFixed(2)} cause=${c.mind.uneaseCause}`);
}

// 8. Elemental signs: ✅ makes its move stick, ❌ makes it retry with something else, ❓ elaborates.
{
  const fresh = () => {
    const m = new Mind(P, 21);
    m.observe({ t: 0, who: 'S', tok: BIRTH, m: '🐸 🍄' });
    return m;
  };
  // ✅: it says 🌙 after your 🌞, you confirm twice → after 🌞 it expects 🌙
  const m = fresh();
  let t = 0;
  for (let i = 0; i < 2; i++) {
    m.observe({ t: (t += 1000), who: 'C', tok: WAIT });
    m.observe({ t: (t += 1000), who: 'P', tok: '🌞' });
    m.observe({ t: (t += 1000), who: 'C', tok: '🌙' });
    m.observe({ t: (t += 1000), who: 'P', tok: YES });
  }
  m.observe({ t: (t += 1000), who: 'C', tok: WAIT });
  m.observe({ t: (t += 1000), who: 'P', tok: '🌞' });
  const pr = m.predict();
  check('✅ makes its move stick', pr.top === '🌙', `top=${pr.top} conf=${pr.conf.toFixed(2)}`);
  check('✅ is not learned as content', !m.vocab.has(YES) && !m.seq.includes(YES));

  // ❌: it says 🌙, you reject → its retry avoids 🌙
  m.observe({ t: (t += 1000), who: 'C', tok: '🌙' });
  m.observe({ t: (t += 1000), who: 'P', tok: NO });
  const retries = new Set();
  for (let i = 0; i < 30; i++) retries.add(m.decide(mulberry32(i)).tok);
  check('❌ → retry avoids the rejected emoji', !retries.has('🌙') && m.decide(mulberry32(1)).m === 'retry', [...retries].join(''));

  // ❓: teach a chain 🍎🍐🍋, then ask after 🍎 → it elaborates more than one step
  const q = fresh();
  t = 0;
  for (let i = 0; i < 4; i++) {
    for (const tok of ['🍎', '🍐', '🍋']) {
      q.observe({ t: (t += 1000), who: 'C', tok: WAIT });
      q.observe({ t: (t += 1000), who: 'P', tok });
    }
  }
  q.observe({ t: (t += 1000), who: 'C', tok: WAIT });
  q.observe({ t: (t += 1000), who: 'P', tok: '🍎' });
  q.observe({ t: (t += 1000), who: 'C', tok: WAIT });
  q.observe({ t: (t += 1000), who: 'P', tok: ASK });
  const said = [];
  const rng = mulberry32(5);
  while (q.turn === 'C' && said.length < 10) {
    const d = q.decide(rng);
    said.push(d.tok);
    q.observe({ t: (t += 1000), who: 'C', tok: d.tok, m: d.m });
  }
  check('❓ → elaborates several steps', said.length >= 2 && said[0] === '🍐', said.join(' '));
}

log(failed ? `\n${failed} FAILED` : '\nall passed');
