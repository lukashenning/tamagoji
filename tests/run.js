// Headless tests for the core logic. Run with macOS's built-in JavaScript engine:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run.js

import { DEFAULT_PARAMS } from '../src/core/params.js';
import { Mind, wakeChance } from '../src/core/mind.js';
import { BIRTH, WAIT, SLEEP, WAKE, PASS, YES, NO, ASK, SEP } from '../src/core/tokens.js';
import { mulberry32 } from '../src/core/rng.js';
import { ALL } from '../src/core/emojiIndex.js';
import { hourlySet } from '../src/core/keyboard.js';
import { melodyFor, melodyNotes, melodyText, keyOf } from '../src/core/melody.js';
import { voiceFor, voiceText, DEFAULT_VOICE } from '../src/core/voice.js';
import { pruneHistory } from '../src/ui/store.js';

const log = globalThis.print || console.log;
let failed = 0;
function check(name, ok, detail = '') {
  log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

const P = { ...DEFAULT_PARAMS };
const MIN = 60000;

function fresh(seed = 1) {
  const m = new Mind(P, seed);
  const t = { v: 0 };
  const o = (who, tok, mm) => m.observe({ t: (t.v += 1000), who, tok, ...(mm ? { m: mm } : {}) });
  o('S', BIRTH);
  return { m, o, t };
}
/** Teach a sequence by demonstrating it while the creature waits. */
function demo(o, toks) {
  for (const tok of toks) {
    o('C', WAIT);
    o('P', tok);
  }
}
const weightOf = (m, ctx, next) => {
  const r = m.mem.rowAt(ctx.join(SEP));
  const it = r && r.items.find(([t]) => t === next);
  return it ? it[1] : 0;
};

/** Simulate a scripted player against the creature, writing a real history. */
function simulate({ seed = 42, rounds = 1500, playerPick, rngSeed = 7 }) {
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
    push({ t, who: 'P', tok: playerPick(mind, rng) });
  }
  return { save, mind };
}

// 1. a pair teacher: answers 🌞 with 🌻, praises 🌻 after 🌞
const teacher = (mind, rng) => {
  const last = mind.seq[mind.seq.length - 1];
  const prev = mind.seq[mind.seq.length - 2];
  if (mind.seqWho[mind.seq.length - 1] === 'C' && prev === '🌞' && last === '🌻') return YES;
  if (last === '🌞') return '🌻';
  return ['🌞', '🌞', '🐶', '🍎', '🎈', '🌙', '⭐'][Math.floor(rng() * 7)];
};
const t0 = Date.now();
const a = simulate({ playerPick: teacher });
check('simulation runs', a.mind.seq.length > 500 && a.mind.sleepCount > 3, `${a.mind.seq.length} emojis, ${a.mind.sleepCount} sleeps, ${Date.now() - t0} ms`);
const t1 = Date.now();
const r = Mind.replay(a.save, P);
const sig = (m) => JSON.stringify([m.seq.length, m.mem.size, m.energy.toFixed(6), m.stats, weightOf(m, ['🌞'], '🌻').toFixed(6)]);
check('replay is deterministic', sig(r) === sig(a.mind), `replay ${Date.now() - t1} ms`);
{
  const pr = a.mind.mem.predict(['🌞']);
  check('teacher: after 🌞 it expects 🌻', pr.top === '🌻', `${pct(pr.dist.get('🌻') * pr.conf)}`);
}

// 2. learns a pair after 3 repetitions
{
  const { m, o } = fresh();
  for (let i = 0; i < 3; i++) demo(o, ['🌞', '🌻']);
  o('C', WAIT);
  o('P', '🌞');
  const pr = m.predict();
  check('learns 🌞 → 🌻 after 3 reps', pr.top === '🌻', `conf ${pct(pr.conf)}`);
}

