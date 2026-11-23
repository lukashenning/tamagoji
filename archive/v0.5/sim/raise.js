// Raising simulation: a scripted player raises a creature over several simulated days.
// Writes a Markdown report and an importable save file (via stdout markers, split by sim/run.sh).
//
// Run: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m sim/raise.js
//
// The simulated player:
// - has their own consistent "language": for every emoji X they answer with the same emoji Y (85%)
// - teaches with the elemental signs: ✅ / ❤️ when the creature continues like they would,
//   ❌ (sometimes) when it doesn't, ❓ to test what it knows, 💬 now and then
// - demonstrates pairs when the creature waits (💬)
// - sometimes picks up emojis the creature introduces
// - can only use what the keyboard shows: 5 signs + 20 frequent + 25 random (incl. its newest emojis)

import { DEFAULT_PARAMS, ENGINE_VERSION } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { YES, NO, LOVE, ASK, TIME, SLEEP, WAKE, BIRTH, ELEMENTALS, isContent } from '../src/core/tokens.js';
import { mulberry32, rngFor } from '../src/core/rng.js';
import { ALL, makeCharacter } from '../src/core/emojiIndex.js';
import { EMO, PROFILE_DIMS, LABELS, strength } from '../src/core/emotions.js';
import { Frequent } from '../src/core/frequent.js';

const out = globalThis.print || console.log;
const SEED = 20261124;
const DAYS = 7;
const SESSIONS = [
  [8, 0],
  [13, 0],
  [19, 30],
];
const P = { ...DEFAULT_PARAMS };
const rng = mulberry32(SEED ^ 0x9e3779b9);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const between = (a, b) => a + rng() * (b - a);
const SEC = 1000;
const MIN = 60 * SEC;

// ───────────── creature + history ─────────────
const save = { format: 2, engine: ENGINE_VERSION, seed: SEED, clockOffset: 0, history: [] };
const mind = new Mind(P, SEED);
let t = Date.UTC(2026, 10, 24, 7, 30);
const counts = new Map(); // player's emoji use over all time (for the report)
const freq = new Frequent(P.frequentHalfLife); // "frequently used", like the app
let randomSel = [];

function push(e) {
  save.history.push(e);
  mind.observe(e);
  if (e.tok === WAKE) freq.nextSession();
  if (e.who === 'P' && isContent(e.tok)) {
    counts.set(e.tok, (counts.get(e.tok) || 0) + 1);
    freq.use(e.tok);
  }
}
const character = makeCharacter(rngFor(SEED, 'character'), P.characterSize);
push({ t, who: 'S', tok: BIRTH, m: character.join(' ') });

// ───────────── keyboard (same rules as the app) ─────────────
const frequent = () => freq.top(20);
function creatureRecent(n) {
  const res = [];
  for (let i = save.history.length - 1; i >= 0 && res.length < n; i--) {
    const e = save.history[i];
    if (e.tok === SLEEP || e.tok === WAKE) break;
    if (e.who === 'C' && isContent(e.tok) && !res.includes(e.tok)) res.push(e.tok);
  }
  return res;
}
function refreshRandom() {
  const freq = new Set(frequent());
  const sel = new Set(creatureRecent(3).filter((e) => !freq.has(e)));
  while (sel.size < 25) {
    const e = ALL[Math.floor(rng() * ALL.length)];
    if (!freq.has(e)) sel.add(e);
  }
  randomSel = [...sel];
}
function offer(tok) {
  if (!isContent(tok) || randomSel.includes(tok) || frequent().includes(tok)) return;
  randomSel[Math.floor(rng() * randomSel.length)] = tok;
}
const visible = () => new Set([...frequent(), ...randomSel]);
refreshRandom();

// ───────────── stats ─────────────
let S; // current session stats
const sessions = [];
const milestones = [];
const modeName = (mode = '') =>
  mode.startsWith('elaborat') ? 'elaborate'
  : mode.startsWith('retry') ? 'retry'
  : mode.startsWith('confirms') ? 'react ✅'
  : mode.startsWith('rejects') ? 'react ❌'
  : mode.startsWith('affection') ? 'react ❤️'
  : mode.startsWith('asks') || mode.startsWith("doesn't know") ? 'ask ❓'
  : mode.startsWith('invented') ? 'game'
  : mode.startsWith('falls asleep') || mode.startsWith('nods off') ? 'sleep'
  : mode;

