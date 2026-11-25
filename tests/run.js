// Headless tests for the core logic (the sign engine, docs/08). Run with macOS's built-in JavaScript engine:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run.js

import { DEFAULT_PARAMS } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { BIRTH, SLEEP, WAKE, YES, NO, ASK, SEP } from '../src/core/tokens.js';
import { mulberry32 } from '../src/core/rng.js';
import { ALL } from '../src/core/emojiIndex.js';
import { hourlySet } from '../src/core/keyboard.js';
import { melodyFor, melodyNotes, melodyText, keyOf } from '../src/core/melody.js';
import { voiceFor, voiceText, nearestArchetype } from '../src/core/voice.js';
import { pruneHistory } from '../src/ui/store.js';

const log = globalThis.print || console.log;
let failed = 0;
function check(name, ok, detail = '') {
  log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}
function pct(x) {
  return Number.isFinite(x) ? Math.round(x * 100) + '%' : '–';
}

const P = { ...DEFAULT_PARAMS, decayPerTurn: 0 }; // exact link values; fading is tested on its own
const MIN = 60000;

/** A newborn with a history we can append to. */
function fresh(seed = 1, params = P) {
  const m = new Mind(params, seed);
  const history = [];
  const t = { v: 1e12 };
  const o = (who, tok, mm) => {
    const e = { t: (t.v += 1000), who, tok, ...(mm ? { m: mm } : {}) };
    history.push(e);
    m.observe(e);
  };
  o('S', BIRTH);
  return { m, o, t, history };
}
/** You say a sequence of signs in a row (no special signs in between: the chain stays whole). */
function say(o, toks) {
  for (const tok of toks) o('P', tok);
}
/** You show a sequence while it waits (its ☐ between your signs: only level-1 links form). */
function demo(o, toks) {
  for (const tok of toks) {
    o('C', ASK);
    o('P', tok);
  }
}
const link = (m, ctx, sign) => m.assoc.get(ctx, sign);
const top = (m) => m.expect().probs[0]?.[0] ?? null;

// 1. learning on 4 levels: your sign strengthens its links to the 1…4 signs before it; repeats add
{
  const { m, o } = fresh();
  say(o, ['🍎', '🍐', '🍋', '🍇', '🍓']);
  say(o, ['🍎', '🍐', '🍋', '🍇', '🍓']);
  const l = [link(m, ['🍇'], '🍓'), link(m, ['🍋', '🍇'], '🍓'), link(m, ['🍐', '🍋', '🍇'], '🍓'), link(m, ['🍎', '🍐', '🍋', '🍇'], '🍓')];
  const noL5 = !m.assoc.table.has('5|' + ['🍎', '🍐', '🍋', '🍇'].join(SEP));
  check('your sign: +1 on levels 1–4, repeats add', l.every((x) => x === 2) && noL5, `🍓 after 🍇 / 🍋🍇 / 🍐🍋🍇 / 🍎🍐🍋🍇: ${l.join(' / ')}`);
}

