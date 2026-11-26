// The creature's mind: the sign engine (docs/08). Everything is rebuilt from the history:
// mind = replay(history). observe(entry) is the only way state changes, live and on replay.
// decide() picks its next move; the app writes it into the history and observes it.

import { YES, NO, ASK, SLEEP, WAKE, BIRTH, ENERGY, LEGACY, isElemental } from './tokens.js';
import { measureComplexity } from './complexity.js';
import { rngFor, sample, pick, hashString } from './rng.js';
import { makeCharacter, ALL } from './emojiIndex.js';
import { PARTS, DEFAULT_POSE, SLEEP_POSE, SPECIAL_POSE, MAX_LEVEL, OBJECT_SPOTS, levelFor, randomMove, mutateMove } from './look.js';
import { hourlySet } from './keyboard.js';
import { Assoc, strength } from './assoc.js';

const pct = (x) => `${Math.round(x * 100)}%`;

export class Mind {
  constructor(params, seed) {
    this.p = params;
    this.seed = seed;

    // memory
    this.assoc = new Assoc(params);
    this.seq = []; // the conversation's real signs (both speakers): { tok, who, h }; taken-back ones removed
    this.outputs = []; // its own awake real signs: { tok, h } (for its top signs)
    this.vocab = new Set(); // every real sign that came up (surprises prefer others)
    this.character = []; // seed signs from birth
    this.takenBack = new Set(); // history indices of signs taken back ("not that, this")
    this.h = -1; // history index of the entry being observed

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
    this.lastPlayer = null; // your last input: 'sign' | ✅ | ❌ | ❓
    this.lastEval = null; // your last real sign vs its expectation: { tok, p, top, pTop }
    this.reaction = null; // its last ✓ / ✗: { ctx, tok, amount } (your next ✓ / ✗ repeats or inverts it)
    this.rejected = []; // signs ✗'d in a row, taken back by a ✓ after its next sign
    this.armed = false; // it answered your ✗ with a real sign: a ✓ now takes back `rejected`
    this.waitStreak = 0; // your ☐ in a row
    this.pendingCut = false; // a special sign came since the last real sign
    this.greeting = false; // it woke up by itself: its next move is a surprise sign
    this.lastEffect = null; // what the last ✓ / ✗ did (for the panel)

    // top signs → parts (look) and voice (D77)
    this.seats = []; // [{ seat: part name, tok, uses }], in rank order: eyes, hat, mouth, legs, arms, nose, object
    this.moves = new Map(); // sign -> its move (7 digits 1–6)
    this.pose = DEFAULT_POSE.slice(); // the variants shown now
    this.awaiting = null; // its last real sign, waiting for your answer (which changes that sign's move)
    this.level = 1; // from complexity
    this.objectSpot = 0; // where its object stands (OBJECT_SPOTS); another spot each time it says something

    this.stats = { yes: 0, no: 0, takenBack: 0, dreamLearned: 0 };

    // complexity, measured after each long enough dream (D75)
    this.complexity = null; // { value, known, order, t }
    this.complexityLog = []; // earlier measurements, oldest first
  }

  static replay(save, params) {
    const m = new Mind(params, save.seed);
    for (const e of save.history) m.observe(e);
    return m;
  }

  // ───────────────────────── observing the history ─────────────────────────

  observe(e) {
    this.h++;
    this.lastEntryT = e.t;
    const tok = LEGACY[e.tok] || e.tok;
    if (tok === BIRTH) return this.born(e);
    if (tok === SLEEP) return this.awake && this.fallAsleep(e.t);
    if (tok === WAKE) return !this.awake && this.wakeUp(e.t, e.m !== 'manual');
    if (tok === ENERGY) return this.setEnergy(e.t, Number(e.m));
    if (e.who === 'P') {
      this.answerMove(tok);
      if (isElemental(tok)) this.playerSpecial(tok, e.t);
      else this.playerSign(tok, e.t);
    } else {
      this.moveObject();
      if (isElemental(tok)) this.creatureSpecial(tok);
      else this.creatureSign(tok);
    }
  }

