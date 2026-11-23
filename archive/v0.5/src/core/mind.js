// The creature's mind. Everything here is rebuilt from the history: mind = replay(history).
// observe(entry) is the only way state changes, both live and during replay.
// decide() picks the creature's next move; the app writes it into the history and observes it.
// See docs/05-system-design.md (elemental signs: §17).

import { STAGES } from './params.js';
import { YES, NO, LOVE, ASK, TIME, SLEEP, WAKE, BIRTH, LEGACY, SEP, isContent, isElemental } from './tokens.js';
import { rngFor, sample, clamp, pick } from './rng.js';
import { ALL, pickNew, makeCharacter } from './emojiIndex.js';
import { EMO, PROFILE_DIMS, newEmotions, strength, updateProfile } from './emotions.js';
import { Phrasebook, MAX_CONTEXT } from './voices/phrasebook.js';
import { Echo, MAX_K } from './voices/echo.js';
import { DejaVu } from './voices/dejavu.js';
import { Gut } from './voices/gut.js';

const VOICES = ['phrasebook', 'echo', 'dejavu', 'gut'];
const EMPTY = { dist: new Map(), conf: 0 };
const HOUR = 3600000;

export class Mind {
  constructor(params, seed) {
    this.p = params;
    this.seed = seed;

    // memory
    this.seq = []; // content tokens (ordinary emojis) in order, both speakers
    this.seqWho = []; // 'P' | 'C' per content token
    this.vocab = new Map(); // emoji -> { count, playerCount, firstIdx, firstWho }
    this.pb = new Phrasebook(params);
    this.echo = new Echo();
    this.dv = new DejaVu();
    this.gut = new Gut(params, seed);
    this.trust = { phrasebook: 0.5, echo: 0.3, dejavu: 0.3, gut: 0.3 };
    this.character = []; // its current character: the strongest emojis in charWeights
    this.charWeights = new Map(); // living character: emoji -> weight (inborn ones start at 1, docs/06 #7)

    // emotions
    this.emo = newEmotions();
    this.uneaseCause = 'bored';
    this.profiles = new Map(); // emoji or "a b" / "a b c" pattern -> emotion profile
    this.surpriseAvg = 0.5;
    this.emoBase = new Array(PROFILE_DIMS.length).fill(0.1); // its usual mood (slow average)
    this.praiseRecent = 0; // praise wears off when repeated
    this.newRecent = 0; // so does novelty
    this.noStreak = 0; // ❌ in a row

    // structure
    this.stage = 0;
    this.complexity = 0;
    this.rules = [];
    this.narratives = [];
    this.variants = 0;
    this.habits = new Map(); // ruleKey -> { ctx, next, sleeps, lastSleep, strength }
    this.activeHabits = new Map(); // ctx key -> habit (sleeps >= habitAfterSleeps)

    // growth by experience (docs/06 #1)
    this.maturity = 0;
    this.lastGain = 0;
    this.prevRuleKeys = new Set();
    this.fatigue = new Map(); // "prev→next" -> uses this session (habit fatigue, docs/06 #3)
    this.sess = this.newSessionStats();

    // body & time
    this.capacity = params.capacity * STAGES[0].capacity;
    this.energy = this.capacity;
    this.awake = false;
    this.sleep = null; // { start, count, interval, dream, rate, restedAt, energyAtStart }
    this.sleepCount = 0;
    this.turn = null; // 'C' | 'P' | null (asleep)
    this.birthT = 0;
    this.lastEntryT = 0;
    this.lastActivity = 0;
    this.lastSessionEnd = 0;
    this.sessionStartPending = false;
    this.sessionSeqStart = 0;
    this.sessionInputs = 0;
    this.totalInputs = 0;

    // conversation state
    this.tries = []; // its new signs / games, waiting to see if the player picks them up
    this.question = false; // it asked ❓ and waits for your answer
    this.chain = []; // its content moves since your last emoji: [{ ctx, tok }] (what ✅ ❌ ❤️ refer to)
    this.rejected = null; // after ❌: tokens to avoid in its retry
    this.elab = null; // after your ❓: { step, max } while it elaborates
    this.lastPlayerTok = null;
    this.lastEval = null; // how your last input compared to its expectation
    this.lastCreatureWait = false;
  }

  newSessionStats() {
    return { adopted: [], answered: 0, warm: new Map(), playerUse: new Map() };
  }

  static replay(save, params) {
    const m = new Mind(params, save.seed);
    for (const e of save.history) m.observe(e);
    return m;
  }

  get stageInfo() {
    return STAGES[this.stage];
  }

  get tiredness() {
    return clamp(1 - this.energy / this.capacity);
  }

  voiceAvailable(name) {
    const st = this.stageInfo;
    if (name === 'gut') return st.gut && this.gut.trained;
    if (name === 'dejavu') return st.dejavu;
    return true;
  }

  // ───────────────────────── observing the history ─────────────────────────

  observe(e) {
    this.lastEntryT = e.t;
    const tok = LEGACY[e.tok] || e.tok;
    if (tok === BIRTH) return this.born(e);
    if (tok === SLEEP) return this.awake && this.fallAsleep(e.t);
    if (tok === WAKE) return !this.awake && this.wakeUp(e.t);
    if (e.who === 'P') {
      if (tok === TIME) this.playerPass(e.t);
      else if (isElemental(tok)) this.playerSignal(tok, e.t);
      else this.playerTurn(tok, e.t);
    } else {
      if (isElemental(tok)) this.creatureSignal(tok, e.m);
      else this.creatureMove(tok, e.m);
    }
  }