// 2. special signs are never context, and they cut chains: levels 2–4 only learn uninterrupted chains
{
  const { m, o } = fresh();
  say(o, ['🧊', '🐶']);
  o('C', '🦴');
  o('P', YES);
  o('C', ASK);
  o('P', ASK);
  o('C', '🎾');
  o('P', '🌞');
  const skipped = m.seq.every((x) => ![YES, NO, ASK].includes(x.tok));
  const cut = link(m, ['🎾'], '🌞') === 1 && link(m, ['🦴', '🎾'], '🌞') === 0 && link(m, ['🧊', '🐶'], '🦴') === 3;
  // your example: Z A B C D strengthens ZABC→D … C→D, but Z A ✗ B C D only BC→D and C→D
  const a = fresh();
  say(a.o, ['🇿', '🅰️', '🅱️', '©️', '🇩']);
  const whole = [['©️'], ['🅱️', '©️'], ['🅰️', '🅱️', '©️'], ['🇿', '🅰️', '🅱️', '©️']].map((c) => link(a.m, c, '🇩'));
  const b = fresh();
  say(b.o, ['🇿', '🅰️']);
  b.o('P', NO);
  say(b.o, ['🅱️', '©️', '🇩']);
  const broken = [['©️'], ['🅱️', '©️'], ['🅰️', '🅱️', '©️'], ['🇿', '🅰️', '🅱️', '©️']].map((c) => link(b.m, c, '🇩'));
  const expectsAcross = b.m.expect(['🅰️', '🅱️', '©️']).levels.length === 3;
  check('✓ ✗ ☐ are never context and cut chains (levels 2–4)', skipped && cut && whole.join() === '1,1,1,1' && broken.join() === '1,1,0,0' && expectsAcross, `ZABCD → D on levels 1–4: ${whole.join(' ')} · ZA✗BCD: ${broken.join(' ')} · 🐶 🦴 ✓ ☐ ☐ 🎾 🌞: 🎾→🌞 ${link(m, ['🎾'], '🌞')}, 🦴🎾→🌞 ${link(m, ['🦴', '🎾'], '🌞')}`);
}

// 3. longer contexts count more: a 4-sign context seen twice outvotes a 1-sign link seen 20 times
{
  const { m, o } = fresh();
  for (let i = 0; i < 20; i++) say(o, ['🎈', '🌙', '🐟']); // after 🐟 usually 🎈 …
  for (let i = 0; i < 2; i++) say(o, ['🍕', '🚗', '🌙', '🐟', '🦄']); // … but after 🍕🚗🌙🐟 comes 🦄
  say(o, ['🍕', '🚗', '🌙', '🐟']);
  const ex = m.expect();
  check('a specific 4-sign context outvotes a common 1-sign link', ex.probs[0][0] === '🦄', ex.probs.slice(0, 3).map(([t, q]) => `${t} ${pct(q)}`).join(' · ') + ` · votes 🦄 ${ex.votes.get('🦄').toFixed(1)} / 🎈 ${ex.votes.get('🎈').toFixed(1)}`);
}

// 4. ✓ +3 / ✗ −3 on the last real sign, on all levels; links can go negative
{
  const { m, o } = fresh();
  say(o, ['🐶', '🌞']);
  o('C', '🦴');
  o('P', YES);
  const plus = [link(m, ['🌞'], '🦴'), link(m, ['🐶', '🌞'], '🦴')];
  const g = fresh();
  say(g.o, ['🦴', '🐶']);
  g.o('C', '🌞');
  g.o('P', NO);
  const minus = link(g.m, ['🦴', '🐶'], '🌞');
  check('✓ +3 / ✗ −3 on the last real sign (all levels)', plus[0] === 3 && plus[1] === 3 && minus === -3, `🌞→🦴 ${plus[0]} · 🐶🌞→🦴 ${plus[1]} · 🦴🐶→🌞 ${minus}`);
}

// 5. its own ✓ / ✗ acts like yours; your ✗ right after it inverts it, your ✓ repeats it
{
  const a = fresh();
  a.o('C', ASK);
  a.o('P', '🐶');
  a.o('C', '🦴');
  a.o('P', '🎾');
  a.o('C', YES); // its ✓ on your 🎾 after 🦴
  const afterIts = link(a.m, ['🦴'], '🎾');
  a.o('P', NO); // you invert it
  const inverted = link(a.m, ['🦴'], '🎾');
  const b = fresh();
  b.o('C', ASK);
  b.o('P', '🐶');
  b.o('C', '🦴');
  b.o('P', '🎾');
  b.o('C', YES);
  b.o('P', YES); // you strengthen it
  const repeated = link(b.m, ['🦴'], '🎾');
  check('its ✓: your ✗ inverts it, your ✓ repeats it', afterIts === 4 && inverted === -2 && repeated === 7, `🦴→🎾: 1 + its ✓ = ${afterIts} · then your ✗ → ${inverted} · or your ✓ → ${repeated}`);
}

