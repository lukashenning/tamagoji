// Echo voice: structural patterns. "The next token is a copy of the one k steps back",
// independent of which emoji. Catches mirroring (k=1), alternation (k=2), etc. See docs/05 §4.

export const MAX_K = 4;

export class Echo {
  constructor() {
    this.rate = new Array(MAX_K + 1).fill(0); // hit rate per k (moving average)
    this.n = new Array(MAX_K + 1).fill(0);
  }

  /** Called with the sequence *before* the player's token is appended. */
  update(seq, tok) {
    for (let k = 1; k <= MAX_K; k++) {
      if (seq.length < k) continue;
      const hit = seq[seq.length - k] === tok ? 1 : 0;
      this.rate[k] = this.rate[k] * 0.93 + hit * 0.07;
      this.n[k]++;
    }
  }

  predict(seq, K) {
    const dist = new Map();
    let conf = 0;
    let total = 0;
    for (let k = 1; k <= Math.min(K, MAX_K); k++) {
      if (seq.length < k || this.n[k] < 3) continue;
      const r = this.rate[k];
      const tok = seq[seq.length - k];
      dist.set(tok, (dist.get(tok) || 0) + r);
      total += r;
      conf = Math.max(conf, r);
    }
    if (total > 0) for (const [t, p] of dist) dist.set(t, p / total);
    return { dist, conf };
  }
}
