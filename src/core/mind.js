// The creature's mind (simple core, docs/07). Everything is rebuilt from the history:
// mind = replay(history). observe(entry) is the only way state changes, live and on replay.
// decide() picks its next move; the app writes it into the history and observes it.

import { YES, NO, ASK, SLEEP, WAKE, BIRTH, LEGACY, SEP, isElemental, isContent } from './tokens.js';
import { rngFor, sample, pick, hashString } from './rng.js';
import { makeCharacter } from './emojiIndex.js';
import { hourlySet } from './keyboard.js';
import { Memory } from './memory.js';

export const LOOK_SLOTS = ['face', 'extremities', 'hair', 'object'];
export const LOOK_TRAITS = ['shape', 'size', 'texture']; // continuous, 0…1 (plus a hue per slot)

/** How different two looks are: mean absolute trait difference over the slots (0 = same, ~0.3+ = very different). */
export function lookDistance(a = {}, b = {}) {
  let d = 0;
  let n = 0;
  for (const slot of LOOK_SLOTS) {
    const x = a[slot];
    const y = b[slot];
    if (!x || !y) continue;
    for (const t of LOOK_TRAITS) d += Math.abs(x[t] - y[t]);
    d += Math.abs(((x.hue - y.hue + 540) % 360) - 180) / 180;
    n += LOOK_TRAITS.length + 1;
  }
  return n ? d / n : 0;
}

/**
 * Chance that your sign wakes it while it sleeps, from its energy (0…1): never below tiredBelow (10%),
 * rising steadily to 70% at 70% energy, always at full energy.
 */
export function wakeChance(energyFraction, p) {
  if (energyFraction >= 1) return 1;
  return Math.min(1, Math.max(0, ((energyFraction - p.tiredBelow) * 0.7) / (0.7 - p.tiredBelow)));
}

export class Mind {
  constructor(params, seed) {
    this.p = params;
    this.seed = seed;

    // memory
    this.seq = []; // the conversation's ordinary emojis, both speakers
    this.seqWho = []; // 'P' | 'C' per emoji
    this.vocab = new Map(); // emoji -> { count, playerCount, firstWho }
    this.mem = new Memory(params);
    this.character = []; // seed emojis from birth (babbled while it knows nothing)

    // body & time
    this.capacity = params.capacity;
    this.energy = this.capacity;
    this.awake = false;
    this.sleep = null; // { start, count, interval, dream, rate, restedAt, energyAtStart }
    this.sleepCount = 0;
    this.turn = null; // 'C' | 'P' | null (asleep)
    this.lastEntryT = 0;
    this.lastActivity = 0;
    this.sessionInputs = 0;
    this.totalInputs = 0;

    // conversation state
    this.question = false; // it asked ❓ and waits for your answer
    this.chain = []; // its emojis since your last emoji: [{ ctx, tok }] (what ✅ / ❌ refer to)
    this.rejected = null; // after ❌: emojis to avoid in its retry
    this.asked = false; // you sent ❓: it answers with one best guess
    this.lastEval = null; // how your last emoji compared to its expectation
    this.lastCreatureAsk = false;
    this.askStreak = 0; // your ❓ in a row

    // appearance basis: slot -> { shape, size, texture, hue, presence, color } (at birth and after each sleep)
    this.look = {};
    this.lookMix = []; // [emoji, share] the look is blended from
    this._cx = null; // cached complexity

    // stats for the test panel
    this.stats = { yes: 0, no: 0, dreamLearned: 0 };
  }

  static replay(save, params) {
    const m = new Mind(params, save.seed);
    for (const e of save.history) m.observe(e);
    return m;
  }

  // ───────────────────────── observing the history ─────────────────────────

