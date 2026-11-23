// Pattern memory: what followed which sequence, over the whole history (docs/07).
//
// For every emoji it learns three kinds of connection at once:
//   L = 0      the emoji itself (how much it tends to say it at all)
//   L = 1      its link to the emoji before
//   L = 2…6    its link to the recent sequence before that
// ✅ strengthens all of them, ❌ weakens all of them. Old patterns fade slowly (recent counts more).

import { SEP } from './tokens.js';

export class Memory {
  constructor(params) {
    this.p = params;
    /** @type {Map<string, {L: number, items: Map<string, {w: number, c: number, n: number}>}>} */
    // w = weight (fades), c = clock at last change, n = how often it really happened (or got ✅)
    this.table = new Map();
    this.clock = 0; // counts conversation emojis (for slow fading)
    this.version = 0; // changes whenever anything is learned (for caching)
  }

  faded(e) {
    return e.w * Math.pow(2, -(this.clock - e.c) / this.p.memoryHalfLife);
  }

  /**
   * Learn "after ctx comes next" with `weight` (negative = counter-reinforce) at every context
   * length from 0 to contextMax. `tick` advances the fading clock (only for real conversation).
   */
  learn(ctx, next, weight, tick = true) {
    if (tick) this.clock += 1;
    this.version++;
    const maxL = Math.min(this.p.contextMax, ctx.length);
    for (let L = 0; L <= maxL; L++) {
      const key = ctx.slice(ctx.length - L).join(SEP);
      let row = this.table.get(key);
      const e = row && row.items.get(next);
      const w = Math.max(0, (e ? this.faded(e) : 0) + weight);
      if (!e && w === 0) continue;
      if (!row) {
        row = { L, items: new Map() };
        this.table.set(key, row);
      }
      row.items.set(next, { w, c: this.clock, n: (e ? e.n : 0) + (tick && weight > 0 ? 1 : 0) });
    }
  }

  /**
   * ✅ / ❌: change "after ctx comes next" for the reaction only: the link to the emoji it answered
   * (L = 1) and to the sequence it answered (L = 2…contextMax). w → max(0, w × mul + add).
   */
  reinforce(ctx, next, mul, add) {
    this.version++;
    const maxL = Math.min(this.p.contextMax, ctx.length);
    for (let L = 1; L <= maxL; L++) {
      const key = ctx.slice(ctx.length - L).join(SEP);
      let row = this.table.get(key);
      const e = row && row.items.get(next);
      const w = Math.max(0, (e ? this.faded(e) : 0) * mul + add);
      if (!e && w === 0) continue;
      if (!row) {
        row = { L, items: new Map() };
        this.table.set(key, row);
      }
      row.items.set(next, { w, c: this.clock, n: (e ? e.n : 0) + (add > 0 ? 1 : 0) });
    }
  }

  /** Faded weights for one context. */
  rowAt(key) {
    const row = this.table.get(key);
    if (!row) return null;
    const items = [];
    let total = 0;
    for (const [tok, e] of row.items) {
      const w = this.faded(e);
      if (w < 0.01) continue;
      items.push([tok, w]);
      total += w;
    }
    return total > 0 ? { items, total } : null;
  }

  /**
   * Next-token prediction from the recent sequence. Longer matching sequences win when they've
   * been seen often enough; otherwise shorter ones fill in.
   * - dist: what comes next, given the context
   * - conf: how much of that is backed by context (0 = no idea)
   * - general: its general tendency (the emojis themselves, L = 0), for when it has no idea
   */
  predict(ctx) {
    const k = Math.max(0.2, this.p.repsToLearn / 3); // after repsToLearn consistent reps → 75%
    const dist = new Map();
    let remaining = 1;
    let usedL = 0;
    for (let L = Math.min(this.p.contextMax, ctx.length); L >= 1; L--) {
      const r = this.rowAt(ctx.slice(ctx.length - L).join(SEP));
      if (!r) continue;
      if (!usedL) usedL = L;
      const conf = r.total / (r.total + k);
      for (const [tok, w] of r.items) dist.set(tok, (dist.get(tok) || 0) + (remaining * conf * w) / r.total);
      remaining *= 1 - conf;
    }
    const conf = 1 - remaining;
    if (conf > 0) for (const [t, q] of dist) dist.set(t, q / conf);
    const general = new Map();
    const g = this.rowAt('');
    if (g) for (const [tok, w] of g.items) general.set(tok, w / g.total);
    let top = null;
    for (const [t, q] of dist) if (!top || q > dist.get(top)) top = t;
    return { dist, conf, L: usedL, general, top };
  }

  /** Confident patterns with exactly L emojis of context (for the test panel). */
  patterns(L, minShare, minWeight) {
    const out = [];
    for (const [key, row] of this.table) {
      if (row.L !== L) continue;
      const r = this.rowAt(key);
      if (!r) continue;
      let top = null;
      for (const it of r.items) if (!top || it[1] > top[1]) top = it;
      if (top[1] >= minWeight && top[1] / r.total >= minShare) {
        out.push({ ctx: key ? key.split(SEP) : [], next: top[0], share: top[1] / r.total, w: top[1] });
      }
    }
    return out.sort((a, b) => b.w - a.w);
  }

  /**
   * All learned continuations (not only the top one) with exactly L emojis of context: weight ≥ minWeight,
   * share ≥ minShare, and it really happened (or got ✅) at least minCount times.
   */
  learned(L, minShare, minWeight, minCount = 1) {
    const out = [];
    for (const [key, row] of this.table) {
      if (row.L !== L) continue;
      const r = this.rowAt(key);
      if (!r) continue;
      for (const [tok, w] of r.items) {
        if (w < minWeight || w / r.total < minShare || row.items.get(tok).n < minCount) continue;
        out.push({ ctx: key ? key.split(SEP) : [], next: tok, share: w / r.total, w });
      }
    }
    return out;
  }

  /** The most likely continuation after a single emoji. */
  topAfter(emoji) {
    const r = this.rowAt(emoji);
    if (!r) return null;
    let top = null;
    for (const it of r.items) if (!top || it[1] > top[1]) top = it;
    return top[0];
  }

  /** Number of sequences it remembers something about. */
  get size() {
    return this.table.size;
  }
}
