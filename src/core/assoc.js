// Association memory (docs/08): for every context of 1…4 real signs, how strongly each sign has
// followed it. Links change by use (+1), ✓ / ✗ and dreams, and are slowly pulled back towards 0 while
// it's awake: decayPerTurn per turn of yours (0.03: a +3 or −3 link is back at 0 after 100 turns).

import { SEP } from './tokens.js';

export class Assoc {
  constructor(params) {
    this.p = params;
    this.table = new Map(); // "L|ctx" -> Map(sign -> { w, c }): weight as of turn c
    this.version = 0;
    this.clock = 0; // your turns while awake (the slow pull towards 0 runs on this)
  }

  /** One more turn of yours while awake. */
  tick() {
    this.clock++;
    this.version++;
  }

  /** A link's weight now: pulled towards 0 by decayPerTurn per turn since it last changed. */
  eff(e) {
    const left = Math.abs(e.w) - this.p.decayPerTurn * (this.clock - e.c);
    return left > 0 ? Math.sign(e.w) * left : 0;
  }

  /** The current weight of "after ctx comes sign" on level ctx.length. */
  get(ctx, sign) {
    const e = this.table.get(this.key(ctx, ctx.length))?.get(sign);
    return e ? this.eff(e) : 0;
  }

  key(ctx, L) {
    return L + '|' + ctx.slice(ctx.length - L).join(SEP);
  }

  /** Add `amount` to "after ctx comes sign" on levels 1 … maxLevel (as far as the context reaches). */
  add(ctx, sign, amount, maxLevel = this.p.levels) {
    if (!amount) return;
    this.version++;
    const maxL = Math.min(this.p.levels, maxLevel, ctx.length);
    for (let L = 1; L <= maxL; L++) {
      const k = this.key(ctx, L);
      let row = this.table.get(k);
      if (!row) this.table.set(k, (row = new Map()));
      const e = row.get(sign);
      row.set(sign, { w: (e ? this.eff(e) : 0) + amount, c: this.clock });
    }
  }

  /** Add `amount` to "after ctx comes sign" on level ctx.length only. */
  addAt(ctx, sign, amount) {
    if (!amount || !ctx.length || ctx.length > this.p.levels) return;
    this.version++;
    const k = this.key(ctx, ctx.length);
    let row = this.table.get(k);
    if (!row) this.table.set(k, (row = new Map()));
    const e = row.get(sign);
    row.set(sign, { w: (e ? this.eff(e) : 0) + amount, c: this.clock });
  }

  /** The links of each level for this context: [{ L, ctx, weight, links: [[sign, w]] }]. */
  levelsFor(ctx) {
    const out = [];
    const maxL = Math.min(this.p.levels, ctx.length);
    for (let L = 1; L <= maxL; L++) {
      const row = this.table.get(this.key(ctx, L));
      const links = row ? [...row].map(([s, e]) => [s, this.eff(e)]).filter(([, w]) => w !== 0) : [];
      out.push({ L, ctx: ctx.slice(ctx.length - L), weight: Math.pow(this.p.levelGrowth, L - 1), links });
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
      for (const [sign, e] of row) {
        const w = this.eff(e);
        if (w !== 0) out.push({ ctx: ctx.split(SEP), sign, w });
      }
    }
    return out.sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, count);
  }
}

/** A link's vote strength: log2(1 + w), negative links vote against. */
export const strength = (w) => Math.sign(w) * Math.log2(1 + Math.abs(w));