  observe(e) {
    this.lastEntryT = e.t;
    const tok = LEGACY[e.tok] || e.tok;
    if (tok === BIRTH) return this.born(e);
    if (tok === SLEEP) return this.awake && this.fallAsleep(e.t);
    if (tok === WAKE) return !this.awake && this.wakeUp(e.t);
    if (e.who === 'P') {
      if (isElemental(tok)) this.playerSignal(tok, e.t);
      else this.playerTurn(tok, e.t);
    } else if (isElemental(tok)) this.creatureSignal(tok);
    else this.creatureMove(tok);
  }

  born(e) {
    this.character = e.m ? e.m.split(' ') : makeCharacter(rngFor(this.seed, 'character'), this.p.characterSize);
    this.updateLook();
    this.awake = true;
    this.turn = 'C';
    this.lastActivity = e.t;
  }

  append(tok, who) {
    this.seq.push(tok);
    this.seqWho.push(who);
    let v = this.vocab.get(tok);
    if (!v) {
      v = { count: 0, playerCount: 0, firstWho: who };
      this.vocab.set(tok, v);
    }
    v.count++;
    if (who === 'P') v.playerCount++;
  }

  context() {
    return this.seq.slice(-this.p.contextMax);
  }

  input(t, cost) {
    this.energy -= cost;
    this.sessionInputs++;
    this.totalInputs++;
    this.lastActivity = t;
    this.asked = false;
    this.turn = 'C';
  }

  /** You sent an ordinary emoji: it learns what follows the recent sequence. */
  playerTurn(tok, t) {
    const pred = this.predict();
    const sure = pred.top ? pred.conf * pred.dist.get(pred.top) : 0;
    this.lastEval = { tok, expected: pred.top, sure, matched: tok === pred.top, asked: this.question };
    this.mem.learn(this.context(), tok, this.question ? this.p.questionBoost : 1);
    this.append(tok, 'P');
    this.question = false;
    this.chain = [];
    this.rejected = null;
    this.askStreak = 0;
    this.input(t, 1);
  }

  /** You sent ✅ ❌ or ❓ (❓ = your turn / what comes next?). */
  playerSignal(tok, t) {
    const chain = this.chain;
    if (tok === YES) {
      // reinforce its reaction: the link to the emoji it answered and to the sequence it answered
      for (const c of chain) this.mem.reinforce(c.ctx, c.tok, 1, this.p.yesWeight);
      this.stats.yes++;
    } else if (tok === NO) {
      // weaken the same links clearly (halve them), and let it try something else
      for (const c of chain) this.mem.reinforce(c.ctx, c.tok, this.p.noFactor, -this.p.noWeight);
      this.stats.no++;
    }
    this.askStreak = tok === ASK ? this.askStreak + 1 : 0;
    this.lastEval = { tok, signal: true, about: tok === ASK ? [] : chain.map((c) => c.tok), streak: this.askStreak };
    if (tok !== ASK) this.chain = []; // ❓ lets it carry on, so a later ✅ / ❌ still covers what it said
    this.question = false;
    this.input(t, 0.5);
    if (tok === NO && chain.length) this.rejected = new Set(chain.map((c) => c.tok));
    if (tok === ASK) this.asked = true; // "what comes next?": it answers with one best guess
  }

  /** Its ordinary emoji. Not learned by itself; only ✅ / ❌ (and dreams) teach it its own moves. */
  creatureMove(tok) {
    this.chain.push({ ctx: this.context(), tok });
    this.append(tok, 'C');
    this.question = false;
    this.rejected = null;
    this.lastCreatureAsk = false;
    this.asked = false;
    this.turn = 'P'; // one sign, then it waits for you
  }

  /** Its sign: ❓ = "I don't know / I'm listening" (your next emoji counts as an answer), ✅ ❌ react. */
  creatureSignal(tok) {
    this.question = tok === ASK;
    this.lastCreatureAsk = tok === ASK;
    this.asked = false;
    this.rejected = null;
    this.turn = 'P';
  }

  // ───────────────────────── predicting & deciding ─────────────────────────

  predict() {
    return this.mem.predict(this.seq);
  }