  born(e) {
    this.birthT = e.t;
    // inborn character: stored in the birth entry; older saves derive it from the seed
    this.character = e.m ? e.m.split(' ') : makeCharacter(rngFor(this.seed, 'character'), this.p.characterSize);
    for (const tok of this.character) {
      this.charWeights.set(tok, this.p.characterBirth);
      if (this.vocab.has(tok)) continue;
      this.vocab.set(tok, { count: 0, playerCount: 0, firstIdx: -1, firstWho: 'N' });
      this.gut.ensure(tok);
    }
    this.awake = true;
    this.turn = 'C';
    this.lastActivity = e.t;
    this.sessionSeqStart = 0;
  }

  append(tok, who) {
    this.seq.push(tok);
    this.seqWho.push(who);
    let v = this.vocab.get(tok);
    if (!v) {
      v = { count: 0, playerCount: 0, firstIdx: this.seq.length - 1, firstWho: who };
      this.vocab.set(tok, v);
      this.gut.ensure(tok);
    }
    v.count++;
    if (who === 'P') v.playerCount++;
  }

  /** Shared bookkeeping for every player input. */
  beginInput(t) {
    for (const k of EMO) this.emo[k] *= this.p.emotionFade;
    this.praiseRecent *= 0.7;
    this.newRecent *= 0.8;
    if (this.sessionStartPending) {
      // start of a session: affection if you come back soon, sadness after a long absence
      const gap = t - this.lastSessionEnd;
      if (gap > 48 * HOUR) this.emo.sadness += 0.4;
      else if (gap < 12 * HOUR) this.emo.joy += 0.15;
      this.sessionStartPending = false;
    }
    this.elab = null;
    this.sessionInputs++;
    this.totalInputs++;
    this.lastActivity = t;
    this.turn = 'C';
  }

  endInput(tok) {
    for (const k of EMO) this.emo[k] = clamp(this.emo[k]);
    this.lastPlayerTok = tok;
    // its usual mood: associations are measured relative to this (docs/06 #8)
    const vec = this.emotionVector();
    for (let i = 0; i < vec.length; i++) this.emoBase[i] += 0.03 * (vec[i] - this.emoBase[i]);
  }

  /** Emotional state relative to its usual mood: what makes this moment special. */
  emotionDelta() {
    return this.emotionVector().map((v, i) => v - this.emoBase[i]);
  }

  /** Self-boredom (docs/06 #2): it notices when the conversation loops. */
  loopCheck() {
    const w = this.seq.slice(-20);
    if (w.length < 12) return;
    const seen = new Set();
    let rep = 0;
    for (let i = 2; i < w.length; i++) {
      const key = w[i - 2] + SEP + w[i - 1] + SEP + w[i];
      if (seen.has(key)) rep++;
      seen.add(key);
    }
    const share = rep / (w.length - 2);
    if (share > this.p.loopBoredAt) {
      this.emo.unease = clamp(this.emo.unease + 0.1 * (share / this.p.loopBoredAt));
      this.uneaseCause = 'bored';
    }
  }

  /** You sent an ordinary emoji. */
  playerTurn(tok, t) {
    const pred = this.predict();
    const p = this.probOf(pred, tok);
    const s = clamp(-Math.log(p) / Math.log(400)); // surprise 0..1
    const isNew = !this.vocab.has(tok);

    // which voices saw it coming? → trust
    for (const name of VOICES) {
      const v = pred.voices[name];
      if (!this.voiceAvailable(name) || v.conf <= 0) continue;
      this.trust[name] = clamp(this.trust[name] * 0.92 + 0.08 * (v.dist.get(tok) || 0), 0.05, 1);
    }

    this.beginInput(t);
    const E = this.emo;
    const faded = { ...E };
    const topP = pred.top ? pred.dist.get(pred.top) : 0;
    const sure = pred.conf * topP;
    const matched = tok === pred.top;

    // joy: things play out smoothly, a surprise that makes sense (laughter), tries picked up
    if (matched && sure > 0.4) E.joy += pred.habit && pred.habit.next === tok ? 0.2 : 0.12;
    const pbP = pred.voices.phrasebook.dist.get(tok) || 0;
    let otherP = 0;
    for (const name of ['echo', 'dejavu', 'gut']) {
      const v = pred.voices[name];
      if (v.conf > 0) otherP = Math.max(otherP, (v.dist.get(tok) || 0) * v.conf);
    }
    if (!isNew && !matched && s > 0.3 && pbP < 0.15 && otherP >= 0.3) E.joy += 0.3;
    const { adopted, ignored } = this.checkTries(tok);
    E.joy += 0.35 * adopted.length;
    E.sadness += 0.1 * ignored;
    this.sess.adopted.push(...adopted);

    // curiosity: new things, unexpected moves. Wears off when many new things come at once → confusion
    if (isNew) {
      E.curiosity += 0.3 / (1 + this.newRecent);
      this.newRecent += 1;
      if (this.newRecent > 2.5 && this.vocab.size >= 12) {
        E.unease += 0.12;
        this.uneaseCause = 'confused';
      }
    } else E.curiosity += 0.12 * s;

    // unease: too predictable (bored) or too chaotic (confused)
    this.surpriseAvg = this.surpriseAvg * 0.85 + s * 0.15;
    const recent = this.seq.slice(-12).concat(tok);
    const variety = new Set(recent).size / recent.length;
    if (this.seq.length >= 8 && this.surpriseAvg < 0.2 && variety < 0.45) {
      E.unease += 0.2;
      this.uneaseCause = 'bored';
    } else if (this.vocab.size >= 12 && this.surpriseAvg > 0.75) {
      E.unease += 0.2;
      this.uneaseCause = 'confused';
    }

    // anger: a confident expectation broken
    const brokeHabit = !matched && sure > 0.55;
    if (brokeHabit) E.anger += 0.3 * sure;

    // unlearning (docs/06 #6): a habit you contradict loses strength, one you confirm gains
    if (pred.habit) {
      const h = pred.habit;
      if (tok === h.next) h.strength = Math.min(1, h.strength + 0.15);
      else {
        h.strength = Math.max(0, h.strength - this.p.habitChallenge);
        E.anger += 0.15;
      }
    }
    if (this.question) this.sess.answered++;
    this.sess.playerUse.set(tok, (this.sess.playerUse.get(tok) || 0) + 1);
    this.noStreak = 0;

    // emotions from learned associations (contagion)
    this.contagion(tok);
    for (const k of EMO) E[k] = clamp(E[k]);

    // implicit reinforcement: joy after its move makes it stick a little, sadness/anger weaken it
    const warm = E.joy - faded.joy;
    const cold = E.sadness - faded.sadness + (E.anger - faded.anger);
    for (const c of this.chain) {
      if (warm > 0.15) this.pb.learn(c.ctx, c.tok, this.p.selfLearnWeight);
      else if (cold > 0.15) this.pb.learn(c.ctx, c.tok, -0.5);
    }

    // learning (from you); an answer to its ❓ counts triple
    const weight = this.question ? this.p.questionBoost : 1;
    this.pb.learn(this.seq.slice(-MAX_CONTEXT), tok, weight);
    this.echo.update(this.seq, tok);
    this.dv.update(this.seq, this.seq.length);
    this.append(tok, 'P');
    this.learnAssociations();
    this.loopCheck();

    const prof = this.profiles.get(tok);
    const disliked = !!prof && strength(prof, this.p.repsToLearn) * (prof.v[3] + prof.v[4]) > 0.15;
    this.lastEval = { tok, p, surprise: s, expected: pred.top, sure, matched, asked: this.question, brokeHabit, disliked };
    this.energy -= 1 + 0.5 * s;
    this.question = false;
    this.chain = [];
    this.rejected = null;
    this.endInput(tok);
  }