// 6. "not that, this": A ✗ B ✓ takes A back, so B is linked to what came before A
{
  const { m, o } = fresh();
  o('C', ASK);
  o('P', '🐶');
  o('C', '🦴'); // A
  o('P', NO);
  o('C', '🎾'); // B
  o('P', YES);
  const toks = m.seq.map((x) => x.tok).join('');
  const ok = toks === '🐶🎾' && link(m, ['🐶'], '🎾') === 3 && link(m, ['🦴'], '🎾') === 0 && link(m, ['🐶'], '🦴') === -3 && m.takenBack.size === 1 && !m.outputs.some((x) => x.tok === '🦴');
  // ✗ twice: A ✗ B ✗ C ✓ takes back A and B
  const f = fresh();
  f.o('C', ASK);
  f.o('P', '🐶');
  f.o('C', '🦴');
  f.o('P', NO);
  f.o('C', '🎾');
  f.o('P', NO);
  f.o('C', '🌞');
  f.o('P', YES);
  const toks2 = f.m.seq.map((x) => x.tok).join('');
  // without the ✓ nothing is taken back
  const g = fresh();
  g.o('C', ASK);
  g.o('P', '🐶');
  g.o('C', '🦴');
  g.o('P', NO);
  g.o('C', '🎾');
  g.o('P', '🍕');
  const toks3 = g.m.seq.map((x) => x.tok).join('');
  // the retried sign joins the chain before the rejected one, on the higher levels too
  const h = fresh();
  say(h.o, ['🌙', '🐶']);
  h.o('C', '🦴');
  h.o('P', NO);
  h.o('C', '🎾');
  h.o('P', YES);
  const joined = link(h.m, ['🌙', '🐶'], '🎾') === 3;
  check('"not that, this": A ✗ B ✓ takes A back (also A ✗ B ✗ C ✓), B joins the chain', ok && joined && toks2 === '🐶🌞' && link(f.m, ['🐶'], '🌞') === 3 && toks3 === '🐶🦴🎾🍕', `${toks} (🐶→🎾 +3, 🐶→🦴 −3) · 🌙🐶→🎾 ${link(h.m, ['🌙', '🐶'], '🎾')} · ${toks2} · without ✓: ${toks3}`);
}

// 7. its ☐: 5% base, up to 25% when its top two are close; not while you are waiting
{
  const { m, o } = fresh();
  const base = m.waitChance([['🐶', 0.9], ['🐱', 0.1]]);
  const close = m.waitChance([['🐶', 0.41], ['🐱', 0.4]]);
  const tie = m.waitChance([['🐶', 0.5], ['🐱', 0.5]]);
  o('C', ASK);
  o('P', ASK);
  const waiting = m.waitChance([['🐶', 0.5], ['🐱', 0.5]]);
  check('its ☐: 5% base, up to 25% when unsure, 0 while you wait', base === 0.05 && close > 0.2 && close < 0.25 && Math.abs(tie - 0.25) < 1e-9 && waiting === 0, `${pct(base)} · close ${pct(close)} · tie ${pct(tie)} · after your ☐ ${pct(waiting)}`);
}

