// Simulation library: a creature raised by a scripted player type, with real-time sessions,
// sleep, and the same keyboard limits as the app. Used by sim/broad.js.

import { DEFAULT_PARAMS, ENGINE_VERSION } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { YES, NO, LOVE, ASK, TIME, SLEEP, WAKE, BIRTH, isContent } from '../src/core/tokens.js';
import { mulberry32, rngFor } from '../src/core/rng.js';
import { ALL, makeCharacter } from '../src/core/emojiIndex.js';
import { EMO } from '../src/core/emotions.js';
import { Frequent } from '../src/core/frequent.js';

const SEC = 1000;
const MIN = 60 * SEC;

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
// moves that come from its own initiative rather than from what it has learned
const CREATIVE = new Set(['variation', 'twist', 'new', 'break', 'nature', 'babble', 'game', 'memory']);

// ───────────────────────── player types ─────────────────────────

function teacher(k, moves) {
  const content = moves.filter((m) => isContent(m.tok));
  const last = moves[moves.length - 1];
  if (k.state.asked) {
    k.state.asked = false;
    const { ok } = k.judge(content);
    return ok ? (k.rng() < 0.6 ? YES : LOVE) : NO;
  }
  if (!last) return k.newCue();
  if (last.tok === ASK) return k.send(k.answerFor(k.lastContent() || k.pick(k.random())));
  if (last.tok === TIME) {
    const prev = k.lastContent();
    if (prev && k.lastWasPlayer() && k.rng() < 0.7) return k.send(k.answerFor(prev));
    return k.newCue();
  }
  if (last.tok === YES || last.tok === LOVE) return k.rng() < 0.4 ? LOVE : k.newCue();
  if (last.tok === NO) return k.newCue();
  const c = last.tok;
  if (k.isNewFromCreature(c) && k.rng() < 0.35) {
    k.S.adopted++;
    return k.send(c);
  }
  const { judged, ok } = k.judge(content);
  if (judged && ok) {
    const r = k.rng();
    if (r < 0.15 && k.mind.stage >= 1) {
      k.state.asked = true;
      return ASK;
    }
    if (r < 0.6) return YES;
    if (r < 0.85) return LOVE;
    return k.send(k.answerFor(c));
  }
  if (judged && !ok && k.rng() < 0.45) return NO;
  return k.rng() < 0.75 ? k.send(k.answerFor(c)) : k.send(k.newCue());
}

function chaotic(k) {
  const r = k.rng();
  if (r < 0.05) return TIME;
  if (r < 0.13) return k.pick([YES, NO, LOVE, ASK]);
  return k.pick(k.random());
}

function affectionate(k, moves) {
  const last = moves[moves.length - 1];
  if (!last) return k.newCue();
  if (last.tok === LOVE || last.tok === YES) return k.rng() < 0.6 ? LOVE : k.newCue();
  if (last.tok === ASK) return k.send(k.answerFor(k.lastContent() || k.pick(k.random()), 0.6));
  if (last.tok === TIME || last.tok === NO) return k.newCue();
  const r = k.rng();
  if (r < 0.45) return LOVE;
  if (r < 0.75) return k.send(k.answerFor(last.tok, 0.6));
  if (r < 0.92) return k.newCue();
  if (k.isNewFromCreature(last.tok)) k.S.adopted++;
  return k.send(last.tok);
}

function mirror(k, moves) {
  const last = moves[moves.length - 1];
  if (!last || !isContent(last.tok)) return k.rng() < 0.3 ? LOVE : k.newCue();
  const c = last.tok;
  const r = k.rng();
  if (c === k.state.lastSent && r < 0.4) return YES; // it mirrored me
  if (r < 0.55) {
    if (k.isNewFromCreature(c)) k.S.adopted++;
    return k.send(c); // mirror it
  }
  if (r < 0.7 && k.state.lastSent) return k.send(k.state.lastSent); // alternate
  if (r < 0.8) return LOVE;
  return k.newCue();
}

function minimalist(k, moves) {
  const last = moves[moves.length - 1];
  const r = k.rng();
  if (r < 0.35) return TIME;
  if (last && isContent(last.tok)) {
    if (r < 0.5) return YES;
    if (r < 0.8) return k.send(k.answerFor(last.tok));
  }
  return k.newCue();
}

export const PERSONAS = {
  teacher: { play: teacher, patience: [35, 90], sessions: 3, desc: 'consistent language, teaches with ✅ ❤️ ❌ ❓, demonstrates when it waits' },
  devoted: { play: teacher, patience: [Infinity, Infinity], sessions: 3, desc: 'like teacher, but plays every session until it falls asleep' },
  shifter: { play: teacher, patience: [35, 90], sessions: 3, shiftDay: 6, desc: 'like teacher, but from day 6 on switches to a completely new language and new favourite emojis' },
  affectionate: { play: affectionate, patience: [35, 90], sessions: 3, desc: 'lots of ❤️, loose language (60% consistent), sometimes picks up its emojis, never ❌' },
  mirror: { play: mirror, patience: [35, 90], sessions: 3, desc: 'mirrors its emojis, alternates, ✅ when it mirrors back' },
  chaotic: { play: chaotic, patience: [30, 70], sessions: 3, desc: 'random emojis from the keyboard, random signs, no language' },
  minimalist: { play: minimalist, patience: [8, 25], sessions: 2, desc: 'short sessions twice a day, passes 💬 a lot, few emojis' },
};