  /** You sent ✅ ❌ ❤️ or ❓: teaching by reinforcement, or asking it to elaborate. */
  playerSignal(tok, t) {
    this.beginInput(t);
    const E = this.emo;
    const p = this.p;
    const chain = this.chain;
    if (this.question) E.sadness += 0.15; // its question went unanswered
    const praise = 1 / (1 + this.praiseRecent); // praise wears off when repeated
    if (tok === YES) {
      // "that was right": everything it just said sticks
      for (const c of chain) this.pb.learn(c.ctx, c.tok, p.yesWeight);
      E.joy += 0.15 * praise;
      this.praiseRecent += 1;
      this.noStreak = 0;
    } else if (tok === LOVE) {
      // affection: warmth first, a softer "yes" second
      for (const c of chain) this.pb.learn(c.ctx, c.tok, p.loveWeight);
      E.joy += 0.4 * praise;
      E.sadness *= 0.5;
      E.anger *= 0.5;
      E.unease *= 0.5;
      this.praiseRecent += 1;
      this.noStreak = 0;
    } else if (tok === NO) {
      // "not that": weaken it (and the habit behind it) and try again with something else
      for (const c of chain) {
        this.pb.learn(c.ctx, c.tok, -p.noWeight);
        for (let L = Math.min(c.ctx.length, MAX_CONTEXT); L >= 1; L--) {
          const h = this.activeHabits.get(c.ctx.slice(c.ctx.length - L).join(SEP));
          if (h && h.next === c.tok) h.strength = Math.max(0, h.strength - 0.5);
        }
      }
      this.noStreak++;
      E.sadness += 0.2 + (this.noStreak >= 2 ? 0.1 : 0);
      if (this.noStreak >= 2) E.anger += 0.15; // "not that, not that…" is frustrating
      this.rejected = chain.length ? new Set(chain.map((c) => c.tok)) : null;
    } else if (tok === ASK) {
      // "elaborate": it continues with its best guesses, as deep as it's confident
      E.curiosity += 0.1;
    }
    for (const k of EMO) E[k] = clamp(E[k]);

    // what it just did gets associated with how this made it feel (✅ ❤️ → joy, ❌ → sadness)
    if (tok === YES || tok === LOVE) for (const c of chain) this.sess.warm.set(c.tok, (this.sess.warm.get(c.tok) || 0) + 1);
    if (tok !== ASK) {
      const vec = this.emotionDelta();
      for (const c of chain) {
        updateProfile(this.profiles, c.tok, vec, 1);
        const pat = c.ctx.slice(-1).concat(c.tok);
        if (pat.length === 2) updateProfile(this.profiles, pat.join(' '), vec, 1);
      }
      this.chain = [];
    }
    if (tok === ASK) this.elab = { step: 0, max: p.elabDepth + this.stage };
    this.question = false;
    this.lastEval = { tok, signal: true, about: chain.map((c) => c.tok) };
    this.energy -= 0.5;
    this.endInput(tok);
  }

  /** You sent 💬: you pass; it carries on by itself (narrating). */
  playerPass(t) {
    const twice = this.lastPlayerTok === TIME;
    this.beginInput(t);
    if (twice) this.emo.sadness += 0.08; // being left alone a lot
    if (this.question) this.emo.sadness += 0.15; // its question went unanswered
    const { ignored } = this.checkTries(null);
    this.emo.sadness += 0.1 * ignored;
    this.question = false;
    this.energy -= 0.5;
    this.lastEval = { tok: TIME, signal: true };
    this.endInput(TIME);
  }