  label() {
    return this.awake ? '' : 'sleeping';
  }

  /**
   * A new emoji (novelty or surprise): one from the current hourly keyboard set, one it hasn't used
   * yet if possible. Every emoji it tries for the first time comes from there.
   */
  paletteEmoji(rng, now) {
    const set = hourlySet(this.seed, now);
    const unused = set.filter((e) => !this.vocab.has(e));
    const recent = new Set(this.seq.slice(-12));
    const pool = unused.length ? unused : set.filter((e) => !recent.has(e));
    return pick(pool.length ? pool : set, rng);
  }

  /** Sample from a distribution with a given chaos, leaving out some emojis. */
  sampleFrom(dist, T, rng, exclude) {
    const entries = [...dist].filter(([t]) => !exclude || !exclude.has(t)).map(([t, q]) => [t, Math.pow(q, 1 / T)]);
    return entries.length ? sample(entries, rng) : null;
  }

  top3(pred, exclude) {
    return [...pred.dist]
      .filter(([t]) => !exclude || !exclude.has(t))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, q]) => [t, q * pred.conf]);
  }

  /**
   * Its move: { tok, m, why }. Uses rng (not deterministic), but the result is written into the
   * history, so replay never needs to repeat it. `now` picks the hourly keyboard set for surprises.
   */
  decide(rng = Math.random, now = this.lastEntryT) {
    const p = this.p;
    const pred = this.predict();
    const sure = pred.top ? pred.conf * pred.dist.get(pred.top) : 0;
    const base = { pred };

    // 1. you sent ❓: what comes next? If it knows a continuation of the recent sequence (its own
    // emojis included), it follows its learned pattern, however many ❓ in a row, so you can draw out
    // and ✅ longer chains. Only when it doesn't know: ❓ back, or with several ❓ in a row a surprise.
    if (this.asked) {
      if (pred.top && sure >= p.answerMinSure) {
        const tok = this.sampleFrom(pred.dist, 0.3, rng);
        return { tok, m: 'answer', why: { ...base, mode: `continues its pattern (your ❓${this.askStreak > 1 ? ' ×' + this.askStreak : ''})`, top3: this.top3(pred) } };
      }
      const pAskSurprise = Math.min(0.85, p.askSurprise * (this.askStreak - 1));
      if (rng() < pAskSurprise) {
        return { tok: this.paletteEmoji(rng, now), m: 'surprise', why: { ...base, mode: `doesn't know: surprise (your ❓ ×${this.askStreak})` } };
      }
      return { tok: ASK, why: { ...base, mode: "doesn't know: asks you back", top3: this.top3(pred) } };
    }

    // 2. sleepy?
    const e = this.energy / this.capacity;
    if (this.energy <= 0) return { tok: SLEEP, why: { mode: 'falls asleep (no energy left)' } };
    if (e < p.sleepyBelow && rng() < ((p.sleepyBelow - e) / p.sleepyBelow) * 0.35) return { tok: SLEEP, why: { mode: 'nods off (sleepy)' } };

    // 3. you said ❌: try again with something else
    if (this.rejected) {
      const tok = this.sampleFrom(pred.dist, p.temperature, rng, this.rejected);
      if (tok && (pred.dist.get(tok) || 0) > 0.02) return { tok, m: 'retry', why: { ...base, mode: 'retry after ❌', top3: this.top3(pred, this.rejected) } };
      return { tok: this.paletteEmoji(rng, now), m: 'retry', why: { ...base, mode: 'retry after ❌: tries something new' } };
    }

    // 4. reacting to what you did
    const ev = this.lastEval;
    if (ev && !ev.signal) {
      if (ev.matched && ev.sure > 0.5 && rng() < p.reactYes) return { tok: YES, why: { ...base, mode: 'confirms ✅: you did what it expected' } };
      if (!ev.matched && ev.sure > 0.6 && rng() < p.reactNo) return { tok: NO, why: { ...base, mode: 'says ❌: it expected something else' } };
    }

    // 6. next-token prediction: patterns, a bit of chaos, sometimes something new.
    // The more repetitive the recent conversation, the likelier a totally new, surprising emoji.
    const T = p.temperature;
    const rep = this.repetitiveness();
    const pSurprise = Math.min(0.8, p.repeatNovelty * rep);
    const pNew = p.noveltyBase + pSurprise;
    const cands = new Map(); // key -> { p, mode, tok }
    const add = (key, prob, mode, tok) => {
      if (prob <= 0) return;
      const c = cands.get(key);
      if (c) c.p += prob;
      else cands.set(key, { p: prob, mode, tok });
    };
    let sumT = 0;
    for (const [, q] of pred.dist) sumT += Math.pow(q, 1 / T);
    for (const [t, q] of pred.dist) add(t, ((1 - pNew) * pred.conf * Math.pow(q, 1 / T)) / sumT, t === pred.top ? 'pattern' : 'variation', t);

    // no idea (no matching pattern): its general tendency, asking ❓, echoing you, or its seed character
    const clueless = (1 - pNew) * (1 - pred.conf);
    let lastPlayer = null;
    for (let i = this.seq.length - 1; i >= 0 && !lastPlayer; i--) if (this.seqWho[i] === 'P') lastPlayer = this.seq[i];
    const general = pred.general.size ? 0.45 : 0;
    add('⟨general⟩', clueless * general, 'general', null);
    add(ASK, clueless * 0.3 * (this.lastCreatureAsk ? 0.4 : 1), 'ask', ASK);
    if (lastPlayer) add(lastPlayer, clueless * 0.15, 'echo', lastPlayer);
    if (this.character.length) add('⟨character⟩', clueless * (0.55 - general + (lastPlayer ? 0 : 0.15)), 'character', null);
    add('⟨new⟩', p.noveltyBase, 'new', null);
    add('⟨surprise⟩', pSurprise, 'surprise', null);

    // loop avoidance: options that would continue a recent repetition (any length) count less;
    // the freed share goes to a totally new emoji
    const loops = this.loopFactors(this.seq, [...cands.values()].map((c) => c.tok).concat([...pred.general.keys()]));
    let removed = 0;
    for (const c of cands.values()) {
      const f = c.tok && loops.get(c.tok);
      if (f === undefined || f === null) continue;
      removed += c.p * (1 - f);
      c.p *= f;
    }
    add('⟨surprise⟩', removed, 'surprise', null);

    // never fully predictable: cap the top choice, the excess goes to the other options
    let total = 0;
    for (const c of cands.values()) total += c.p;
    let topKey = null;
    for (const [k, c] of cands) if (!topKey || c.p > cands.get(topKey).p) topKey = k;
    if (topKey && cands.get(topKey).p / total > p.maxCertainty) {
      const topC = cands.get(topKey);
      const excess = topC.p - p.maxCertainty * total;
      topC.p -= excess;
      const others = [...cands].filter(([k]) => k !== topKey);
      const sumOthers = others.reduce((s, [, c]) => s + c.p, 0);
      if (sumOthers > 0) for (const [, c] of others) c.p += (excess * c.p) / sumOthers;
      else add('⟨new⟩', excess, 'new', null);
    }

    const key = sample([...cands].map(([k, c]) => [k, c.p]), rng);
    const c = cands.get(key);
    let tok = c.tok;
    if (key === '⟨new⟩') tok = this.paletteEmoji(rng, now);
    else if (key === '⟨general⟩') {
      const g = new Map([...pred.general].map(([t, q]) => [t, q * (loops.get(t) ?? 1)]));
      tok = this.sampleFrom(g, T, rng);
    }
    else if (key === '⟨character⟩') tok = pick(this.character, rng);
    else if (key === '⟨surprise⟩') tok = this.paletteEmoji(rng, now);
    const top3 = [...cands.values()]
      .sort((a, b) => b.p - a.p)
      .slice(0, 3)
      .map((x) => [x.tok || x.mode, x.p / total]);
    return { tok, m: tok === ASK ? undefined : c.mode, why: { ...base, mode: c.mode, top3, repetition: rep } };
  }

  /**
   * Loop avoidance. For each candidate that occurs in the recent window: how often would choosing it
   * repeat what just happened? Counts earlier occurrences of the 2…6-emoji sequence it would complete
   * (pairs from their 2nd occurrence), plus (beyond 2) how often the emoji itself is among the last 12. Returns emoji -> factor e^(−s·count)
   * (only for factors < 1).
   */
  loopFactors(seq, candidates) {
    const p = this.p;
    const out = new Map();
    if (!p.loopStrength || seq.length < 1) return out;
    const w = seq.slice(-p.loopWindow);
    const inWindow = new Set(w);
    const last12 = seq.slice(-12);
    for (const t of new Set(candidates)) {
      if (!t || !inWindow.has(t)) continue;
      let rep = 0;
      for (let n = 2; n <= 6 && n - 1 <= w.length; n++) {
        // the n-emoji sequence that choosing t would complete: last n−1 emojis + t
        const head = w.slice(w.length - (n - 1));
        let occ = 0;
        for (let i = 0; i + n <= w.length; i++) {
          let match = w[i + n - 1] === t;
          for (let j = 0; match && j < n - 1; j++) match = w[i + j] === head[j];
          if (match) occ++;
        }
        // a pair seen once before is just consistency (answering the same thing again); it counts from
        // the second time. Longer sequences count right away (a loop always repeats those too).
        rep += n === 2 ? Math.max(0, occ - 1) : occ;
      }
      let same = 0;
      for (const e of last12) if (e === t) same++;
      rep += Math.max(0, same - 2) * 0.5;
      if (rep > 0) out.set(t, Math.exp(-p.loopStrength * rep));
    }
    return out;
  }

  /**
   * How repetitive the recent conversation is, 0…1: the larger of
   * - the share of 3-emoji sequences in the last 20 emojis that already occurred there
   * - how much one emoji dominates the last 12 (one emoji in 1 of 4 is normal, all of them = 1)
   */
  repetitiveness() {
    const w = this.seq.slice(-this.p.loopWindow);
    if (w.length < 6) return 0;
    const seen = new Set();
    let rep = 0;
    for (let i = 2; i < w.length; i++) {
      const key = w[i - 2] + SEP + w[i - 1] + SEP + w[i];
      if (seen.has(key)) rep++;
      seen.add(key);
    }
    const pattern = rep / (w.length - 2);
    const last = this.seq.slice(-12);
    const counts = new Map();
    for (const e of last) counts.set(e, (counts.get(e) || 0) + 1);
    const top = Math.max(...counts.values()) / last.length;
    const symbol = Math.max(0, (top - 0.25) / 0.75);
    return Math.min(1, Math.max(pattern, symbol));
  }

  // ───────────────────────── sleep ─────────────────────────

  fallAsleep(t) {
    // energy recovers steadily: empty → full in fullRecoveryMin
    const energyAtStart = Math.max(0, this.energy);
    const missing = Math.max(this.capacity * 0.05, this.capacity - energyAtStart);
    const rate = this.capacity / (this.p.fullRecoveryMin * 60000); // energy per ms
    const duration = missing / rate;
    const interval = this.p.dreamIntervalSec * 1000;
    const count = Math.max(3, Math.ceil(duration / interval));
    this.sleep = { start: t, count, interval, dream: this.dream(count), rate, restedAt: t + duration, energyAtStart };
    this.awake = false;
    this.turn = null;
    this.question = false;
    this.asked = false;
    this.rejected = null;
    this.chain = [];
    this.lastEval = null;
    this.sleepCount++;
  }

  /**
   * The dream: a string of next-token predictions continuing from the whole conversation so far.
   * Not stored; regenerated from the seed. Learned on waking (as far as it got).
   */
  dream(count) {
    const rng = rngFor(this.seed, 'dream', this.sleepCount);
    const ctx = this.context();
    const recent = this.seq.slice(-this.p.loopWindow); // the dream's own recent emojis (for loop avoidance)
    const out = [];
    for (let i = 0; i < count; i++) {
      const pr = this.mem.predict(ctx);
      const mix = new Map();
      for (const [t, q] of pr.dist) mix.set(t, pr.conf * q);
      for (const [t, q] of pr.general) mix.set(t, (mix.get(t) || 0) + (1 - pr.conf) * q);
      // loop avoidance in dreams too: the freed share goes to other emojis it knows (general tendency)
      const loops = this.loopFactors(recent, [...mix.keys()]);
      let removed = 0;
      for (const [t, f] of loops) {
        removed += mix.get(t) * (1 - f);
        mix.set(t, mix.get(t) * f);
      }
      if (removed > 0) for (const [t, q] of pr.general) mix.set(t, mix.get(t) + removed * q * (loops.get(t) ?? 1));
      const tok = mix.size ? this.sampleFrom(mix, this.p.dreamTemperature, rng) : null;
      out.push(tok);
      if (tok) {
        ctx.push(tok);
        if (ctx.length > this.p.contextMax) ctx.shift();
        recent.push(tok);
        if (recent.length > this.p.loopWindow) recent.shift();
      }
    }
    return out;
  }

  // ───────────────────────── complexity & appearance ─────────────────────────

  /**
   * Complexity: how many different emojis take part in learned patterns, and in how many different
   * ways. Every learned pair ("after a comes b", ≥ 20% of what followed, really happened ≥ repsToLearn×
   * or got ✅) counts
   * for both emojis. A longer pattern counts only where the longer context changes the answer.
   * Score = Σ over emojis of log2(1 + number of different patterns it's part of). Random spam forms
   * no learned patterns, so it adds nothing.
   * Returns { score, signs, variety: emoji -> count, weight: emoji -> summed pattern weight }.
   */
  complexity() {
    if (this._cx && this._cx.version === this.mem.version) return this._cx.value;
    const p = this.p;
    const minW = p.repsToLearn * 0.75;
    const variety = new Map();
    const weight = new Map();
    const note = (e, key, w) => {
      if (!variety.has(e)) variety.set(e, new Set());
      variety.get(e).add(key);
      weight.set(e, (weight.get(e) || 0) + w);
    };
    const minN = Math.max(2, Math.round(p.repsToLearn)); // it must really have happened repeatedly
    for (const x of this.mem.learned(1, 0.2, minW, minN)) {
      note(x.ctx[0], '→' + x.next, x.w);
      note(x.next, '←' + x.ctx[0], x.w);
    }
    for (let L = 2; L <= p.contextMax; L++) {
      for (const x of this.mem.learned(L, 0.2, minW, minN)) {
        if (this.mem.topAfter(x.ctx[x.ctx.length - 1]) === x.next) continue; // says nothing new
        const key = 'ctx:' + x.ctx.join(SEP) + '→' + x.next;
        for (const e of new Set([...x.ctx, x.next])) note(e, key, x.w);
      }
    }
    let score = 0;
    const counts = new Map();
    for (const [e, set] of variety) {
      counts.set(e, set.size);
      score += Math.log2(1 + set.size);
    }
    const value = { score, signs: variety.size, variety: counts, weight };
    this._cx = { version: this.mem.version, value };
    return value;
  }

  /**
   * Appearance basis (graphics come later). Each slot (face, extremities, hair/hat, object) has
   * continuous traits: shape, size, texture (0…1) and a hue. Every emoji carries its own fixed trait
   * values; the creature's traits are a blend of the emojis that weigh most in its learned patterns.
   * So a small change in its patterns changes the look a little, a big change a lot. After each sleep
   * the look moves lookFollow (half) of the way to that blend, so even big changes take a few nights.
   * Slots fade in with complexity (presence 0…1). Before it has learned anything, its seed character
   * is the blend.
   */
  updateLook() {
    const p = this.p;
    const { weight, score } = this.complexity();
    let ranked = [...weight].sort((a, b) => b[1] - a[1]).slice(0, p.lookTop);
    if (!ranked.length) ranked = this.character.map((e) => [e, 1]);
    // sharpened shares: the strongest emojis dominate, the rest still count a little
    const sq = ranked.map(([e, w]) => [e, w * w]);
    const sum = sq.reduce((a, [, w]) => a + w, 0) || 1;
    const mix = sq.map(([e, w]) => [e, w / sum]);
    const spread = Math.sqrt(mix.reduce((a, [, q]) => a + q * q, 0)) || 1;
    const u = (slot, trait, e) => hashString(`look:${slot}:${trait}:${e}`) / 4294967296; // fixed per emoji, 0…1
    const follow = Object.keys(this.look).length ? p.lookFollow : 1;
    const look = {};
    LOOK_SLOTS.forEach((slot, i) => {
      const target = {};
      for (const trait of LOOK_TRAITS) {
        // weighted mean, rescaled so a blend of many emojis varies as much as a single one would
        const m = mix.reduce((a, [e, q]) => a + q * u(slot, trait, e), 0);
        target[trait] = Math.min(1, Math.max(0, 0.5 + (m - 0.5) / spread));
      }
      let x = 0;
      let y = 0;
      for (const [e, q] of mix) {
        const a = u(slot, 'hue', e) * 2 * Math.PI;
        x += q * Math.cos(a);
        y += q * Math.sin(a);
      }
      target.hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const th = p.lookUnlock[i];
      target.presence = th <= 0 ? 1 : Math.min(1, Math.max(0, (score - th) / th));
      const cur = this.look[slot] || target;
      const o = {};
      for (const k of [...LOOK_TRAITS, 'presence']) o[k] = +(cur[k] + follow * (target[k] - cur[k])).toFixed(3);
      const dh = ((target.hue - cur.hue + 540) % 360) - 180; // the short way round the colour wheel
      o.hue = Math.round((cur.hue + follow * dh + 360) % 360);
      o.color = `hsl(${o.hue} 60% 80%)`;
      look[slot] = o;
    });
    this.look = look;
    this.lookMix = mix.map(([e, q]) => [e, +q.toFixed(3)]);
  }

  isRested(now) {
    return !!this.sleep && now >= this.sleep.restedAt;
  }

  dreamIndex(now) {
    if (!this.sleep) return -1;
    return Math.min(this.sleep.count - 1, Math.floor((now - this.sleep.start) / this.sleep.interval));
  }

  /** Current energy, including what it has recovered so far while sleeping. */
  energyAt(now) {
    if (!this.sleep) return this.energy;
    const s = this.sleep;
    return Math.min(this.capacity, s.energyAtStart + Math.max(0, now - s.start) * s.rate);
  }

  wakeUp(t) {
    if (this.sleep) {
      // learn from the dream, as far as it got: patterns that came up in the dream get stronger
      const s = this.sleep;
      const n = Math.min(s.count, Math.floor((t - s.start) / s.interval) + 1);
      const ctx = this.context();
      for (const tok of s.dream.slice(0, n)) {
        if (!tok) continue;
        this.mem.learn(ctx, tok, this.p.dreamWeight, false);
        ctx.push(tok);
        if (ctx.length > this.p.contextMax) ctx.shift();
      }
      this.stats.dreamLearned = n;
      this.energy = this.energyAt(t);
      this.updateLook(); // its look changes (if at all) while it sleeps
    }
    this.sleep = null;
    this.awake = true;
    this.turn = 'C';
    this.sessionInputs = 0;
  }
}