// 3. ✅ reinforces its reaction (link to the emoji it answered and to the sequence it answered); ❌ halves it
{
  const { m, o } = fresh();
  demo(o, ['🐸', '🌞']);
  o('C', '🌙'); // it says 🌙 after 🐸 🌞
  const before = [weightOf(m, [], '🌙'), weightOf(m, ['🌞'], '🌙'), weightOf(m, ['🐸', '🌞'], '🌙')];
  o('P', YES);
  const after = [weightOf(m, [], '🌙'), weightOf(m, ['🌞'], '🌙'), weightOf(m, ['🐸', '🌞'], '🌙')];
  check('✅ strengthens link + sequence, not the emoji in general', after[1] >= before[1] + P.yesWeight - 1e-9 && after[2] >= before[2] + P.yesWeight - 1e-9 && after[0] === before[0], `emoji/link/sequence ${before.map((x) => x.toFixed(1))} → ${after.map((x) => x.toFixed(1))}`);
  check('✅ is not part of the patterns', !m.vocab.has(YES) && !m.seq.includes(YES));
  const linkBefore = weightOf(m, ['🌞'], '🌙');
  demo(o, ['🐸', '🌞']);
  o('C', '🌙');
  o('P', NO);
  const linkAfter = weightOf(m, ['🌞'], '🌙');
  check('❌ halves its reaction', linkAfter <= linkBefore * P.noFactor, `🌞→🌙 ${linkBefore.toFixed(2)} → ${linkAfter.toFixed(2)}`);
  const retries = new Set();
  for (let i = 0; i < 30; i++) retries.add(m.decide(mulberry32(i)).tok);
  check('❌ → retry avoids the rejected emoji', !retries.has('🌙') && m.decide(mulberry32(1)).m === 'retry', [...retries].join(''));
}

// 4. ❓: one best guess, then it waits
{
  const { m, o } = fresh();
  for (let i = 0; i < 4; i++) demo(o, ['🍎', '🍐', '🍋', '🍇']);
  demo(o, ['🍎']);
  o('C', WAIT);
  o('P', ASK);
  const said = [];
  const rng = mulberry32(5);
  while (m.turn === 'C' && said.length < 10) {
    const d = m.decide(rng);
    said.push(d.tok);
    m.observe({ t: 1e9 + said.length, who: 'C', tok: d.tok, m: d.m });
  }
  check('❓ → one best guess, then your turn', said.join('') === '🍐' && m.turn === 'P', said.join(' '));
  // several ❓ in a row → a total surprise becomes likely
  let surprises = 0;
  o('P', ASK); // 2nd ❓ in a row (its 🍐 came in between)
  for (let i = 0; i < 200; i++) if (m.decide(mulberry32(100 + i)).m === 'surprise') surprises++;
  const second = surprises / 200;
  m.observe({ t: 2e9, who: 'C', tok: '🍋' });
  o('P', ASK); // 3rd
  surprises = 0;
  for (let i = 0; i < 200; i++) if (m.decide(mulberry32(300 + i)).m === 'surprise') surprises++;
  check('❓ several times in a row → surprise gets likelier', second > 0.2 && surprises / 200 > second, `2nd ❓: ${pct(second)} · 3rd ❓: ${pct(surprises / 200)}`);
}

// 4b. surprises come from the current hourly keyboard set (unused ones first)
{
  const { m, o, t } = fresh(5);
  for (let i = 0; i < 30; i++) {
    o('P', '🍕');
    o('C', '🍕');
  }
  o('P', '🍕');
  const set = hourlySet(5, t.v);
  const picks = [];
  for (let i = 0; i < 300; i++) {
    const d = m.decide(mulberry32(i), t.v);
    if (d.m === 'surprise' || d.m === 'new') picks.push(d.tok);
  }
  const ok = picks.length > 20 && picks.every((e) => set.includes(e) && !m.vocab.has(e));
  check('new emojis and surprises come from the hourly keyboard set', ok, `${picks.length} of 300 replies were new/surprises, all from this hour's 25: ${[...new Set(picks)].slice(0, 10).join('')}`);
}

// 5. context matters: after 🐶🌞 comes 🦴, after 🐱🌞 comes 🐟
{
  const { m, o } = fresh();
  for (let i = 0; i < 4; i++) {
    demo(o, ['🐶', '🌞', '🦴']);
    demo(o, ['🐱', '🌞', '🐟']);
  }
  const a1 = m.mem.predict(['🐶', '🌞']);
  const a2 = m.mem.predict(['🐱', '🌞']);
  check('longer context changes the answer', a1.top === '🦴' && a2.top === '🐟', `🐶🌞→${a1.top} · 🐱🌞→${a2.top}`);
}