  born(e) {
    this.character = e.m ? e.m.split(' ') : makeCharacter(rngFor(this.seed, 'character'), this.p.characterSize);
    this.updateSeats();
    this.awake = true;
    this.turn = 'C';
    this.lastActivity = e.t;
  }

  /** The last `levels` real signs (the context for what comes next). */
  context(toks = this.seq) {
    return toks.slice(-this.p.levels).map((x) => (typeof x === 'string' ? x : x.tok));
  }

  push(tok, who) {
    const entry = { tok, who, h: this.h, cutBefore: this.pendingCut }; // cutBefore: a special sign came right before it
    this.pendingCut = false;
    this.seq.push(entry);
    this.vocab.add(tok);
    return entry;
  }

  /**
   * How many levels a link to the sign at index i (of `list`; i = list.length for a new sign) may
   * change: level 1 always; levels 2–4 only if no special sign (✓ ✗ ☐, yours or its) came anywhere
   * between the signs of that chain. `cutOfTarget`: a special sign came right before the sign itself.
   */
  chainLevels(list, i, cutOfTarget) {
    let L = 1;
    let ok = !cutOfTarget;
    for (let j = i - 1; L < this.p.levels && ok && j - 1 >= 0; j--) {
      ok = !list[j].cutBefore;
      if (ok) L++;
    }
    return L;
  }

  input(t, cost) {
    this.assoc.tick(); // one more awake turn: all links drift a little towards 0
    this.energy -= cost;
    this.sessionInputs++;
    this.totalInputs++;
    this.lastActivity = t;
    this.turn = 'C';
  }

  /** You sent a real sign: it strengthens that sign's links to what came before (levels 2–4 only
   * where no special sign interrupted the chain). */
  playerSign(tok, t) {
    const ex = this.expect();
    const mine = ex.probs.find(([s]) => s === tok);
    this.lastEval = { tok, p: mine ? mine[1] : 0, top: ex.probs[0]?.[0] ?? null, pTop: ex.probs[0]?.[1] ?? 0 };
    this.assoc.add(this.context(), tok, this.p.repeatWeight, this.chainLevels(this.seq, this.seq.length, this.pendingCut));
    this.push(tok, 'P');
    this.lastPlayer = 'sign';
    this.waitStreak = 0;
    this.reaction = null;
    this.rejected = [];
    this.armed = false;
    this.input(t, 1);
  }

  /** ✓ / ✗ on the last real sign and its links on all levels. Returns what it did. */
  applyToLast(amount) {
    const i = this.seq.length - 1;
    if (i < 0) return null;
    const ctx = this.context(this.seq.slice(0, i));
    const tok = this.seq[i].tok;
    const maxL = this.chainLevels(this.seq, i, this.seq[i].cutBefore);
    this.assoc.add(ctx, tok, amount, maxL);
    return { ctx, tok, amount, maxL };
  }

  /** Take a sign back: it stays in the history but is no longer context, nor its output. */
  takeBack(entry) {
    const i = this.seq.indexOf(entry);
    if (i < 0) return;
    // its gap goes with it: the next sign now follows what came before (the ✗ in between goes too)
    if (this.seq[i + 1]) this.seq[i + 1].cutBefore = entry.cutBefore;
    this.seq.splice(i, 1);
    const j = this.outputs.findIndex((o) => o.h === entry.h);
    if (j >= 0) this.outputs.splice(j, 1);
    this.takenBack.add(entry.h);
    this.stats.takenBack++;
  }