function newSessionStats(day, slot) {
  return {
    day, slot, start: t, inputs: 0, signals: { [YES]: 0, [LOVE]: 0, [NO]: 0, [ASK]: 0, [TIME]: 0 },
    modes: {}, judged: 0, correct: 0, firstTry: 0, firstTryCorrect: 0, blocked: 0, adopted: 0,
    introduced: 0, elabTests: [], emoSum: Object.fromEntries(EMO.map((k) => [k, 0])), emoN: 0, transcript: [],
    endReason: '', grogginess: false,
  };
}

// ───────────── the simulated player ─────────────
const lang = new Map(); // the player's own language: X → Y
function answerFor(x) {
  if (!lang.has(x)) {
    const freq = frequent().filter((e) => e !== x);
    const pool = freq.length >= 4 && rng() < 0.6 ? freq : randomSel.filter((e) => e !== x);
    lang.set(x, pick(pool));
  }
  return lang.get(x);
}
/** The player wants to send `want`; the keyboard may not show it. */
function sendable(want) {
  if (!isContent(want) || visible().has(want)) return want;
  S.blocked++;
  const vis = [...visible()];
  return pick(vis);
}
function newCue() {
  const r = rng();
  if (r < 0.05) return TIME;
  const fav = frequent();
  if (fav.length >= 3 && r < 0.7) return pick(fav.slice(0, 8));
  return pick(randomSel);
}
let playerAsked = false;

/** What came before the creature's content move at seq index i. */
const prevOf = (i) => (i > 0 ? mind.seq[i - 1] : null);

function judgeMoves(moves) {
  // moves: creature content moves since the player's last input, with their seq index
  let allOk = moves.length > 0;
  for (const mv of moves) {
    const prev = prevOf(mv.i);
    if (!prev || !lang.has(prev)) {
      allOk = false;
      continue;
    }
    const ok = mv.tok === lang.get(prev);
    S.judged++;
    if (ok) S.correct++;
    if (mv.firstTry && mind.seqWho[mv.i - 1] === 'P') {
      S.firstTry++;
      if (ok) S.firstTryCorrect++;
    }
    if (!ok) allOk = false;
  }
  return allOk;
}

function playerMove(movesSince) {
  const contentMoves = movesSince.filter((m) => isContent(m.tok));
  const last = movesSince[movesSince.length - 1];

  if (playerAsked) {
    playerAsked = false;
    const ok = judgeMoves(contentMoves);
    S.elabTests.push({ chain: contentMoves.map((m) => m.tok).join(''), ok, ended: last ? last.tok : '' });
    return ok ? (rng() < 0.6 ? YES : LOVE) : NO;
  }
  if (!last) return newCue();
  if (last.tok === ASK) return sendable(answerFor(mind.seq[mind.seq.length - 1] || pick(randomSel)));
  if (last.tok === TIME) {
    const prev = mind.seq[mind.seq.length - 1];
    if (prev && mind.seqWho[mind.seq.length - 1] === 'P' && rng() < 0.7) return sendable(answerFor(prev)); // demonstrate
    return newCue();
  }
  if (last.tok === YES || last.tok === LOVE) return rng() < 0.4 ? LOVE : newCue();
  if (last.tok === NO) return newCue();

  // its ordinary emoji
  const c = last.tok;
  const v = mind.vocab.get(c);
  if (v && v.firstWho === 'C' && v.playerCount === 0 && rng() < 0.35) {
    S.adopted++;
    return sendable(c); // pick up its new emoji
  }
  const ok = judgeMoves(contentMoves);
  const judged = contentMoves.length && contentMoves.every((m) => lang.has(prevOf(m.i)));
  if (judged && ok) {
    const r = rng();
    if (r < 0.15 && mind.stage >= 1) {
      playerAsked = true;
      return ASK; // "show me what else you know"
    }
    if (r < 0.6) return YES;
    if (r < 0.85) return LOVE;
    return sendable(answerFor(c));
  }
  if (judged && !ok && rng() < 0.45) return NO;
  return rng() < 0.75 ? sendable(answerFor(c)) : sendable(newCue());
}