// 6. sleep: ~60 min to recover, dream learning on waking (as far as it got)
{
  const { m, o, t } = fresh(3);
  for (let i = 0; i < 6; i++) demo(o, ['🌞', '🌻']);
  m.energy = 0;
  const w0 = weightOf(m, ['🌞'], '🌻');
  m.observe({ t: (t.v += 1000), who: 'S', tok: SLEEP });
  const mins = (m.sleep.restedAt - m.sleep.start) / MIN;
  check('full recovery ≈ 60 min', Math.abs(mins - 60) < 1.5, `${mins.toFixed(1)} min, ${m.sleep.count} dream emojis: ${m.sleep.dream.slice(0, 12).join('')}…`);
  m.observe({ t: t.v + 61 * MIN, who: 'S', tok: WAKE });
  const w1 = weightOf(m, ['🌞'], '🌻');
  check('dreaming solidifies the pattern', w1 > w0, `🌞→🌻 weight ${w0.toFixed(2)} → ${w1.toFixed(2)} (learned ${m.stats.dreamLearned} dreamed emojis)`);
  // woken early: only part of the dream is learned
  const e = fresh(4);
  e.m.energy = 0;
  e.m.observe({ t: (e.t.v += 1000), who: 'S', tok: SLEEP });
  e.m.observe({ t: e.t.v + 30 * MIN, who: 'S', tok: WAKE, m: 'manual' });
  check('woken early: groggy, learned half the dream', Math.abs(e.m.energy / e.m.capacity - 0.5) < 0.05 && e.m.stats.dreamLearned > 500 && e.m.stats.dreamLearned < 700, `energy ${(e.m.energy / e.m.capacity).toFixed(2)}, learned ${e.m.stats.dreamLearned}`);
}

// 6b. loop avoidance: it rarely replays a 3-emoji sequence from the last few emojis
{
  const { m, o } = fresh(8);
  for (let i = 0; i < 4; i++) demo(o, ['🌞', '🌻']);
  o('C', WAIT);
  o('P', '🌞'); // conversation ends …🌞 🌻 🌞 → saying 🌻 now would repeat "🌻 🌞 🌻"
  const count = (penalty) => {
    m.p = { ...P, loopStrength: penalty };
    let n = 0;
    for (let i = 0; i < 300; i++) if (m.decide(mulberry32(i)).tok === '🌻') n++;
    return n / 300;
  };
  const off = count(0);
  const on = count(P.loopStrength);
  m.p = P;
  check('loop avoidance makes replaying a recent sequence rarer', on < off * 0.6, `🌻: ${pct(off)} without → ${pct(on)} with`);
}

// 6b2. loops of any length: a two-emoji loop (A B A B …) and one emoji over and over get broken
{
  const loopShare = (toks, next) => {
    const { m, o } = fresh(12);
    for (let i = 0; i < 3; i++) demo(o, ['🍎', '🍐', '🍋', '🍇', '🍓']); // some other knowledge
    demo(o, toks);
    o('C', WAIT);
    o('P', toks[toks.length - 1]);
    let n = 0;
    for (let i = 0; i < 300; i++) if (m.decide(mulberry32(i)).tok === next) n++;
    m.p = { ...P, loopStrength: 0 };
    let off = 0;
    for (let i = 0; i < 300; i++) if (m.decide(mulberry32(i)).tok === next) off++;
    m.p = P;
    return [off / 300, n / 300];
  };
  const [aOff, aOn] = loopShare(['🌞', '🌻', '🌞', '🌻', '🌞', '🌻', '🌞'], '🌻');
  check('two-emoji loop gets broken', aOn < aOff * 0.3, `continuing 🌞🌻🌞🌻…: ${pct(aOff)} without → ${pct(aOn)} with loop avoidance`);
  const [bOff, bOn] = loopShare(['🐸', '🐸', '🐸', '🐸', '🐸', '🐸'], '🐸');
  check('one emoji over and over gets broken', bOn < bOff * 0.3, `another 🐸: ${pct(bOff)} without → ${pct(bOn)} with`);
}

// 6b3. dreams don't get stuck in loops
{
  const { m, o, t } = fresh(13);
  for (let i = 0; i < 6; i++) demo(o, ['🌞', '🌻']); // a strong pair
  for (let i = 0; i < 2; i++) demo(o, ['🍎', '🍐', '🐶', '🦴', '🎈', '🌙']); // and some other things
  m.energy = 0;
  m.observe({ t: (t.v += 1000), who: 'S', tok: SLEEP });
  const d = m.sleep.dream.filter(Boolean);
  let twoLoop = 0;
  for (let i = 2; i < d.length; i++) if (d[i] === d[i - 2] && d[i - 1] === d[i - 3]) twoLoop++;
  const pairShare = d.filter((x) => x === '🌞' || x === '🌻').length / d.length;
  check('dream does not loop', twoLoop / d.length < 0.2 && pairShare < 0.6, `two-emoji loop steps ${pct(twoLoop / d.length)}, 🌞/🌻 share ${pct(pairShare)}: ${d.slice(0, 24).join('')}…`);
}