  /** You sent ✅ ❌ or ❓ (☐: "your turn"). */
  /** Your answer to its last real sign changes that sign's move: ✓ keeps it, ✗ re-rolls it, anything else changes one digit. */
  /** It says something: sometimes (objectMoveChance) its object moves to another spot around it. */
  moveObject() {
    const rng = rngFor(this.seed, 'spot', this.h);
    if (rng() >= this.p.objectMoveChance) return;
    const k = Math.floor(rng() * (OBJECT_SPOTS.length - 1));
    this.objectSpot = k >= this.objectSpot ? k + 1 : k;
  }

  answerMove(tok) {
    const sign = this.awaiting;
    this.awaiting = null;
    if (!sign || tok === YES) return;
    const rng = rngFor(this.seed, 'move', this.h);
    this.moves.set(sign, tok === NO ? randomMove(rng) : mutateMove(this.moves.get(sign), rng));
  }

  playerSpecial(tok, t) {
    this.pose = SPECIAL_POSE[tok].slice(); // your ✓ ✗ ❓ show their fixed pose
    const p = this.p;
    if (tok === ASK) {
      this.waitStreak = this.lastPlayer === ASK ? this.waitStreak + 1 : 1;
      this.rejected = [];
      this.armed = false;
      this.lastEffect = null;
    } else {
      this.waitStreak = 0;
      const desc = (x, what) => (x ? `${what} ${x.ctx.length ? x.ctx.join('') + ' → ' : ''}${x.tok} (${x.amount > 0 ? '+' : ''}${+x.amount.toFixed(2)})` : null);
      if (this.reaction) {
        // right after its ✓ / ✗: your ✗ inverts its effect, your ✓ applies it once more
        const r = this.reaction;
        const delta = tok === YES ? r.amount : -2 * r.amount;
        this.assoc.add(r.ctx, r.tok, delta, r.maxL);
        this.lastEffect = desc({ ...r, amount: delta }, tok === YES ? 'repeats its reaction:' : 'inverts its reaction:');
        this.rejected = [];
        this.armed = false;
      } else if (tok === YES) {
        // "not that, this": ✗ → its sign → ✓ takes back what was ✗'d, so the ✓ links its sign to
        // what came before the rejected one(s)
        const back = this.armed ? this.rejected.map((x) => x.tok) : [];
        if (this.armed) for (const x of this.rejected) this.takeBack(x);
        this.lastEffect = desc(this.applyToLast(p.yesWeight), back.length ? `takes back ${back.join('')}, then ✓` : '✓');
        this.rejected = [];
        this.armed = false;
      } else {
        const last = this.seq[this.seq.length - 1];
        this.lastEffect = desc(this.applyToLast(-p.noWeight), '✗');
        if (last) this.rejected = this.armed ? [...this.rejected, last] : [last];
        this.armed = false; // waits for its next sign
      }
      this.stats[tok === YES ? 'yes' : 'no']++;
    }
    this.reaction = null;
    this.lastPlayer = tok;
    this.pendingCut = true; // a special sign: higher-level chains don't reach across it
    this.input(t, 0.5);
  }

  /** Its real sign. Not learned by itself; only ✓ / ✗ (and dreams) teach it its own moves. */
  creatureSign(tok) {
    this.greeting = false;
    // its move for this sign (random the first time it says it); shown until its next sign
    if (!this.moves.has(tok)) this.moves.set(tok, randomMove(rngFor(this.seed, 'move', this.h)));
    this.pose = this.moves.get(tok).slice();
    this.awaiting = tok;
    const entry = this.push(tok, 'C');
    this.outputs.push({ tok, h: entry.h });
    if (this.rejected.length) this.armed = true;
    this.reaction = null;
    this.turn = 'P';
  }

  /** Its ✓ / ✗ (on your last real sign, like yours) or its ☐ (acts just like yours: no effect). */
  creatureSpecial(tok) {
    this.greeting = false;
    this.reaction = null;
    this.pose = SPECIAL_POSE[tok].slice();
    this.awaiting = null;
    if (tok === YES || tok === NO) {
      const r = this.applyToLast(tok === YES ? this.p.yesWeight : -this.p.noWeight);
      if (r) this.reaction = r;
    }
    this.rejected = [];
    this.armed = false;
    this.pendingCut = true;
    this.turn = 'P';
  }

