// Phrasebook voice: exact patterns. "After exactly these last 1…8 tokens came X."
// Learns instantly, fades over time (short-term memory). See docs/05 §4.

import { SEP } from '../tokens.js';

export const MAX_CONTEXT = 8;

export class Phrasebook {
  constructor(params) {
    this.p = params;
    /** @type {Map<string, Map<string, {w: number, c: number}>>} context key -> next token -> weight */
    this.table = new Map();
    this.clock = 0; // advances with every lesson; sleep jumps it forward (fading)
  }

  decay(entry) {
    return entry.w * Math.pow(2, -(this.clock - entry.c) / this.p.fastHalfLife);
  }

  /** Learn "after ctx comes next". Negative weight weakens. */
  learn(ctx, next, weight) {
    this.clock += 1;
    const maxL = Math.min(MAX_CONTEXT, ctx.length);
    for (let L = 1; L <= maxL; L++) {
      const key = ctx.slice(ctx.length - L).join(SEP);
      let row = this.table.get(key);
      const entry = row && row.get(next);
      const w = Math.max(0, (entry ? this.decay(entry) : 0) + weight);
      if (!entry && w === 0) continue;
      if (!row) {
        row = new Map();
        this.table.set(key, row);
      }
      row.set(next, { w, c: this.clock });
    }
  }

  /** Effective (faded) weights for one context. */
  rowAt(key) {
    const row = this.table.get(key);
    if (!row) return null;
    const items = [];
    let total = 0;
    for (const [tok, e] of row) {
      const w = this.decay(e);
      if (w < 0.01) continue;
      items.push([tok, w]);
      total += w;
    }
    return total > 0 ? { items, total } : null;
  }

  /**
   * Mix long and short contexts: a long context that has been seen often wins,
   * otherwise fall back to shorter ones. Returns a distribution and a confidence 0..1.
   */
  predict(ctx, maxL) {
    const k = Math.max(0.2, this.p.repsToLearn / 3); // after repsToLearn consistent reps → 75%
    const dist = new Map();
    let remaining = 1;
    let usedL = 0;
    for (let L = Math.min(maxL, ctx.length); L >= 1; L--) {
      const r = this.rowAt(ctx.slice(ctx.length - L).join(SEP));
      if (!r) continue;
      if (!usedL) usedL = L;
      const conf = r.total / (r.total + k);
      for (const [tok, w] of r.items) dist.set(tok, (dist.get(tok) || 0) + (remaining * conf * w) / r.total);
      remaining *= 1 - conf;
    }
    const conf = 1 - remaining;
    if (conf > 0) for (const [t, p] of dist) dist.set(t, p / conf);
    return { dist, conf, L: usedL };
  }

  /** Fade everything by jumping the clock forward. */
  jump(n) {
    this.clock += n;
  }

  /** Confident, repeated patterns. Also counts contexts with several solid variants. */
  rules(minP, minW) {
    const rules = [];
    let variants = 0;
    for (const key of this.table.keys()) {
      const r = this.rowAt(key);
      if (!r) continue;
      let top = null;
      let solid = 0;
      for (const [tok, w] of r.items) {
        if (!top || w > top[1]) top = [tok, w];
        if (w >= minW && w / r.total >= 0.25) solid++;
      }
      if (solid >= 2) variants++;
      if (top[1] >= minW && top[1] / r.total >= minP) {
        rules.push({ ctx: key.split(SEP), next: top[0], p: top[1] / r.total, w: top[1] });
      }
    }
    return { rules, variants };
  }
}