// 8. surprise: at least 10%, more with repetition (short patterns more), more when you keep waiting
{
  const { m } = fresh();
  const s = (toks, w = 0) => m.surpriseChance(toks, w).total;
  const cases = [
    ['🍎🍐🍋', [...'🍎🍐🍋'.match(/./gu)]],
    ['a b a', ['🍎', '🍐', '🍎']],
    ['ab ab ab ab', ['🍎', '🍐', '🍎', '🍐', '🍎', '🍐', '🍎', '🍐']],
    ['abc abc', ['🍎', '🍐', '🍋', '🍎', '🍐', '🍋']],
    ['abcd ×3', ['🍎', '🍐', '🍋', '🍇', '🍎', '🍐', '🍋', '🍇', '🍎', '🍐', '🍋', '🍇']],
    ['a a a a', ['🍎', '🍎', '🍎', '🍎']],
  ].map(([label, toks]) => [label, s(toks)]);
  const v = Object.fromEntries(cases);
  const waits = [3, 4, 6, 20].map((w) => s(['🍎', '🍐', '🍋'], w));
  const ok = v['🍎🍐🍋'] === 0.1 && v['ab ab ab ab'] > v['abcd ×3'] && v['abcd ×3'] > v['abc abc'] && v['a a a a'] > v['ab ab ab ab'] && v['a b a'] > 0.1 && waits[0] === 0.1 && waits[1] > 0.1 && waits[2] > waits[1] && waits[3] <= P.surpriseMax;
  check('surprise: 10% base, repetition (short patterns more), waiting', ok, cases.map(([l, x]) => `${l} ${pct(x)}`).join(' · ') + ` · your ☐ ×3/4/6/20: ${waits.map(pct).join(' / ')}`);
}

// 9. surprises come from the current hourly keyboard set
{
  const { m, o, t } = fresh(5);
  for (let i = 0; i < 6; i++) demo(o, ['🍕']);
  const set = hourlySet(5, t.v);
  const picks = [];
  for (let i = 0; i < 300; i++) {
    const d = m.decide(mulberry32(i), t.v);
    if (d.m === 'surprise') picks.push(d.tok);
  }
  check('surprises come from the hourly keyboard set', picks.length > 30 && picks.every((e) => set.includes(e)), `${picks.length} of 300 replies after 🍕🍕🍕… were surprises`);
}

// 10. you keep pressing ☐: it chains its learned predictions (like dreaming)
{
  let follows = 0;
  for (let run = 0; run < 100; run++) {
    const r = mulberry32(2000 + run);
    const f = fresh(40 + run);
    for (let i = 0; i < 4; i++) demo(f.o, ['🍎', '🍐', '🍋', '🍇', '🎈']);
    demo(f.o, ['🍎']);
    const out = [];
    for (let k = 0; k < 10 && out.length < 3; k++) {
      const d = f.m.decide(r);
      if (![YES, NO, ASK].includes(d.tok)) out.push(d.tok); // its ✓ / ☐: you just press ☐ again
      f.o('C', d.tok, d.m);
      f.o('P', ASK);
    }
    if (out.join('') === '🍐🍋🍇') follows++;
  }
  check('pressing ☐: it chains its learned sequence', follows >= 50, `🍎 then ☐ ☐ …: its next 3 signs are the whole chain 🍐🍋🍇 in ${follows}% (each can be a surprise)`);
}

// 11. a newborn (no expectation) uses its seed; dreams are learned at +0.1 on waking
{
  const { m, o, t } = fresh(8);
  const seeds = new Set();
  for (let i = 0; i < 100; i++) {
    const d = m.decide(mulberry32(i), t.v);
    if (d.m === 'seed') seeds.add(d.tok);
  }
  const seedOk = seeds.size > 2 && [...seeds].every((x) => m.character.includes(x));
  for (let i = 0; i < 6; i++) demo(o, ['🌞', '🌻', '🐝']);
  const before = m.assoc.version;
  m.energy = m.capacity * 0.5;
  o('S', SLEEP);
  const dreamed = m.sleep.dream.slice(0, 8).join('');
  t.v += 61 * MIN;
  o('S', WAKE);
  check('newborn uses its seed; dreams learned on waking', seedOk && m.stats.dreamLearned > 500 && m.assoc.version > before, `seed signs used: ${[...seeds].join('')} · dream starts ${dreamed} · learned ${m.stats.dreamLearned} dreamed signs`);
}