  // ───────────────────────── expecting & deciding ─────────────────────────

  /**
   * Its expectation for what follows `ctx`: every level votes (level weight × link strength), the
   * votes per sign add up, and signs with a positive total get chances by softmax.
   * Returns { levels, votes: Map, probs: [[sign, p]] (best first) }.
   */
  expect(ctx = this.context()) {
    const levels = this.assoc.levelsFor(ctx);
    const votes = new Map();
    for (const lv of levels) for (const [s, w] of lv.links) votes.set(s, (votes.get(s) || 0) + lv.weight * strength(w));
    const pos = [...votes].filter(([, v]) => v > 0);
    let probs = [];
    if (pos.length) {
      const max = Math.max(...pos.map(([, v]) => v));
      const e = pos.map(([s, v]) => [s, Math.exp((v - max) / this.p.temperature)]);
      const sum = e.reduce((a, [, x]) => a + x, 0);
      probs = e.map(([s, x]) => [s, x / sum]).sort((a, b) => b[1] - a[1]);
    }
    return { levels, votes, probs };
  }

  /** Repetition pressure of the real signs: max over pattern length k (1–4) of m / k². */
  repetition(toks) {
    const w = toks.slice(-16);
    let best = { pressure: 0, k: 0, m: 0 };
    for (let k = 1; k <= 4; k++) {
      let m = 0;
      for (let i = w.length - 1; i - k >= 0 && w[i] === w[i - k]; i--) m++;
      const pressure = m / (k * k);
      if (pressure > best.pressure) best = { pressure, k, m };
    }
    return best;
  }

  /** Surprise chance: base + repetition + waiting, capped. */
  surpriseChance(toks = this.seq.map((x) => x.tok), waitStreak = this.waitStreak) {
    const p = this.p;
    const rep = this.repetition(toks);
    const repetition = p.repeatSurprise * rep.pressure;
    const waiting = waitStreak >= p.waitSurpriseFrom ? Math.min(p.waitSurpriseMax, p.waitSurprise * (waitStreak - p.waitSurpriseFrom + 1)) : 0;
    return { total: Math.min(p.surpriseMax, p.surpriseBase + repetition + waiting), base: p.surpriseBase, repetition, waiting, rep };
  }

  /** Chance of its ☐: base, rising when its top two expectations are close. */
  waitChance(probs) {
    const p = this.p;
    if (this.lastPlayer === ASK) return 0; // you're waiting: it carries on instead
    let c = p.waitBase;
    if (probs.length >= 2) {
      const gap = probs[0][1] - probs[1][1];
      if (gap <= p.waitClose) c += (p.waitMax - p.waitBase) * (1 - gap / p.waitClose);
    }
    return c;
  }

  /** How long it stays awake when left alone: shorter the more tired it is; never at full energy. */
  idleSleepMs() {
    const e = this.energy / this.capacity;
    if (e >= 1) return Infinity;
    return Math.max(this.p.idleSleepMinSec * 1000, this.p.idleSleepMin * 60000 * Math.max(0, e));
  }

  label() {
    return this.awake ? '' : 'sleeping';
  }

  /** With no expectation: one of its familiar signs (its seats: top signs, or its seed while it has none), by use. */
  familiar(rng) {
    return sample(this.seats.map((s) => [s.tok, 1 + s.uses]), rng);
  }

  /** A surprise: a random emoji from the hourly keyboard set at time t, preferring ones not used yet. */
  paletteEmoji(rng, t) {
    const set = hourlySet(this.seed, t);
    const unused = set.filter((e) => !this.vocab.has(e));
    return pick(unused.length ? unused : set, rng);
  }