// ───────────────────────── simulation ─────────────────────────

export function simulate({ persona, seed, days = 10, params = DEFAULT_PARAMS }) {
  const P = { ...params };
  const spec = PERSONAS[persona];
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const between = (a, b) => a + rng() * (b - a);

  const save = { format: 2, engine: ENGINE_VERSION, seed, clockOffset: 0, history: [] };
  const mind = new Mind(P, seed);
  let t = Date.UTC(2026, 10, 24, 7, 0);
  const freq = new Frequent(P.frequentHalfLife);
  let randomSel = [];
  const push = (e) => {
    save.history.push(e);
    mind.observe(e);
    if (e.tok === WAKE) freq.nextSession();
    if (e.who === 'P' && isContent(e.tok)) freq.use(e.tok);
  };
  push({ t, who: 'S', tok: BIRTH, m: makeCharacter(rngFor(seed, 'character'), P.characterSize).join(' ') });

  // keyboard
  const frequent = () => freq.top(20);
  const creatureRecent = (n) => {
    const res = [];
    for (let i = save.history.length - 1; i >= 0 && res.length < n; i--) {
      const e = save.history[i];
      if (e.tok === SLEEP || e.tok === WAKE) break;
      if (e.who === 'C' && isContent(e.tok) && !res.includes(e.tok)) res.push(e.tok);
    }
    return res;
  };
  const refreshRandom = () => {
    const freq = new Set(frequent());
    const sel = new Set(creatureRecent(3).filter((e) => !freq.has(e)));
    while (sel.size < 25) {
      const e = ALL[Math.floor(rng() * ALL.length)];
      if (!freq.has(e)) sel.add(e);
    }
    randomSel = [...sel];
  };
  const offer = (tok) => {
    if (!isContent(tok) || randomSel.includes(tok) || frequent().includes(tok)) return;
    randomSel[Math.floor(rng() * randomSel.length)] = tok;
  };
  const visible = () => new Set([...frequent(), ...randomSel]);
  refreshRandom();

  // the player's kit
  let S = null;
  const k = {
    rng, pick, mind, state: {},
    lang: new Map(), oldLang: null, old: null,
    get S() { return S; },
    random: () => randomSel,
    lastContent: () => mind.seq[mind.seq.length - 1],
    lastWasPlayer: () => mind.seqWho[mind.seqWho.length - 1] === 'P',
    isNewFromCreature(c) {
      const v = mind.vocab.get(c);
      return !!v && v.firstWho === 'C' && v.playerCount === 0;
    },
    answerFor(x, consistency = 0.85) {
      if (!k.lang.has(x)) {
        const avoid = (e) => e !== x && !(k.old && k.old.has(e));
        const freq = frequent().filter(avoid);
        const pool = freq.length >= 4 && rng() < 0.6 ? freq : randomSel.filter(avoid);
        k.lang.set(x, pick(pool.length ? pool : randomSel));
      }
      return rng() < consistency ? k.lang.get(x) : pick(randomSel);
    },
    send(want) {
      if (!isContent(want) || visible().has(want)) return want;
      S.blocked++;
      return pick([...visible()]);
    },
    newCue() {
      const r = rng();
      if (r < 0.05) return TIME;
      const fav = frequent().filter((e) => !(k.old && k.old.has(e)));
      if (fav.length >= 3 && r < 0.7) return pick(fav.slice(0, 8));
      return pick(randomSel);
    },
    /** Does its content move continue like the player's language? (used by the teacher to react) */
    judge(content) {
      let judged = content.length > 0;
      let ok = content.length > 0;
      for (const mv of content) {
        const prev = mv.i > 0 ? mind.seq[mv.i - 1] : null;
        if (!prev || !k.lang.has(prev)) {
          judged = ok = false;
          continue;
        }
        if (mv.tok !== k.lang.get(prev)) ok = false;
      }
      return { judged, ok };
    },
  };

  /** Learning measurement, for every player type with a language: its direct reply to your emoji. */
  function measureReply(tok, i, firstTry) {
    if (!firstTry || i < 1 || mind.seqWho[i - 1] !== 'P') return;
    const prev = mind.seq[i - 1];
    if (!k.lang.has(prev)) return;
    S.firstTry++;
    if (tok === k.lang.get(prev)) S.firstTryOk++;
    if (k.oldLang && k.oldLang.has(prev) && k.oldLang.get(prev) !== k.lang.get(prev)) {
      S.oldJudged++;
      if (tok === k.oldLang.get(prev)) S.oldUsed++;
    }
  }

  const inborn = mind.character.slice();
  const sessions = [];
  const stageAt = {}; // stage -> session index when first reached
  const earlyEmojis = new Set(); // emojis in the conversation during days 1–2
  let sessionIndex = 0;

  function creatureTurns(moves) {
    let guard = 0;
    while (mind.awake && mind.turn === 'C' && guard++ < 12) {
      t += between(0.7, 1.4) * SEC;
      const d = mind.decide(rng);
      const name = modeName(d.why && d.why.mode);
      S.modes[name] = (S.modes[name] || 0) + 1;
      const isNew = isContent(d.tok) && !mind.vocab.has(d.tok);
      push({ t, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
      if (d.tok === SLEEP) {
        S.endedBySleep = true;
        return;
      }
      if (isNew) S.introduced++;
      offer(d.tok);
      if (isContent(d.tok)) {
        S.cContent++;
        if (CREATIVE.has(name)) S.creative++;
        if (mind.character.includes(d.tok)) S.characterMoves++;
        if (S.day > 2 && earlyEmojis.has(d.tok)) S.earlyMoves++;
        if (S.day <= 2) earlyEmojis.add(d.tok);
      }
      if (isContent(d.tok)) measureReply(d.tok, mind.seq.length - 1, d.m !== 'retry' && d.m !== 'elab' && d.m !== 'elab-end');
      moves.push({ tok: d.tok, i: mind.seq.length - 1, firstTry: d.m !== 'retry' });
    }
  }

  function runSession(day, start) {
    t = Math.max(t, start);
    S = {
      day, index: ++sessionIndex, inputs: 0, blocked: 0, adopted: 0, introduced: 0,
      firstTry: 0, firstTryOk: 0, oldJudged: 0, oldUsed: 0, cContent: 0, creative: 0,
      characterMoves: 0, earlyMoves: 0, modes: {}, endedBySleep: false, woken: false,
      emo: Object.fromEntries(EMO.map((e) => [e, 0])), emoN: 0,
    };
    const idle = P.idleSleepMin * MIN;
    if (mind.awake && t - mind.lastEntryT > idle) push({ t: mind.lastEntryT + idle, who: 'S', tok: SLEEP });
    if (!mind.awake) {
      if (mind.isRested(t)) {
        t += between(2, 20) * SEC;
        push({ t, who: 'S', tok: WAKE });
      } else {
        S.woken = true;
        push({ t, who: 'S', tok: WAKE, m: 'manual' });
      }
    }
    S.stageStart = mind.stage;
    const firstT = t;
    const startSeq = mind.seq.length;
    const [a, b] = spec.patience;
    const patience = a === Infinity ? 600 : Math.round(between(a, b));
    k.state = {};
    let moves = [];
    creatureTurns(moves);
    while (mind.awake && S.inputs < patience) {
      const tok = spec.play(k, moves);
      t += between(1.5, 6) * SEC;
      push({ t, who: 'P', tok });
      if (isContent(tok)) {
        k.state.lastSent = tok;
        if (day <= 2) earlyEmojis.add(tok);
      }
      S.inputs++;
      refreshRandom();
      for (const e of EMO) S.emo[e] += mind.emo[e];
      S.emoN++;
      moves = [];
      creatureTurns(moves);
    }
    S.minutes = (t - firstT) / MIN;
    // conversation repetitiveness: share of 3-emoji sequences already seen this session
    const seq = mind.seq.slice(startSeq);
    const seen = new Set();
    let rep = 0;
    for (let i = 2; i < seq.length; i++) {
      const key = seq[i - 2] + seq[i - 1] + seq[i];
      if (seen.has(key)) rep++;
      seen.add(key);
    }
    S.repeat = seq.length > 2 ? rep / (seq.length - 2) : 0;
    S.distinct = seq.length ? new Set(seq).size / seq.length : 0;
    S.stage = mind.stage;
    S.complexity = mind.complexity;
    S.capacity = mind.capacity;
    S.habits = mind.activeHabits.size;
    S.vocab = mind.vocab.size;
    S.maturity = mind.maturity;
    S.inbornInCharacter = mind.character.filter((e) => inborn.includes(e)).length;
    S.character = mind.character.join('');
    for (let st = 1; st <= 4; st++) if (mind.stage >= st && stageAt[st] === undefined) stageAt[st] = S.index;
    sessions.push(S);
  }

  const times = spec.sessions === 2 ? [[8, 30], [20, 0]] : [[8, 0], [13, 0], [19, 30]];
  for (let day = 1; day <= days; day++) {
    if (spec.shiftDay === day) {
      k.oldLang = k.lang;
      k.lang = new Map();
      k.old = new Set(frequent());
    }
    for (const [h, m] of times) runSession(day, Date.UTC(2026, 10, 23 + day, h, m) + between(-20, 20) * MIN);
  }
  return { persona, seed, sessions, stageAt, mind, save, character: mind.character };
}