// 11b. woken by you it waits for your sign; waking up by itself it greets you with a surprise
{
  const { m, o, t } = fresh(14);
  demo(o, ['🌞']);
  o('C', '🌻');
  m.energy = m.capacity * 0.9;
  o('S', SLEEP);
  t.v += 4 * MIN;
  o('S', WAKE, 'manual');
  const manual = m.turn;
  o('P', '🌞');
  o('C', '🌻');
  o('S', SLEEP);
  t.v += 4 * MIN;
  o('S', WAKE);
  const d = m.decide(mulberry32(3), t.v);
  check('woken by you it waits; awake by itself it greets with a surprise', manual === 'P' && m.turn === 'C' && d.m === 'surprise' && hourlySet(m.seed, t.v).includes(d.tok), `woken by you: ${manual === 'P' ? 'your turn' : 'its turn'} · by itself: ${d.tok} (${d.why.mode})`);
}

// 12. parts by rank (D77): the most used sign drives the eyes, the 2nd the hat, … (updated after sleep)
{
  const { m, o, t } = fresh(12);
  const seed = m.seats.map((s) => s.tok).join('');
  const say = (tok, n) => {
    for (let i = 0; i < n; i++) {
      o('P', ASK);
      o('C', tok);
    }
  };
  const sleepWake = () => {
    m.energy = m.capacity;
    o('S', SLEEP);
    t.v += 61 * MIN;
    o('S', WAKE);
  };
  ['🍎', '🍐', '🍋', '🍇', '🍓', '🍒', '🍑'].forEach((x, i) => say(x, 20 - i));
  sleepWake();
  const s1 = m.seats.map((s) => s.tok);
  say('🍑', 20); // 🍑 becomes the most used
  sleepWake();
  const s2 = m.seats.map((s) => s.tok);
  const ok = s1.join('') === '🍎🍐🍋🍇🍓🍒🍑' && s2[0] === '🍑' && m.seats[0].seat === 'eyes' && m.seats[6].seat === 'object' && seed.length > 0 && m.seats.length === 7;
  check('parts follow the rank of its top 7 signs', ok, `seed ${seed} → ${s1.join('')} → ${s2.join('')}`);

  // voice: the same signs in another order shift it a little; completely different signs a lot
  const dist = (a, b) => Object.keys(a).reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);
  const v2 = voiceFor(m.seats.map((x, i) => ({ ...x, tok: s1[i], uses: x.uses })));
  const v3 = voiceFor(m.seats);
  const other = voiceFor(m.seats.map((x, i) => ({ ...x, tok: ['🚗', '🚲', '🚌', '🛴', '🚦', '🚀', '🛸'][i] })));
  check('voice: a reordered top 7 shifts it a little, a new top 7 a lot', dist(v2, v3) < dist(v3, other) / 2, `new #6: ${dist(v2, v3).toFixed(2)} · all new: ${dist(v3, other).toFixed(2)} · now ${voiceText(v3)}`);
}

// 12b. moves and poses (D77)
{
  const { m, o } = fresh(21);
  o('P', '🐶');
  o('C', '🎾');
  const first = m.moves.get('🎾').join('');
  const okShown = m.pose.join('') === first;
  o('P', '🦴'); // not ✓ / ✗: one digit changes, the pose stays until its next sign
  const after = m.moves.get('🎾').join('');
  const oneDigit = [...after].filter((d, i) => d !== first[i]).length === 1 && m.pose.join('') === first;
  o('C', '🎾');
  o('P', YES); // ✓ keeps the move; your ✓ shows the ✓ mouth
  const kept = m.moves.get('🎾').join('') === after && m.pose.join('') === '1121111';
  o('C', '🎾');
  o('P', NO); // ✗ re-rolls it; your ✗ shows the ✗ mouth
  const rerolled = m.pose.join('') === '1131111';
  o('C', ASK); // its ❓: the ? arms
  const ask = m.pose.join('') === '1111211';
  o('S', SLEEP);
  const sleeping = m.pose.join('') === '2111111';
  check('moves: shown with its sign; ✓ keeps, ✗ re-rolls, else one digit changes; fixed poses', okShown && oneDigit && kept && rerolled && ask && sleeping, `🎾 ${first} → ${after} · ✗ → ${m.moves.get('🎾').join('')}`);
}