  /**
   * Cross-association (crossAssociation, awake only): with chance `rate`, it doesn't say the sign
   * `tok` it picked but pretends `tok` was just said and says what it expects to follow that instead.
   * Returns the sign to say (tok itself if it expects nothing after it).
   */
  crossAssociate(tok, toks, rate, rng) {
    if (!rate || rng() >= rate) return tok;
    const ex = this.expect(this.context([...toks, tok]));
    return ex.probs.length ? sample(ex.probs, rng) : tok;
  }

  /**
   * Its move: { tok, m, why }. Uses rng (not deterministic), but the result is written into the
   * history, so replay never needs to repeat it.
   */
  decide(rng = Math.random, now = this.lastEntryT) {
    const p = this.p;
    const ex = this.expect();
    const sp = this.surpriseChance();
    const base = { ex, sp };

    // 1. tired?
    const e = this.energy / this.capacity;
    if (this.energy <= 0) return { tok: SLEEP, why: { mode: 'falls asleep (no energy left)' } };
    if (e < p.sleepyBelow && rng() < p.nodOffMax * ((p.sleepyBelow - e) / p.sleepyBelow) ** 2) return { tok: SLEEP, why: { mode: `nods off (tired: ${pct(e)} energy)` } };

    // woke up by itself: a sign from the surprise pool
    if (this.greeting) return { tok: this.paletteEmoji(rng, now), m: 'surprise', why: { ...base, mode: 'wakes up: a surprise' } };

    // 2. its own ✓ / ✗ on your real sign
    const ev = this.lastEval;
    if (this.lastPlayer === 'sign' && ev) {
      if (ev.p >= p.reactYesAt && rng() < p.reactYes) return { tok: YES, why: { ...base, mode: `✓: it expected your ${ev.tok} (${pct(ev.p)})` } };
      if (ev.top && ev.top !== ev.tok && ev.pTop >= p.reactNoTop && ev.p < p.reactNoBelow && rng() < p.reactNo) {
        return { tok: NO, why: { ...base, mode: `✗: it expected ${ev.top} (${pct(ev.pTop)}), not ${ev.tok} (${pct(ev.p)})` } };
      }
      if (rng() < p.reactBase) return { tok: ev.p > 0 ? YES : NO, why: { ...base, mode: `${ev.p > 0 ? '✓' : '✗'} (a rare reaction)` } };
    }

    // 3. its ☐
    const wc = this.waitChance(ex.probs);
    if (rng() < wc) return { tok: ASK, why: { ...base, mode: `☐ waits (${pct(wc)}${wc > p.waitBase ? ': unsure between its top two' : ''})` } };

    // 4. surprise
    if (rng() < sp.total) return { tok: this.paletteEmoji(rng, now), m: 'surprise', why: { ...base, mode: `surprise (${pct(sp.total)})` } };

    // 5. its expectation, or with none its seed (sometimes cross-associated: what would follow it)
    const toks = this.context();
    const cross = (pick0) => this.crossAssociate(pick0, toks, p.crossAssociation, rng);
    const crossWhy = (pick0) => `cross-association: would have said ${pick0}, says what follows it`;
    if (ex.probs.length) {
      const pick0 = sample(ex.probs, rng);
      const tok = cross(pick0);
      if (tok !== pick0) return { tok, m: 'expect', why: { ...base, mode: crossWhy(pick0) } };
      return { tok, m: 'expect', why: { ...base, mode: `expectation (${pct(ex.probs.find(([s]) => s === tok)[1])})` } };
    }
    if (this.seats.length && rng() < p.seedWhenClueless) {
      const pick0 = this.familiar(rng);
      const tok = cross(pick0);
      return { tok, m: 'seed', why: { ...base, mode: tok === pick0 ? 'no expectation: one of its familiar signs' : crossWhy(pick0) } };
    }
    return { tok: this.paletteEmoji(rng, now), m: 'surprise', why: { ...base, mode: 'no expectation: a surprise' } };
  }

  // ───────────────────────── sleep ─────────────────────────

