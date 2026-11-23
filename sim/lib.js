// Simulation library: a creature raised by a scripted player type, with real-time sessions,
// sleep, and the same keyboard limits as the app. Used by sim/broad.js.

import { DEFAULT_PARAMS, ENGINE_VERSION } from '../src/core/params.js';
import { Mind } from '../src/core/mind.js';
import { YES, NO, ASK, SLEEP, WAKE, BIRTH, SEP, isContent } from '../src/core/tokens.js';
import { mulberry32, rngFor } from '../src/core/rng.js';
import { ALL, makeCharacter } from '../src/core/emojiIndex.js';
import { recentEmojis, hourlySet } from '../src/core/keyboard.js';

const SEC = 1000;
const MIN = 60 * SEC;

const modeName = (mode = '') =>
  mode.startsWith('answers') ? 'answer ❓'
  : mode.startsWith('retry') ? 'retry'
  : mode.startsWith('confirms') ? 'react ✅'
  : mode.startsWith('rejects') || mode.startsWith('says ❌') ? 'react ❌'
  : mode.startsWith('affection') ? 'react ❤️'
  : mode.startsWith('asks') || mode.startsWith("doesn't know") ? 'ask ❓'
  : mode.startsWith('invented') ? 'game'
  : mode.startsWith('falls asleep') || mode.startsWith('nods off') ? 'sleep'
  : mode;
// moves that come from its own initiative rather than from what it has learned
const CREATIVE = new Set(['variation', 'new', 'surprise', 'general', 'character']);

// ───────────────────────── player types ─────────────────────────

function teacher(k, moves) {
  const content = moves.filter((m) => isContent(m.tok));
  const last = moves[moves.length - 1];
  if (k.state.asked) {
    k.state.asked = false;
    const { ok } = k.judge(content);
    return ok ? YES : NO;
  }
  if (!last) return k.newCue();
  if (last.tok === ASK) {
    // it doesn't know / listens: answer (or demonstrate) what follows the last emoji
    const prev = k.lastContent();
    if (prev && k.rng() < 0.8) return k.send(k.answerFor(prev));
    return k.newCue();
  }
  if (last.tok === YES) return k.rng() < 0.3 ? YES : k.newCue();
  if (last.tok === NO) return k.newCue();
  const c = last.tok;
  if (k.isNewFromCreature(c) && k.rng() < 0.35) {
    k.S.adopted++;
    return k.send(c);
  }
  const { judged, ok } = k.judge(content);
  if (judged && ok) {
    const r = k.rng();
    if (r < 0.15 && k.mind.totalInputs > 40) {
      k.state.asked = true;
      return ASK;
    }
    if (r < 0.8) return YES;
    return k.send(k.answerFor(c));
  }
  if (judged && !ok && k.rng() < 0.45) return NO;
  return k.rng() < 0.75 ? k.send(k.answerFor(c)) : k.send(k.newCue());
}

function chaotic(k) {
  const r = k.rng();
  if (r < 0.05) return ASK;
  if (r < 0.13) return k.pick([YES, NO, ASK]);
  return k.pick(k.random());
}

function affectionate(k, moves) {
  const last = moves[moves.length - 1];
  if (!last) return k.newCue();
  if (last.tok === YES) return k.rng() < 0.6 ? YES : k.newCue();
  if (last.tok === ASK) return k.send(k.answerFor(k.lastContent() || k.pick(k.random()), 0.6));
  if (last.tok === NO) return k.newCue();
  const r = k.rng();
  if (r < 0.45) return YES;
  if (r < 0.75) return k.send(k.answerFor(last.tok, 0.6));
  if (r < 0.92) return k.newCue();
  if (k.isNewFromCreature(last.tok)) k.S.adopted++;
  return k.send(last.tok);
}

function mirror(k, moves) {
  const last = moves[moves.length - 1];
  if (!last || !isContent(last.tok)) return k.rng() < 0.3 ? YES : k.newCue();
  const c = last.tok;
  const r = k.rng();
  if (c === k.state.lastSent && r < 0.4) return YES; // it mirrored me
  if (r < 0.55) {
    if (k.isNewFromCreature(c)) k.S.adopted++;
    return k.send(c); // mirror it
  }
  if (r < 0.7 && k.state.lastSent) return k.send(k.state.lastSent); // alternate
  if (r < 0.8) return YES;
  return k.newCue();
}

function minimalist(k, moves) {
  const last = moves[moves.length - 1];
  const r = k.rng();
  if (r < 0.35) return ASK;
  if (last && isContent(last.tok)) {
    if (r < 0.5) return YES;
    if (r < 0.8) return k.send(k.answerFor(last.tok));
  }
  return k.newCue();
}

