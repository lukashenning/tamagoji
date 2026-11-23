// Déjà-vu voice: "the last time this exact situation happened (anywhere in the whole history),
// what came next?" Picks up old threads that short-term memory has forgotten. See docs/05 §4.

import { SEP } from '../tokens.js';

export class DejaVu {
  constructor() {
    /** @type {Map<string, number>} context key (2–4 tokens) -> position of what followed */
    this.idx = new Map();
  }

  /** Called with the sequence *before* the player's token is appended at position `pos`. */
  update(seq, pos) {
    for (let L = 2; L <= 4; L++) {
      if (seq.length < L) break;
      this.idx.set(seq.slice(seq.length - L).join(SEP), pos);
    }
  }

  predict(seq) {
    for (let L = 4; L >= 2; L--) {
      if (seq.length < L) continue;
      const pos = this.idx.get(seq.slice(seq.length - L).join(SEP));
      if (pos !== undefined) {
        return { dist: new Map([[seq[pos], 1]]), conf: 0.2 + 0.12 * L, ago: seq.length - pos };
      }
    }
    return { dist: new Map(), conf: 0 };
  }
}