  fallAsleep(t) {
    this.pose = SLEEP_POSE.slice(); // eyes closed, everything else default
    this.awaiting = null;
    // energy recovers steadily: empty → full in fullRecoveryMin
    const energyAtStart = Math.max(0, this.energy);
    const missing = Math.max(this.capacity * 0.05, this.capacity - energyAtStart);
    const rate = this.capacity / (this.p.fullRecoveryMin * 60000); // energy per ms
    const duration = missing / rate;
    const interval = this.p.dreamIntervalSec * 1000;
    const count = Math.max(3, Math.ceil(duration / interval));
    this.sleep = { start: t, count, interval, dream: this.dream(count, t, interval), rate, restedAt: t + duration, energyAtStart };
    this.awake = false;
    this.turn = null;
    this.lastPlayer = null;
    this.lastEval = null;
    this.reaction = null;
    this.rejected = [];
    this.armed = false;
    this.waitStreak = 0;
    this.sleepCount++;
  }

  /**
   * The dream: it answers itself with the same rules (votes, repetition surprise), without ✓ ✗ ☐.
   * Not stored; regenerated from the seed. Learned on waking (as far as it got).
   */
  dream(count, t0, interval) {
    const rng = rngFor(this.seed, 'dream', this.sleepCount);
    const toks = this.seq.map((x) => x.tok);
    const out = [];
    // dream jumps (D92): a dream surprise is usually a sign it knows a follower for (any of them,
    // equally likely), not a keyboard emoji, so the dream visits all of its memory, not only the strongest part
    const known = this.p.dreamJump ? this.knownStarts() : [];
    const surprise = (i) => (known.length && rng() < this.p.dreamJump ? pick(known, rng) : this.paletteEmoji(rng, t0 + i * interval));
    for (let i = 0; i < count; i++) {
      const ex = this.expect(this.context(toks));
      let tok;
      if (rng() < this.surpriseChance(toks, 0).total) tok = surprise(i);
      else if (ex.probs.length) tok = sample(ex.probs, rng);
      else tok = this.seats.length ? this.familiar(rng) : this.paletteEmoji(rng, t0 + i * interval);
      out.push(tok);
      toks.push(tok);
    }
    return out;
  }

  /** Signs it knows at least one follower for (a positive level-1 link). */
  knownStarts() {
    const out = [];
    for (const [k, row] of this.assoc.table) {
      if (!k.startsWith('1|')) continue;
      for (const e of row.values())
        if (this.assoc.eff(e) > 0) {
          out.push(k.slice(2));
          break;
        }
    }
    return out;
  }

  /**
   * Proximity in the dream (D70): besides "what came before" (learned above), each dreamed sign D is
   * also linked, more weakly, to its neighbours the other way round. In C A B D E S: after E comes D
   * (one after), after S E comes D (two after, read backwards) and after B E comes D (around it).
   * So A → B also teaches a little B → A. Never a sign to itself (that would teach repetition).
   */
  learnProximity(dream) {
    const w = this.p.proximityWeight;
    if (!w) return;
    dream.forEach((d, i) => {
      const [b, e, f] = [dream[i - 1], dream[i + 1], dream[i + 2]];
      if (e && e !== d) this.assoc.addAt([e], d, w);
      if (e && f && e !== d && f !== d) this.assoc.addAt([f, e], d, w);
      if (b && e && b !== d && e !== d) this.assoc.addAt([b, e], d, w);
    });
  }

  isRested(now) {
    return !!this.sleep && now >= this.sleep.restedAt;
  }

  dreamIndex(now) {
    if (!this.sleep) return -1;
    return Math.min(this.sleep.count - 1, Math.floor((now - this.sleep.start) / this.sleep.interval));
  }