  /** Its ordinary emoji. */
  creatureMove(tok, m) {
    if (!this.vocab.has(tok)) this.tries.push({ kind: 'new', tok, left: 4 });
    if (m && m.startsWith('game')) this.tries.push({ kind: 'game', k: Number(m.split(':')[1]), left: 2 });
    this.chain.push({ ctx: this.seq.slice(-MAX_CONTEXT), tok });
    const fk = (this.seq[this.seq.length - 1] || '') + SEP + tok;
    this.fatigue.set(fk, (this.fatigue.get(fk) || 0) + 1);
    this.append(tok, 'C');
    updateProfile(this.profiles, tok, this.emotionDelta(), 0.3);
    this.loopCheck();
    this.lastCreatureWait = false;
    this.question = false;
    this.rejected = null;
    if (m === 'elab' && this.elab) {
      this.elab.step++;
      this.turn = 'C'; // keeps elaborating
    } else {
      this.elab = null;
      this.turn = 'P';
    }
  }

  /** Its elemental sign: 💬 waits, ❓ asks, ✅ ❌ ❤️ react. */
  creatureSignal(tok) {
    this.question = tok === ASK;
    this.lastCreatureWait = tok === TIME;
    this.elab = null;
    this.rejected = null;
    this.turn = 'P';
  }

  /** Did the player pick up its new signs or games? */
  checkTries(tok) {
    const adopted = [];
    let ignored = 0;
    const keep = [];
    for (const tr of this.tries) {
      const hit =
        tok !== null &&
        ((tr.kind === 'new' && tok === tr.tok) ||
          (tr.kind === 'game' && this.seq.length >= tr.k && tok === this.seq[this.seq.length - tr.k]));
      if (hit) adopted.push(tr.kind === 'new' ? tr.tok : this.seq[this.seq.length - tr.k]);
      else if (--tr.left <= 0) ignored++;
      else keep.push(tr);
    }
    this.tries = keep;
    return { adopted, ignored };
  }

  emotionVector() {
    return [...EMO.map((k) => this.emo[k]), this.tiredness];
  }

  /** Your emoji and the patterns it completes take on the current emotions (slowly). */
  learnAssociations() {
    const vec = this.emotionDelta();
    const n = this.seq.length;
    updateProfile(this.profiles, this.seq[n - 1], vec, 1);
    if (n >= 2) updateProfile(this.profiles, this.seq.slice(n - 2).join(' '), vec, 1);
    if (n >= 3) updateProfile(this.profiles, this.seq.slice(n - 3).join(' '), vec, 1);
  }

  /** Receiving an emoji/pattern nudges emotions toward what it's associated with. */
  contagion(tok) {
    const keys = [tok];
    if (this.seq.length >= 1) keys.push(this.seq.slice(-1).concat(tok).join(' '));
    if (this.seq.length >= 2) keys.push(this.seq.slice(-2).concat(tok).join(' '));
    for (const key of keys) {
      const pr = this.profiles.get(key);
      if (!pr) continue;
      const a = this.p.contagion * this.stageInfo.contagion * strength(pr, this.p.repsToLearn);
      EMO.forEach((k, i) => (this.emo[k] += a * pr.v[i])); // profiles hold deviations from its usual mood
    }
  }

  // ───────────────────────── predicting ─────────────────────────

  /** The council of voices votes on what comes next. */
  predict() {
    const st = this.stageInfo;
    const voices = {
      phrasebook: this.pb.predict(this.seq.slice(-MAX_CONTEXT), st.context),
      echo: this.echo.predict(this.seq, st.echoK),
      dejavu: this.voiceAvailable('dejavu') ? this.dv.predict(this.seq) : EMPTY,
      gut: this.voiceAvailable('gut') ? this.gut.predict(this.seq) : EMPTY,
    };
    const dist = new Map();
    let W = 0;
    for (const name of VOICES) {
      const v = voices[name];
      v.weight = this.trust[name] * v.conf;
      if (v.weight <= 0) continue;
      W += v.weight;
      for (const [t, p] of v.dist) dist.set(t, (dist.get(t) || 0) + v.weight * p);
    }
    if (W > 0) for (const [t, p] of dist) dist.set(t, p / W);
    let conf = W > 0 ? W / (W + 0.15) : 0;

    const habit = this.matchHabit(st.context);
    if (habit) {
      const boost = this.p.habitBoost * habit.strength;
      for (const [t, p] of dist) dist.set(t, p * (1 - boost));
      dist.set(habit.next, (dist.get(habit.next) || 0) + boost);
      conf = Math.max(conf, 0.5 + 0.2 * habit.strength);
    }

    let top = null;
    for (const [t, p] of dist) if (!top || p > dist.get(top)) top = t;

    const bored = this.uneaseCause === 'bored' ? this.emo.unease : 0;
    let pNew = this.p.noveltyBase * st.impulse + this.p.noveltyBored * bored;
    if (this.uneaseCause === 'confused') pNew *= 1 - 0.7 * this.emo.unease;
    return { dist, conf, pNew, voices, habit, top };
  }

  probOf(pred, tok) {
    const known = this.vocab.size;
    if (!this.vocab.has(tok)) return Math.max(1e-6, pred.pNew / Math.max(1, ALL.length - known));
    const pk = (pred.dist.get(tok) || 0) * pred.conf + (1 - pred.conf) / Math.max(1, known);
    return Math.max(1e-6, (1 - pred.pNew) * pk);
  }

