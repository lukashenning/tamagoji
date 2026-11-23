// "Frequently used", weighted by recency like the iOS keyboard: every use counts 1, and its
// weight halves every `halfLife` sessions. What you use now is what you see. (docs/06 #5)

export class Frequent {
  constructor(halfLife = 3) {
    this.halfLife = halfLife;
    this.session = 0;
    this.items = new Map(); // emoji -> { s: score at session `at`, at }
  }

  nextSession() {
    this.session++;
  }

  score(it) {
    return it.s * Math.pow(2, -(this.session - it.at) / this.halfLife);
  }

  use(emoji) {
    const it = this.items.get(emoji);
    this.items.set(emoji, { s: (it ? this.score(it) : 0) + 1, at: this.session });
  }

  top(n) {
    return [...this.items]
      .map(([e, it]) => [e, this.score(it)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([e]) => e);
  }
}