export const PERSONAS = {
  teacher: { play: teacher, patience: [35, 90], sessions: 3, desc: 'consistent language, teaches with ✅ ❌ ❓, demonstrates when it waits' },
  devoted: { play: teacher, patience: [Infinity, Infinity], sessions: 3, desc: 'like teacher, but plays every session until it falls asleep' },
  shifter: { play: teacher, patience: [35, 90], sessions: 3, shiftDay: 6, desc: 'like teacher, but from day 6 on switches to a completely new language and new favourite emojis' },
  affectionate: { play: affectionate, patience: [35, 90], sessions: 3, desc: 'lots of ✅ for almost anything, loose language (60% consistent), sometimes picks up its emojis, never ❌' },
  mirror: { play: mirror, patience: [35, 90], sessions: 3, desc: 'mirrors its emojis, alternates, ✅ when it mirrors back' },
  chaotic: { play: chaotic, patience: [30, 70], sessions: 3, desc: 'random emojis from the keyboard, random signs, no language' },
  minimalist: { play: minimalist, patience: [8, 25], sessions: 2, desc: 'short sessions twice a day, passes (❓) a lot, few emojis' },
};

// ───────────────────────── simulation ─────────────────────────

export function simulate({ persona, seed, days = 10, params = DEFAULT_PARAMS }) {
  const P = { ...params };
  const spec = PERSONAS[persona];
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const between = (a, b) => a + rng() * (b - a);

  const save = { format: 3, engine: ENGINE_VERSION, seed, clockOffset: 0, history: [] };
  const mind = new Mind(P, seed);
  let t = Date.UTC(2026, 10, 24, 7, 0);
  const push = (e) => {
    save.history.push(e);
    mind.observe(e);
  };
  push({ t, who: 'S', tok: BIRTH, m: makeCharacter(rngFor(seed, 'character'), P.characterSize).join(' ') });

  // keyboard, like the app: "Zuletzt" (recent emojis, both speakers) | the hour's random set
  const frequent = () => recentEmojis(save.history, 22);
  const randomOf = () => hourlySet(seed, t);
  let randomSel = randomOf();
  const refreshRandom = () => (randomSel = randomOf());
  const visible = () => new Set([...frequent(), ...randomOf()]);
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
      if (r < 0.05) return ASK;
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

  const sessions = [];
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
      // does its own (non-elaboration) move repeat a 3-emoji sequence from the last 20 emojis?
      if (isContent(d.tok) && d.m !== 'answer' && mind.seq.length >= 2) {
        const w = mind.seq.slice(-20);
        const key = mind.seq[mind.seq.length - 2] + SEP + mind.seq[mind.seq.length - 1] + SEP + d.tok;
        let seen = false;
        for (let i = 2; i < w.length && !seen; i++) seen = w[i - 2] + SEP + w[i - 1] + SEP + w[i] === key;
        S.ownMoves++;
        if (seen) S.ownRepeats++;
      }
      push({ t, who: d.tok === SLEEP ? 'S' : 'C', tok: d.tok, ...(d.m ? { m: d.m } : {}) });
      if (d.tok === SLEEP) {
        S.endedBySleep = true;
        return;
      }
      if (isNew) S.introduced++;
      if (isContent(d.tok)) {
        S.cContent++;
        if (CREATIVE.has(name)) S.creative++;
        if (mind.character.includes(d.tok)) S.characterMoves++;
        if (S.day > 2 && earlyEmojis.has(d.tok)) S.earlyMoves++;
        if (S.day <= 2) earlyEmojis.add(d.tok);
      }
      if (isContent(d.tok)) measureReply(d.tok, mind.seq.length - 1, d.m !== 'retry' && d.m !== 'answer');
      moves.push({ tok: d.tok, i: mind.seq.length - 1, firstTry: d.m !== 'retry' });
    }
  }

  function runSession(day, start) {
    t = Math.max(t, start);
    S = {
      day, index: ++sessionIndex, inputs: 0, blocked: 0, adopted: 0, introduced: 0,
      firstTry: 0, firstTryOk: 0, oldJudged: 0, oldUsed: 0, cContent: 0, creative: 0,
      characterMoves: 0, earlyMoves: 0, ownMoves: 0, ownRepeats: 0, modes: {}, endedBySleep: false, woken: false,
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
    S.vocab = mind.vocab.size;
    S.memory = mind.mem.size;
    S.complexity = mind.complexity().score;
    S.look = JSON.parse(JSON.stringify(mind.look));
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
  return { persona, seed, sessions, mind, save, character: mind.character };
}