  matchHabit(maxL) {
    for (let L = Math.min(maxL, this.seq.length); L >= 1; L--) {
      const h = this.activeHabits.get(this.seq.slice(this.seq.length - L).join(SEP));
      if (h) return h;
    }
    return null;
  }

  // ───────────────────────── deciding (creature's turn) ─────────────────────────

  dominantEmotion() {
    let best = null;
    let val = 0;
    for (const k of EMO) {
      if (this.emo[k] > val) {
        best = k;
        val = this.emo[k];
      }
    }
    if (this.tiredness >= 0.7 && this.tiredness > val) return { name: 'tiredness', value: this.tiredness };
    return best ? { name: best, value: val } : null;
  }

  label() {
    if (!this.awake) return 'sleeping';
    const d = this.dominantEmotion();
    return d && d.value >= this.p.labelAt ? d.name : '';
  }

  temperatureNow(pred) {
    let T = this.p.temperature + this.stageInfo.chaos;
    if (this.uneaseCause === 'bored') T += 0.7 * this.emo.unease;
    else T -= 0.3 * this.emo.unease;
    if (pred.habit) T *= 0.9;
    return Math.max(0.1, T);
  }

  newEmoji(rng) {
    let anchor = null;
    for (let i = this.seq.length - 1; i >= 0; i--) {
      if (this.seqWho[i] === 'P') {
        anchor = this.seq[i];
        break;
      }
    }
    // its nature pulls its experiments toward its own neighbourhoods, especially when small
    if (this.character.length && (!anchor || rng() < this.stageInfo.nature * 1.5)) anchor = pick(this.character, rng);
    return pickNew(anchor, (e) => this.vocab.has(e), rng, this.p.nearbyNovelty);
  }

  /** Sample from the council's distribution with a given chaos, leaving out some tokens. */
  sampleKnown(pred, T, rng, exclude) {
    const entries = [...pred.dist].filter(([t]) => !exclude || !exclude.has(t)).map(([t, p]) => [t, Math.pow(p, 1 / T)]);
    return entries.length ? sample(entries, rng) : null;
  }