// 6c. repetition → surprise: in a repetitive conversation, a totally new emoji becomes much likelier
{
  const share = (toks, last) => {
    const { m, o } = fresh(9);
    demo(o, toks);
    o('C', WAIT);
    o('P', last);
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const d = m.decide(mulberry32(i));
      if (d.m === 'surprise' || d.m === 'new') n++;
    }
    return { p: n / 300, rep: m.repetitiveness() };
  };
  const varied = share(['🍎', '🐶', '🌙', '🎈', '🚗', '⭐', '🎵', '🌊', '🍕', '🐸'], '🦋');
  const loopy = share(['🌞', '🌻', '🌞', '🌻', '🌞', '🌻', '🌞', '🌻', '🌞', '🌻'], '🌞');
  check('repetition → surprising new emojis', loopy.p > 0.3 && loopy.p > varied.p * 2, `varied: ${pct(varied.p)} (repetition ${pct(varied.rep)}) · repetitive: ${pct(loopy.p)} (repetition ${pct(loopy.rep)})`);
}

// 6d. complexity: varied, reinforced patterns raise it; spamming many random emojis does not
{
  const spam = fresh(20);
  for (let i = 0; i < 300; i++) demo(spam.o, [ALL[(i * 37) % ALL.length]]); // 300 inputs, ~300 different emojis
  const loop = fresh(21);
  for (let i = 0; i < 25; i++) demo(loop.o, ['🌞', '🌻', '🌙']); // one repeated chain
  const varied = fresh(22);
  const pairs = [['🌞', '🌻'], ['🌞', '🌙'], ['🌻', '🐝'], ['🌙', '⭐'], ['🐝', '🌻'], ['⭐', '🌞'], ['🌻', '🌞'], ['🌙', '🌞'], ['🐝', '🍯'], ['🍯', '🐝']];
  for (let i = 0; i < 5; i++) for (const pr of pairs) demo(varied.o, pr);
  const [cs, cl, cv] = [spam.m.complexity(), loop.m.complexity(), varied.m.complexity()];
  check('complexity: spam stays ~0, varied patterns score highest', cs.score < 1 && cv.score > cl.score && cl.score > cs.score, `spam ${cs.score.toFixed(1)} (${spam.m.vocab.size} emojis) · one chain ${cl.score.toFixed(1)} · varied ${cv.score.toFixed(1)} (${cv.signs} emojis)`);

  // appearance basis: filled from its strongest pattern emojis, stable across sleeps
  const m = varied.m;
  const t = { v: 1e7 };
  const sleepWake = () => {
    m.energy = m.capacity * 0.5;
    m.observe({ t: (t.v += 1000), who: 'S', tok: SLEEP });
    m.observe({ t: (t.v += 61 * MIN), who: 'S', tok: WAKE });
  };
  sleepWake();
  const look1 = JSON.stringify(m.look);
  demo(varied.o, ['🐸', '🎈']); // a little new input
  sleepWake();
  const look2 = JSON.stringify(m.look);
  const slots = Object.keys(m.look).length;
  check('look: slots filled from pattern emojis, stable after a small change', slots >= 3 && look1 === look2, Object.entries(m.look).map(([k, x]) => `${k} ${x.emoji} (shape ${x.shape}, ${x.color})`).join(' · '));
  const baby = fresh(23).m;
  check('look: a newborn looks like its seed character', baby.look.face && baby.character.includes(baby.look.face.emoji), `face ${baby.look.face && baby.look.face.emoji} from ${baby.character.join('')}`);
}

