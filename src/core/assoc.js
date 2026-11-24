// Association memory (docs/08): for every context of 1…4 real signs, how strongly each sign has
// followed it. Links only change by use (+1), ✓ / ✗ and dreams; no forgetting.

import { SEP } from './tokens.js';

export class Assoc {
  constructor(params) {
    this.p = params;
    this.table = new Map(); // "L|ctx" -> Map(sign -> weight)
    this.version = 0;
  }

  key(ctx, L) {
    return L + '|' + ctx.slice(ctx.length - L).join(SEP);
  }

  /** Add `amount` to "after ctx comes sign" on every level the context is long enough for. */
  add(ctx, sign, amount) {
    if (!amount) return;
    this.version++;
    const maxL = Math.min(this.p.levels, ctx.length);
    for (let L = 1; L <= maxL; L++) {
      const k = this.key(ctx, L);
      let row = this.table.get(k);
      if (!row) this.table.set(k, (row = new Map()));
      row.set(sign, (row.get(sign) || 0) + amount);
    }
  }

  /** The links of each level for this context: [{ L, ctx, weight, links: [[sign, w]] }]. */
  levelsFor(ctx) {
    const out = [];
    const maxL = Math.min(this.p.levels, ctx.length);
    for (let L = 1; L <= maxL; L++) {
      const row = this.table.get(this.key(ctx, L));
      out.push({ L, ctx: ctx.slice(ctx.length - L), weight: Math.pow(this.p.levelGrowth, L - 1), links: row ? [...row] : [] });
    }
    return out;
  }

  /** How many contexts it knows something about, per level. */
  sizes() {
    const n = new Array(this.p.levels + 1).fill(0);
    for (const k of this.table.keys()) n[Number(k.split('|')[0])]++;
    return n;
  }

  /** The strongest links of one level: [{ ctx, sign, w }]. */
  strongest(L, count = 12) {
    const out = [];
    for (const [k, row] of this.table) {
      const [l, ctx] = [Number(k.slice(0, k.indexOf('|'))), k.slice(k.indexOf('|') + 1)];
      if (l !== L) continue;
      for (const [sign, w] of row) out.push({ ctx: ctx.split(SEP), sign, w });
    }
    return out.sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, count);
  }
}

/** A link's vote strength: log2(1 + w), negative links vote against. */
export const strength = (w) => Math.sign(w) * Math.log2(1 + Math.abs(w));