// ───────────── running a session ─────────────
function creatureTurns(movesSince) {
  let guard = 0;
  while (mind.awake && mind.turn === 'C' && guard++ < 12) {
    t += between(0.7, 1.4) * SEC;
    const d = mind.decide(rng);
    const name = modeName(d.why && d.why.mode);
    S.modes[name] = (S.modes[name] || 0) + 1;
    const isNew = isContent(d.tok) && !mind.vocab.has(d.tok);
    push({ t, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
    if (d.tok === SLEEP) {
      S.endReason = name === 'sleep' ? d.why.mode : 'fell asleep';
      S.transcript.push('💤');
      return;
    }
    if (isNew) S.introduced++;
    offer(d.tok);
    movesSince.push({ tok: d.tok, i: mind.seq.length - 1, firstTry: d.m !== 'retry' });
    S.transcript.push(`<${d.tok}${d.m === 'retry' ? '↺' : d.m === 'elab' || d.m === 'elab-end' ? '›' : ''}>`);
  }
}

function runSession(day, slot, startT) {
  t = Math.max(t, startT);
  S = newSessionStats(day, slot);
  const idle = P.idleSleepMin * MIN;
  if (mind.awake && t - mind.lastEntryT > idle) push({ t: mind.lastEntryT + idle, who: 'S', tok: SLEEP });
  if (!mind.awake) {
    if (mind.isRested(t)) {
      t += between(2, 20) * SEC;
      push({ t, who: 'S', tok: WAKE });
    } else {
      S.grogginess = true;
      push({ t, who: 'S', tok: WAKE, m: 'manual' }); // the player wakes it anyway
    }
  }
  const stageBefore = mind.stage;
  const patience = Math.round(between(35, 90));
  let movesSince = [];
  creatureTurns(movesSince);
  while (mind.awake && S.inputs < patience) {
    const tok = playerMove(movesSince);
    t += between(1.5, 6) * SEC;
    push({ t, who: 'P', tok });
    S.inputs++;
    if (tok in S.signals) S.signals[tok]++;
    S.transcript.push(tok);
    refreshRandom();
    for (const k of EMO) S.emoSum[k] += mind.emo[k];
    S.emoN++;
    movesSince = [];
    creatureTurns(movesSince);
  }
  if (mind.awake) S.endReason = 'player left (it falls asleep after 2 min alone)';
  S.stageBefore = stageBefore;
  snapshot();
}

function snapshot() {
  S.stage = mind.stage;
  S.complexity = mind.complexity;
  S.capacity = Math.round(mind.capacity);
  S.vocab = mind.vocab.size;
  S.habits = mind.activeHabits.size;
  S.rules = mind.rules.length;
  S.trust = Object.fromEntries(Object.entries(mind.trust).map(([k, v]) => [k, v.toFixed(2)]));
  S.sleeps = mind.sleepCount;
  sessions.push(S);
  // milestones
  if (S.stage !== S.stageBefore) milestones.push(`day ${S.day}, ${slotName(S.slot)}: grew from stage ${S.stageBefore} to ${S.stage} (complexity ${S.complexity})`);
  if (S.habits && !milestones.some((m) => m.includes('first habit'))) {
    const h = [...mind.activeHabits.values()][0];
    milestones.push(`day ${S.day}, ${slotName(S.slot)}: first habit ${h.ctx.join('')}→${h.next}`);
  }
}
const slotName = (i) => ['morning', 'midday', 'evening'][i];

// ───────────── the week ─────────────
for (let day = 1; day <= DAYS; day++) {
  SESSIONS.forEach(([h, m], slot) => {
    const start = Date.UTC(2026, 10, 23 + day, h, m) + between(-20, 20) * MIN;
    runSession(day, slot, start);
  });
}
// let it fall asleep at the end
if (mind.awake) push({ t: mind.lastEntryT + P.idleSleepMin * MIN, who: 'S', tok: SLEEP });

// ───────────── final knowledge check ─────────────
const playerWords = [...counts].sort((a, b) => b[1] - a[1]).filter(([e]) => lang.has(e)).slice(0, 15);
const knows = playerWords.map(([x]) => {
  const pr = mind.pb.predict([x], 1);
  let top = null;
  for (const [tk, p] of pr.dist) if (!top || p > pr.dist.get(top)) top = tk;
  const habit = [...mind.activeHabits.values()].find((h) => h.ctx.length === 1 && h.ctx[0] === x);
  return { x, y: lang.get(x), top, conf: pr.conf, ok: top === lang.get(x), habit: habit ? habit.next : null };
});

// elaboration demo on a copy: wake it, give a cue, ask ❓, see how deep it goes
function elaborationDemo(cue) {
  const m = Mind.replay(save, P);
  const r = mulberry32(7);
  let tt = save.history[save.history.length - 1].t + 2 * 60 * MIN;
  m.observe({ t: tt, who: 'S', tok: WAKE });
  while (m.turn === 'C') {
    const d = m.decide(r);
    if (d.tok === SLEEP) return '(sleepy)';
    m.observe({ t: (tt += SEC), who: 'C', tok: d.tok, m: d.m });
  }
  m.observe({ t: (tt += SEC), who: 'P', tok: cue });
  const reply = m.decide(r);
  m.observe({ t: (tt += SEC), who: 'C', tok: reply.tok, m: reply.m });
  m.observe({ t: (tt += SEC), who: 'P', tok: ASK });
  const chain = [];
  while (m.turn === 'C' && chain.length < 10) {
    const d = m.decide(r);
    chain.push(d.tok);
    m.observe({ t: (tt += SEC), who: 'C', tok: d.tok, m: d.m });
  }
  let expected = [];
  let cur = reply.tok;
  for (let i = 0; i < chain.length && lang.has(cur); i++) expected.push((cur = lang.get(cur)));
  return `you ${cue} → it ${reply.tok} · you ❓ → it ${chain.join(' ')}  (your language would continue: ${expected.join(' ') || '–'})`;
}
const demos = playerWords.slice(0, 4).map(([x]) => elaborationDemo(x));

// ───────────── report ─────────────
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');
const L = [];
L.push(`# Raising simulation: ${DAYS} days`);
L.push('');
L.push(`Generated by \`sim/raise.js\` · engine ${ENGINE_VERSION} · seed ${SEED} · default parameters.`);
L.push('Importable creature: `sim/out/raised-7days.json` (test panel → import).');
L.push('');
L.push('## Setup');
L.push('');
L.push(`- **Creature character:** ${character.join(' ')}`);
L.push('- **Player:** 3 sessions a day (morning, midday, evening), 35–90 inputs of patience per session, 1.5–6 s per input.');
L.push('- **Player language:** for every emoji X, a fixed answer Y (used 85% of the time), chosen from what the keyboard shows.');
L.push('- **Teaching:** ✅/❤️ when the creature continues like the player would, ❌ 45% of the time when it doesn\'t, ❓ to test elaboration (stage 1+), demonstrates the answer when the creature waits 💬, picks up 35% of its new emojis.');
L.push('- **Keyboard limits** as in the app: 5 signs + 20 frequent + 25 random (including its newest emojis).');
L.push('');
L.push('**How to read "correct":** the creature\'s emoji matches what the player would have said after the previous emoji (it has learned the player\'s language). "First try" counts only direct replies to the player\'s emoji, before any ❌ retry. A random guess would be right well under 5% of the time.');
L.push('');
L.push('## Session by session');
L.push('');
L.push('| day | session | stage | inputs | ✅ | ❤️ | ❌ | ❓ | 💬 | correct (first try) | complexity | habits | vocab | blocked | new / adopted | mood | ended |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of sessions) {
  const mood = EMO.map((k) => [k, s.emoN ? s.emoSum[k] / s.emoN : 0]).sort((a, b) => b[1] - a[1])[0];
  L.push(
    `| ${s.day} | ${slotName(s.slot)}${s.grogginess ? ' (woken)' : ''} | ${s.stageBefore}${s.stage !== s.stageBefore ? '→' + s.stage : ''} | ${s.inputs} | ${s.signals[YES]} | ${s.signals[LOVE]} | ${s.signals[NO]} | ${s.signals[ASK]} | ${s.signals[TIME]} | ${pct(s.correct, s.judged)} (${pct(s.firstTryCorrect, s.firstTry)}) | ${s.complexity} | ${s.habits} | ${s.vocab} | ${s.blocked} | ${s.introduced} / ${s.adopted} | ${LABELS[mood[0]]} ${mood[1].toFixed(2)} | ${s.endReason.replace('player left (it falls asleep after 2 min alone)', 'player left')} |`,
  );
}
L.push('');
L.push('"blocked" = the player wanted an emoji the keyboard didn\'t show. "new / adopted" = emojis it introduced / the player picked up. "mood" = average strongest emotion.');
L.push('');
L.push('## What the creature did (share of its moves per day)');
L.push('');
const modeKeys = ['pattern', 'habit', 'variation', 'twist', 'nature', 'echo', 'babble', 'new', 'break', 'wait', 'retry', 'elaborate', 'ask ❓', 'react ✅', 'react ❌', 'react ❤️', 'game', 'sleep'];
L.push('| day | ' + modeKeys.join(' | ') + ' |');
L.push('|---|' + modeKeys.map(() => '---').join('|') + '|');
for (let day = 1; day <= DAYS; day++) {
  const tot = {};
  let n = 0;
  for (const s of sessions.filter((x) => x.day === day)) for (const [k, v] of Object.entries(s.modes)) ((tot[k] = (tot[k] || 0) + v), (n += v));
  L.push(`| ${day} | ` + modeKeys.map((k) => (tot[k] ? Math.round((100 * tot[k]) / n) + '%' : '·')).join(' | ') + ' |');
}
L.push('');
L.push('## Milestones');
L.push('');
for (const m of milestones) L.push(`- ${m}`);
if (!milestones.length) L.push('- none');
L.push('');
L.push('## Transcript excerpts');
L.push('');
L.push('`<x>` = creature, plain = player, ↺ = retry after ❌, › = elaboration, 💤 = falls asleep.');
L.push('');
for (const idx of [0, 1, Math.floor(sessions.length / 2), sessions.length - 1]) {
  const s = sessions[idx];
  L.push(`**Day ${s.day}, ${slotName(s.slot)}** (stage ${s.stageBefore}):`);
  L.push('');
  L.push('> ' + s.transcript.slice(0, 60).join(' '));
  L.push('');
}
L.push('## End state');
L.push('');
L.push(`- **Stage** ${mind.stage} · **complexity** ${mind.complexity} · **capacity** ${Math.round(mind.capacity)} inputs · knows **${mind.vocab.size}** emojis · ${mind.sleepCount} sleeps`);
L.push(`- **Voice trust:** ${Object.entries(mind.trust).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
L.push(`- **Habits (${mind.activeHabits.size}):** ${[...mind.activeHabits.values()].map((h) => h.ctx.join('') + '→' + h.next).join('  ') || '–'}`);
L.push(`- **Rules (${mind.rules.length}), top 15:** ${mind.rules.slice(0, 15).map((r) => `${r.ctx.join('')}→${r.next} ${Math.round(r.p * 100)}%`).join('  ') || '–'}`);
L.push(`- **Narratives:** ${mind.narratives.slice(0, 6).map((n) => n.join('')).join('  ') || '–'}`);
L.push('');
L.push('**Does it know the player\'s most used words?** (phrasebook after a single emoji)');
L.push('');
L.push('| player says | player\'s answer | creature expects | sure | habit | ✓ |');
L.push('|---|---|---|---|---|---|');
for (const k of knows) L.push(`| ${k.x} | ${k.y} | ${k.top || '–'} | ${Math.round(k.conf * 100)}% | ${k.habit || '–'} | ${k.ok ? '✓' : '✗'} |`);
L.push('');
L.push(`Knows ${knows.filter((k) => k.ok).length} of ${knows.length}. The player\'s language had ${lang.size} words in total.`);
L.push('');
L.push('**Elaboration (❓) on a copy of the final creature:**');
L.push('');
for (const d of demos) L.push(`- ${d}`);
L.push('');
L.push('**Emotional associations (strongest per emotion):**');
L.push('');
for (const [i, k] of PROFILE_DIMS.entries()) {
  const top = [...mind.profiles]
    .map(([key, pr]) => [key, pr.v[i] * strength(pr, P.repsToLearn), pr.n])
    .filter(([, sc, n]) => sc > 0.1 && n >= P.repsToLearn)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  L.push(`- ${LABELS[k]}: ${top.map(([key, sc]) => `${key.replace(/ /g, '')} (${sc.toFixed(2)})`).join('  ') || '–'}`);
}
L.push('');

const enc = { ...save, history: save.history.map((e) => (e.m ? [e.t, e.who, e.tok, e.m] : [e.t, e.who, e.tok])) };
out('@@REPORT@@');
out(L.join('\n'));
out('@@SAVE@@');
out(JSON.stringify(enc));
out('@@END@@');