// 13. newborns sound different
{
  const kinds = new Set(Array.from({ length: 16 }, (_, i) => nearestArchetype(voiceFor(fresh(i + 1).m.seats))));
  check('newborns sound different', kinds.size >= 3, `${kinds.size} archetypes among 16 newborns: ${[...kinds].join(', ')}`);
}

// 14. replay: the history rebuilds the same mind
{
  const f = fresh(21);
  const rng = mulberry32(9);
  for (let i = 0; i < 300; i++) {
    if (f.m.turn === 'C') {
      const d = f.m.decide(rng, f.t.v);
      f.o(d.tok === SLEEP ? 'S' : 'C', d.tok, d.m);
    } else if (!f.m.awake) {
      f.t.v += 61 * MIN;
      f.o('S', WAKE);
    } else {
      const r = rng();
      f.o('P', r < 0.1 ? YES : r < 0.18 ? NO : r < 0.3 ? ASK : ['🐶', '🌞', '🦴', '🍕', '🎈'][Math.floor(rng() * 5)]);
    }
  }
  const again = Mind.replay({ seed: 21, history: f.history }, P);
  const same = JSON.stringify([...again.assoc.table].map(([k, v]) => [k, [...v]])) === JSON.stringify([...f.m.assoc.table].map(([k, v]) => [k, [...v]])) && again.seq.length === f.m.seq.length && JSON.stringify(again.seats) === JSON.stringify(f.m.seats);
  check('replay rebuilds the same mind', same, `${f.history.length} entries · ${f.m.seq.length} real signs · ${f.m.takenBack.size} taken back`);
}

// 15. melodies: 5 steps, first and last always sound, same emoji = same melody, diatonic in its key
{
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const sample = ALL.slice(0, 400);
  const ok = [...sample, YES, NO, ASK].every((e) => {
    const mel = melodyFor(e);
    const sounding = melodyNotes(e).filter((x) => x !== null);
    if (Math.max(...sounding) - Math.min(...sounding) > 12) return false;
    const key = keyOf(e);
    const inKey = melodyNotes(e).every((x) => x === null || MAJOR.includes((((x - key) % 12) + 12) % 12));
    return mel.length === 5 && mel[0] && mel[4] && inKey && JSON.stringify(mel) === JSON.stringify(melodyFor(e));
  });
  const fixed = melodyText(YES) === 'G6 · · · C7' && melodyText(NO) === 'G6 · · · C6' && melodyText(ASK) === 'E6 · E6 · E6';
  check('melodies: 5 diatonic notes in the section key, ✅ ❌ ❓ fixed', ok && fixed);
}

// 16. storage: pruning drops the oldest sessions but keeps the birth entry
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

// 18. a random player (chaos) → no crashes
{
  const f = fresh(11);
  const rng = mulberry32(11);
  for (let i = 0; i < 2000; i++) {
    if (!f.m.awake) {
      f.t.v += 61 * MIN;
      f.o('S', WAKE);
    } else if (f.m.turn === 'C') {
      const d = f.m.decide(rng, f.t.v);
      f.o(d.tok === SLEEP ? 'S' : 'C', d.tok, d.m);
    } else {
      const r = rng();
      f.o('P', r < 0.25 ? [YES, NO, ASK][Math.floor(rng() * 3)] : ALL[Math.floor(rng() * ALL.length)]);
    }
  }
  check('chaos player survives', f.m.seq.length > 300 && !Number.isNaN(f.m.energy), `${f.m.seq.length} real signs · ${f.m.sleepCount} sleeps`);
}

log(failed ? `\n${failed} FAILED` : '\nall passed');