  /** Current energy, including what it has recovered so far while sleeping. */
  /** Lab panel: set its energy (share 0…1) at time t. Asleep, it then recovers from there. */
  setEnergy(t, share) {
    const v = this.capacity * Math.max(0, Math.min(1, Number.isFinite(share) ? share : 1));
    if (!this.sleep) {
      this.energy = v;
      return;
    }
    const s = this.sleep;
    s.energyAtStart = v - Math.max(0, t - s.start) * s.rate; // so that energyAt(t) = v
    s.restedAt = t + (this.capacity - v) / s.rate;
  }

  energyAt(now) {
    if (!this.sleep) return this.energy;
    const s = this.sleep;
    return Math.min(this.capacity, s.energyAtStart + Math.max(0, now - s.start) * s.rate);
  }

  /** `byItself`: it woke up on its own (rested), not woken by you: it greets you with a surprise sign. */
  wakeUp(t, byItself = false) {
    this.lastActivity = t; // being left alone counts from here
    if (this.sleep) {
      // learn from the dream, as far as it got (sleep consolidates)
      const s = this.sleep;
      const n = Math.min(s.count, Math.floor((t - s.start) / s.interval) + 1);
      const list = this.seq.slice();
      s.dream.slice(0, n).forEach((tok, k) => {
        const cut = k === 0 && this.pendingCut;
        this.assoc.add(this.context(list), tok, this.p.dreamWeight, this.chainLevels(list, list.length, cut));
        list.push({ tok, cutBefore: cut });
      });
      this.learnProximity(s.dream.slice(0, n));
      if (n >= this.p.complexityDreamMin) {
        const c = measureComplexity(s.dream.slice(n - this.p.complexityDreamMin, n), this.p.complexityMinUses);
        this.complexity = { ...c, t };
        this.complexityLog.push(this.complexity);
        // it grows or shrinks towards the level its complexity calls for, but one level per sleep at most
        this.level += Math.sign(levelFor(c.value, this.p.levelAt) - this.level);
        if (this.complexityLog.length > 100) this.complexityLog.shift();
      }
      this.stats.dreamLearned = n;
      this.energy = this.energyAt(t);
      this.updateSeats(); // its look changes (if at all) while it sleeps
    }
    this.sleep = null;
    this.awake = true;
    this.pose = DEFAULT_POSE.slice();
    // woken by you: it waits for your sign; woke up by itself: it says a surprise sign first
    this.turn = byItself ? 'C' : 'P';
    this.greeting = byItself;
    this.sessionInputs = 0;
  }

  // ───────────────────────── top signs → seats ─────────────────────────

  /** Its signs ranked by use in its last outputWindow outputs (ties: the more recently used). */
  topSigns() {
    const recent = this.outputs.slice(-this.p.outputWindow);
    const c = new Map();
    recent.forEach((o, i) => c.set(o.tok, { tok: o.tok, uses: (c.get(o.tok)?.uses || 0) + 1, last: i }));
    return [...c.values()].sort((a, b) => b.uses - a.uses || b.last - a.last);
  }

  /**
   * The top signs drive the parts by rank (D77): the most used sign the eyes, the 2nd the hat, … the
   * 7th the object. Updated at birth and after each sleep. With fewer than 7 top signs, its seed signs
   * (and then fixed fillers) fill up.
   */
  updateSeats() {
    const ranked = this.topSigns();
    const uses = new Map(ranked.map((r) => [r.tok, r.uses]));
    const toks = ranked.slice(0, PARTS.length).map((r) => r.tok);
    for (const c of this.character) if (toks.length < PARTS.length && !toks.includes(c)) toks.push(c);
    for (let k = 0; toks.length < PARTS.length; k++) {
      const c = ALL[hashString(`filler:${k}`, this.seed) % ALL.length];
      if (!toks.includes(c)) toks.push(c);
    }
    this.seats = toks.map((tok, i) => ({ seat: PARTS[i], tok, uses: uses.get(tok) || 0 }));
  }

  /** The level shown: set by the lab panel (levelOverride 1–5) or from complexity. */
  shownLevel() {
    return Math.min(MAX_LEVEL, this.p.levelOverride || this.level);
  }
}