  top3(pred, exclude) {
    return [...pred.dist]
      .filter(([t]) => !exclude || !exclude.has(t))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, p]) => [t, p * pred.conf]);
  }

  /**
   * The creature's move. Returns { tok, m, why }. Not deterministic (uses rng), but the result
   * is written into the history, so replay never needs to repeat it.
   */
  decide(rng = Math.random) {
    const st = this.stageInfo;
    const E = this.emo;
    const p = this.p;
    const pred = this.predict();
    const base = { pred, emotion: this.dominantEmotion() };
    const sureOf = (pr) => (pr.top ? pr.conf * pr.dist.get(pr.top) : 0);

    // 1. you asked ❓: elaborate, as deep as it's confident
    if (this.elab) {
      const { step, max } = this.elab;
      if (sureOf(pred) < p.elabMinSure) {
        return step === 0
          ? { tok: ASK, why: { ...base, mode: "doesn't know: asks you back", top3: this.top3(pred) } }
          : { tok: TIME, why: { ...base, mode: `elaboration ends (${step} deep)` } };
      }
      const tok = this.sampleKnown(pred, 0.3, rng);
      const last = step + 1 >= max;
      return { tok, m: last ? 'elab-end' : 'elab', why: { ...base, mode: `elaborating ${step + 1}/${max}`, top3: this.top3(pred) } };
    }

    // 2. sleepy?
    const e = this.energy / this.capacity;
    if (this.energy <= 0) return { tok: SLEEP, why: { mode: 'falls asleep (no energy left)' } };
    if (e < p.sleepyBelow && rng() < ((p.sleepyBelow - e) / p.sleepyBelow) * 0.35) {
      return { tok: SLEEP, why: { mode: 'nods off (sleepy)' } };
    }

    // 3. you said ❌: try again with something else
    if (this.rejected) {
      const tok = this.sampleKnown(pred, this.temperatureNow(pred), rng, this.rejected);
      if (tok && (pred.dist.get(tok) || 0) > 0.02) {
        return { tok, m: 'retry', why: { ...base, mode: 'retry after ❌', top3: this.top3(pred, this.rejected) } };
      }
      return { tok: this.newEmoji(rng), m: 'retry', why: { ...base, mode: 'retry after ❌: tries something new' } };
    }

    // 4. reactions with elemental signs
    const ev = this.lastEval;
    if (ev && !ev.signal) {
      if (ev.matched && ev.sure > 0.5 && rng() < p.reactYes) return { tok: YES, why: { ...base, mode: 'confirms ✅: you did what it expected' } };
      if ((ev.brokeHabit || ev.disliked) && rng() < p.reactNo) {
        return { tok: NO, why: { ...base, mode: ev.disliked ? 'rejects ❌: it dislikes that emoji' : 'rejects ❌: you broke its expectation' } };
      }
    }
    if (E.joy >= 0.6 && rng() < p.reactLove) return { tok: LOVE, why: { ...base, mode: 'affection ❤️' } };

    // 5. it asks ❓ "what comes after that?" when curious and unsure
    if (st.questions && this.seq.length && pred.conf < 0.5 && rng() < E.curiosity * 0.4) {
      return { tok: ASK, why: { ...base, mode: 'asks ❓: what comes after that?' } };
    }

    // 6. invented game (bored or joyful)
    if (st.games && this.seq.length >= 2) {
      const bored = this.uneaseCause === 'bored' ? E.unease : 0;
      if (rng() < bored * 0.35 + E.joy * 0.12) {
        const k = rng() < 0.6 ? 1 : 2;
        return {
          tok: this.seq[this.seq.length - k],
          m: 'game:' + k,
          why: { ...base, mode: k === 1 ? 'invented game: mirror' : 'invented game: alternate' },
        };
      }
    }

    // 7. candidates: known patterns, clueless behaviour, something new, its nature
    const T = this.temperatureNow(pred);
    const cands = new Map(); // key -> { p, mode, tok }
    const add = (key, prob, mode, tok) => {
      if (prob <= 0) return;
      const c = cands.get(key);
      if (c) c.p += prob;
      else cands.set(key, { p: prob, mode, tok });
    };
    let sumT = 0;
    for (const [, q] of pred.dist) sumT += Math.pow(q, 1 / T);
    const lastTok = this.seq[this.seq.length - 1] || '';
    // habit fatigue: what it already did often this session pulls less (recovers in sleep).
    // Strong when it continues its own chains (loops), mild when it answers your emoji (consistency).
    const replying = this.seqWho[this.seqWho.length - 1] === 'P';
    const fatigueBase = replying ? 1 - (1 - p.habitFatigue) / 3 : p.habitFatigue;
    let tiredLoss = 0;
    for (const [t, q] of pred.dist) {
      const mode = pred.habit && pred.habit.next === t ? 'habit' : t === pred.top ? 'pattern' : 'variation';
      const tired = Math.pow(fatigueBase, this.fatigue.get(lastTok + SEP + t) || 0);
      const prob = ((1 - pred.pNew) * pred.conf * Math.pow(q, 1 / T)) / sumT;
      add(t, prob * tired, mode, t);
      tiredLoss += prob * (1 - tired);
    }
    // what fatigue takes away goes to surprises (twists from the sleep brain, or something new)
    const gutAlt = [...(pred.voices.gut.dist || new Map())].filter(([t]) => (this.fatigue.get(lastTok + SEP + t) || 0) === 0).slice(0, 3);
    const surprise = (mass) => {
      // mostly twists (similar emojis from the sleep brain), sometimes something new or remembered
      if (gutAlt.length) for (const [t] of gutAlt) add(t, (mass * 0.6) / gutAlt.length, 'twist', t);
      add('⟨new⟩', gutAlt.length ? mass * 0.4 : mass, 'break', null);
    };
    surprise(tiredLoss);
    const clueless = (1 - pred.pNew) * (1 - pred.conf);
    const confused = this.uneaseCause === 'confused' ? E.unease : 0;
    const babble = st.babble * (1 - confused);
    let lastPlayer = null;
    for (let i = this.seq.length - 1; i >= 0; i--) {
      if (this.seqWho[i] === 'P') {
        lastPlayer = this.seq[i];
        break;
      }
    }
    const improvise = clueless * st.improvise * (1 - confused);
    add(TIME, clueless * Math.max(0.05, 1 - babble - 0.3 - st.improvise * (1 - confused)) * (1 + confused) * (this.lastCreatureWait ? 0.4 : 1), 'wait', TIME);
    if (improvise > 0) surprise(improvise);
    if (lastPlayer) add(lastPlayer, clueless * 0.3, 'echo', lastPlayer);
    if (this.vocab.size) add('⟨babble⟩', clueless * babble, 'babble', null);
    add('⟨new⟩', pred.pNew, 'new', null);

    // its inborn character: a share of every choice goes to its own emojis (strongest when small)
    if (this.character.length && st.nature > 0) {
      let sum = 0;
      for (const c of cands.values()) {
        c.p *= 1 - st.nature;
        sum += c.p;
      }
      const share = (st.nature * Math.max(sum, 1e-9)) / (1 - st.nature);
      const wsum = this.character.reduce((a, t) => a + (this.charWeights.get(t) || 0.1), 0);
      for (const t of this.character) add(t, (share * (this.charWeights.get(t) || 0.1)) / wsum, 'nature', t);
    }

    // expression: prefer emojis associated with its current strongest emotion
    const dom = base.emotion;
    if (dom && dom.value >= 0.3) {
      const i = PROFILE_DIMS.indexOf(dom.name);
      for (const c of cands.values()) {
        if (!c.tok || !isContent(c.tok)) continue;
        const pr = this.profiles.get(c.tok);
        if (pr) c.p *= 1 + p.expressiveness * 4 * strength(pr, p.repsToLearn) * pr.v[i];
      }
    }

    // never fully predictable: cap the top choice, give the rest to twists and breaks
    let total = 0;
    for (const c of cands.values()) total += c.p;
    let topKey = null;
    for (const [k, c] of cands) if (!topKey || c.p > cands.get(topKey).p) topKey = k;
    if (topKey && cands.get(topKey).p / total > p.maxCertainty) {
      const topC = cands.get(topKey);
      const excess = topC.p - p.maxCertainty * total;
      topC.p -= excess;
      const twists = [...(pred.voices.gut.dist || new Map())].filter(([t]) => t !== topKey).slice(0, 3);
      if (twists.length) for (const [t] of twists) add(t, excess / 2 / twists.length, 'twist', t);
      else add('⟨new⟩', excess / 2, 'break', null);
      add('⟨new⟩', excess / 2, 'break', null);
    }

    const key = sample([...cands].map(([k, c]) => [k, c.p]), rng);
    const c = cands.get(key);
    let tok = c.tok;
    let mode = c.mode;
    if (key === '⟨new⟩') {
      // some impulses bring back an old emoji instead of a new one: it remembers (stage 2+)
      const mem = this.stage >= 2 && rng() < p.memoryShare ? this.memory(rng) : null;
      if (mem) {
        tok = mem;
        mode = 'memory';
      } else tok = this.newEmoji(rng);
    }
    else if (key === '⟨babble⟩') tok = this.character.length && rng() < 0.5 ? pick(this.character, rng) : pick([...this.vocab.keys()], rng);
    const top3 = [...cands.values()]
      .sort((a, b) => b.p - a.p)
      .slice(0, 3)
      .map((x) => [x.tok || (x.mode === 'new' || x.mode === 'break' ? 'new emoji' : x.mode), x.p / total]);
    return { tok, m: tok === TIME ? undefined : mode, why: { ...base, mode, top3 } };
  }

  /** An emoji from long ago that hasn't come up for a while. */
  memory(rng) {
    const recent = new Set(this.seq.slice(-60));
    const cands = [];
    for (const [e, v] of this.vocab) if (v.playerCount >= 2 && !recent.has(e)) cands.push([e, v.playerCount]);
    return cands.length ? sample(cands, rng) : null;
  }

  // ───────────────────────── sleep ─────────────────────────

  fallAsleep(t) {
    // energy recovers steadily: empty → full in fullRecoveryMin, whatever its size
    const energyAtStart = Math.max(0, this.energy);
    const missing = Math.max(this.capacity * 0.05, this.capacity - energyAtStart);
    const rate = this.capacity / (this.p.fullRecoveryMin * 60000); // energy per ms
    const duration = missing / rate;
    // dreaming is fast and independent of recovery: one emoji every few seconds
    const interval = this.p.dreamIntervalSec * 1000;
    const count = Math.max(3, Math.ceil(duration / interval));
    this.consolidate();
    const dream = this.dream(count);
    this.sleep = { start: t, count, interval, dream, rate, restedAt: t + duration, energyAtStart };
    this.awake = false;
    this.turn = null;
    this.question = false;
    this.elab = null;
    this.rejected = null;
    this.tries = [];
    this.chain = [];
    this.lastEval = null;
    this.lastSessionEnd = this.lastActivity || t;
    this.sleepCount++;
  }

  /** Train the sleep brain, find rules/habits/narratives, compute complexity, fade short-term memory. */
  consolidate() {
    const p = this.p;
    const rng = rngFor(this.seed, 'sleep', this.sleepCount);

    // 1. the sleep brain learns from this session + a sample of older memories
    const recent = [];
    const older = [];
    for (let i = 1; i < this.seq.length; i++) {
      if (this.seqWho[i] !== 'P') continue;
      (i >= this.sessionSeqStart ? recent : older).push(i);
    }
    for (let i = older.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [older[i], older[j]] = [older[j], older[i]];
    }
    const idx = recent.concat(older.slice(0, p.netOldSamples));
    const examples = idx.map((i) => [this.seq.slice(Math.max(0, i - p.netContext), i), this.seq[i]]);
    if (examples.length) this.gut.train(examples, p.netEpochs, p.netLr, rng);

    // 2. rules: confident, repeated patterns (exact and structural)
    const { rules, variants } = this.findRules();

    // 3. habits: rules that survive consecutive sleeps. Contradicted ones start over or disappear.
    const wasActive = new Set(this.activeHabits.values());
    for (const r of rules) {
      if (r.structural) continue;
      const key = r.ctx.join(SEP) + '→' + r.next;
      const h = this.habits.get(key);
      if (!h) this.habits.set(key, { ctx: r.ctx, next: r.next, sleeps: 1, lastSleep: this.sleepCount, strength: 1 });
      else {
        h.sleeps = h.lastSleep === this.sleepCount - 1 && h.strength >= 0.6 ? h.sleeps + 1 : 1;
        h.lastSleep = this.sleepCount;
        h.strength = Math.min(1, h.strength + 0.2);
      }
    }
    this.activeHabits = new Map();
    for (const [key, h] of this.habits) {
      if (h.lastSleep < this.sleepCount - 2 || h.strength < 0.3) this.habits.delete(key);
      else if (h.sleeps >= p.habitAfterSleeps) this.activeHabits.set(h.ctx.join(SEP), h);
    }
    const newHabits = [...this.activeHabits.values()].filter((h) => !wasActive.has(h)).length;

    // 4. narratives: chains of single-step rules, at least 3 long
    const step = new Map();
    for (const r of rules) if (!r.structural && r.ctx.length === 1 && !step.has(r.ctx[0])) step.set(r.ctx[0], r.next);
    const chains = [];
    for (const start of step.keys()) {
      const chain = [start];
      let cur = start;
      while (step.has(cur) && chain.length < 8) {
        const nxt = step.get(cur);
        chain.push(nxt);
        if (chain.indexOf(nxt) < chain.length - 1) break;
        cur = nxt;
      }
      if (chain.length >= 3) chains.push(chain);
    }
    chains.sort((a, b) => b.length - a.length);
    const narratives = [];
    for (const ch of chains) {
      const s = ch.join(' ');
      if (!narratives.some((n) => n.join(' ').includes(s))) narratives.push(ch);
    }

    // 5. complexity: longer and more varied patterns count more
    this.rules = rules.sort((a, b) => b.w - a.w);
    this.narratives = narratives;
    this.variants = variants;
    this.complexity =
      rules.reduce((s, r) => s + r.len, 0) + narratives.reduce((s, n) => s + n.length, 0) + 2 * variants + 2 * this.activeHabits.size;

    // 6. growth by experience (docs/06 #1): engagement + a bonus for what it learned this session
    const ruleKeys = new Set(rules.filter((r) => !r.structural).map((r) => r.ctx.join(SEP) + '→' + r.next));
    let newRules = 0;
    for (const key of ruleKeys) if (!this.prevRuleKeys.has(key)) newRules++;
    this.prevRuleKeys = ruleKeys;
    const engagement = Math.min(1, this.sessionInputs / p.maturityFullAt);
    const bonus = Math.min(p.maturityBonusMax, 0.03 * newRules + 0.08 * newHabits + 0.08 * this.sess.adopted.length + 0.04 * this.sess.answered);
    this.lastGain = this.sessionInputs >= 3 ? engagement + bonus : 0;
    this.maturity = Math.min(p.stageThresholds[p.stageThresholds.length - 1] + 3, this.maturity + this.lastGain);

    // 7. living character (docs/06 #7)
    this.updateCharacter();

    // 8. hand-over: short-term memory fades; a new session starts fresh
    this.pb.jump(p.fastHalfLife * Math.log2(1 / p.shortTermFade));
    this.fatigue = new Map();
    this.sess = this.newSessionStats();
  }

  /**
   * Confident, repeated patterns in short-term memory. Used during sleep (rules, habits, complexity)
   * and live by the test panel.
   * - rules: without redundant longer ones (🐶🌞→🌻 is redundant when 🌞→🌻 exists), plus structural ones
   * - sequences: all confident patterns with 2+ emojis of context, including redundant ones
   */
  findRules() {
    const p = this.p;
    const found = this.pb.rules(0.6, p.repsToLearn * 0.75);
    const nextOf = new Map(found.rules.map((r) => [r.ctx.join(SEP), r.next]));
    const rules = found.rules.filter((r) => {
      for (let L = 1; L < r.ctx.length; L++) if (nextOf.get(r.ctx.slice(r.ctx.length - L).join(SEP)) === r.next) return false;
      return true;
    });
    for (const r of rules) r.len = r.ctx.length + 1;
    for (let k = 1; k <= MAX_K; k++) {
      if (this.echo.n[k] >= p.repsToLearn * 2 && this.echo.rate[k] >= 0.5) {
        rules.push({ ctx: ['…' + k], next: k === 1 ? 'mirror' : `copy ${k} back`, p: this.echo.rate[k], w: this.echo.n[k], len: k + 1, structural: true });
      }
    }
    const sequences = found.rules.filter((r) => r.ctx.length >= 2);
    return { rules, sequences, variants: found.variants };
  }

  /**
   * The character evolves: inborn emojis fade slowly unless reinforced; emojis it lived through
   * gain weight (praised moves, inventions you picked up, habits, what you used a lot).
   */
  updateCharacter() {
    const p = this.p;
    const w = this.charWeights;
    for (const [e, v] of w) w.set(e, v * p.characterDecay);
    const gain = new Map();
    const add = (e, x) => {
      if (e && isContent(e) && this.vocab.has(e)) gain.set(e, (gain.get(e) || 0) + x);
    };
    for (const [e, n] of this.sess.warm) add(e, 0.03 * n);
    for (const e of this.sess.adopted) add(e, 0.08);
    for (const h of this.activeHabits.values()) add(h.next, 0.03);
    for (const [e, n] of this.sess.playerUse) if (n >= 3) add(e, 0.01 * n);
    // an emoji can only grow into its character slowly: at most characterGain per sleep
    for (const [e, g] of gain) w.set(e, Math.min(3, (w.get(e) || 0) + Math.min(p.characterGain, g)));
    for (const [e, v] of w) if (v < 0.02) w.delete(e);
    const ranked = [...w].sort((a, b) => b[1] - a[1]);
    const strong = ranked.filter(([, v]) => v >= p.characterMin);
    this.character = (strong.length >= 3 ? strong : ranked).slice(0, p.characterSize).map(([e]) => e);
  }

  /** What it dreams: the sleep brain "thinking out loud". Not stored, regenerated from the seed. */
  dream(count) {
    if (!this.gut.trained || !this.gut.vocab.length) return new Array(count).fill(null);
    const rng = rngFor(this.seed, 'dream', this.sleepCount);
    const ctx = this.seq.slice(-this.p.netContext);
    const out = [];
    for (let i = 0; i < count; i++) {
      const tok = sample(this.gut.distribution(ctx), rng);
      out.push(tok);
      ctx.push(tok);
    }
    return out;
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
    if (!this.sleep) {
      this.awake = true;
      this.turn = 'C';
      return;
    }
    const energy = this.energyAt(t);

    // long neglect costs maturity
    const days = (t - this.lastSessionEnd) / (24 * HOUR);
    if (this.lastSessionEnd && days > this.p.neglectDays) {
      this.maturity = Math.max(0, this.maturity - this.p.neglectLoss * (days - this.p.neglectDays));
    }
    // growth by experience, one stage at a time (docs/06 #1)
    const th = this.p.stageThresholds;
    let stage = this.stage;
    if (stage < STAGES.length - 1 && this.maturity >= th[stage]) stage++;
    else if (stage > 0 && this.maturity < th[stage - 1] * 0.7) stage--;
    this.stage = stage;

    const rng = rngFor(this.seed, 'wake', this.sleepCount);
    const frac = energy / this.capacity;
    this.capacity = this.p.capacity * STAGES[stage].capacity * (1 + (rng() * 2 - 1) * this.p.capacityJitter);
    this.energy = frac * this.capacity;
    this.sleep = null;
    this.awake = true;
    this.turn = 'C';
    this.sessionInputs = 0;
    this.sessionStartPending = true;
    this.sessionSeqStart = this.seq.length;
  }
}