// 6e. melodies: 5 steps, first and last always sound, same emoji = same melody, diatonic in its key
{
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const sample = ALL.slice(0, 400);
  const ok = [...sample, YES, NO, ASK].every((e) => {
    const mel = melodyFor(e);
    const sounding = melodyNotes(e).filter((m) => m !== null);
    if (Math.max(...sounding) - Math.min(...sounding) > 12) return false; // within an octave
    const key = keyOf(e);
    const inKey = melodyNotes(e).every((m) => m === null || MAJOR.includes((((m - key) % 12) + 12) % 12));
    return mel.length === 5 && mel[0] && mel[4] && inKey && JSON.stringify(mel) === JSON.stringify(melodyFor(e));
  });
  const distinct = new Set(sample.map((e) => JSON.stringify(melodyFor(e)))).size;
  const fixed = melodyText(YES) === 'G6 · · · C7' && melodyText(NO) === 'G6 · · · C6' && melodyText(ASK) === 'E6 · E6 · E6';
  const sameKey = keyOf('😀') === keyOf('😃') && keyOf('🐶') !== keyOf('😀');
  check('melodies: 5 diatonic notes in the section key, ✅ ❌ ❓ fixed', ok && fixed && sameKey && distinct > 300, `${distinct} different melodies for 400 emojis · ✅ ${melodyText(YES)} · ❌ ${melodyText(NO)} · ❓ ${melodyText(ASK)} · 😀 ${melodyText('😀')} · 😃 ${melodyText('😃')} · 🐶 ${melodyText('🐶')}`);
}

// 6f. voice: follows the look; locked slots keep the default; different creatures sound different
{
  const babies = Array.from({ length: 16 }, (_, i) => fresh(i + 1).m);
  const voices = babies.map((b) => voiceFor(b.look));
  const onlyFace = voices.every((v, i) => !babies[i].look.extremities && v.length === DEFAULT_VOICE.length && v.glide === DEFAULT_VOICE.glide);
  const instruments = new Set(voices.map((v) => v.instrument)).size;
  const full = { face: { shape: 1, color: '#bcd9f2' }, extremities: { shape: 0 }, hair: { shape: 7 }, object: { shape: 7 } };
  const v = voiceFor(full);
  const ok = v.instrument === 'bell' && v.length === 0.35 && v.glide === 0.08 && v.wobble === 0.03 && JSON.stringify(voiceFor(full)) === JSON.stringify(v);
  check('voice: instrument from the look, richer as slots unlock', onlyFace && instruments >= 5 && ok, `${instruments} of 8 instruments among 16 newborns · grown example: ${voiceText(v)}`);
}

// 6f. storage: pruning drops the oldest sessions but keeps the birth entry
{
  const save = { seed: 1, history: [{ t: 0, who: 'S', tok: BIRTH, m: '🐸' }] };
  for (let d = 0; d < 10; d++) {
    save.history.push({ t: d * 10, who: 'S', tok: WAKE });
    for (let i = 0; i < 9; i++) save.history.push({ t: d * 10 + i, who: 'P', tok: '🌞' });
  }
  const before = save.history.length;
  const removed = pruneHistory(save);
  check('pruning drops the oldest sessions, keeps birth', removed > 0 && save.history[0].tok === BIRTH && save.history[1].tok === WAKE && save.history.length === before - removed, `${before} → ${save.history.length} entries`);
}

// 6g. waking it with a sign: never when exhausted, 70% at 70% energy, always when full
{
  const c = [0.05, 0.1, 0.4, 0.7, 0.9, 1].map((f) => wakeChance(f, P));
  check('wake chance by energy', c[0] === 0 && c[1] === 0 && Math.abs(c[3] - 0.7) < 1e-9 && c[2] > 0.3 && c[2] < 0.4 && c[4] > 0.9 && c[5] === 1, ['5%', '10%', '40%', '70%', '90%', '100%'].map((l, i) => `${l} → ${pct(c[i])}`).join(' · '));
}

// 7. ❤️ is an ordinary emoji now
{
  const { m, o } = fresh();
  demo(o, ['❤️']);
  check('❤️ is ordinary content', m.seq.includes('❤️'));
  demo(o, ['💬']);
  check('💬 is ordinary content now', m.seq.includes('💬'));
}

// 8. a random player (chaos) → no crashes
{
  const chaos = (mind, rng) => (rng() < 0.1 ? PASS : rng() < 0.15 ? [YES, NO, ASK][Math.floor(rng() * 3)] : ALL[Math.floor(rng() * ALL.length)]);
  const c = simulate({ playerPick: chaos, rounds: 800, seed: 11 });
  check('chaos player survives', c.mind.seq.length > 100 && !Number.isNaN(c.mind.energy), `${c.mind.seq.length} emojis`);
}

function pct(x) {
  return Number.isFinite(x) ? Math.round(x * 100) + '%' : '–';
}
log(failed ? `\n${failed} FAILED` : '\nall passed');
