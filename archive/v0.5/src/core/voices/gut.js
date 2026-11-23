// Gut-feeling voice: the sleep brain. A tiny neural network, trained only while sleeping.
//
// How it works (plain words): every emoji gets a short list of numbers (an "embedding").
// Emojis that are used in similar situations end up with similar numbers, so the net can
// guess in situations it has never seen. Input = embeddings of the last 4 tokens →
// one hidden layer → a score for every known emoji → probabilities (softmax).
// Trained with plain stochastic gradient descent. Deterministic for a given seed.

import { rngFor } from '../rng.js';

export class Gut {
  constructor(params, seed) {
    this.d = params.netEmbed;
    this.h = params.netHidden;
    this.C = params.netContext;
    this.seed = seed;
    this.CD = this.C * this.d;
    /** @type {Map<string, Float32Array>} */
    this.emb = new Map();
    /** @type {Map<string, {w: Float32Array, b: number}>} */
    this.out = new Map();
    this.vocab = [];
    const r = rngFor(seed, 'W1');
    this.W1 = new Float32Array(this.h * this.CD).map(() => (r() * 2 - 1) * 0.15);
    this.b1 = new Float32Array(this.h);
    this.trained = false;
    this.examplesSeen = 0;
  }

  ensure(tok) {
    if (this.emb.has(tok)) return;
    const r = rngFor(this.seed, 'tok', tok);
    this.emb.set(tok, new Float32Array(this.d).map(() => (r() * 2 - 1) * 0.1));
    this.out.set(tok, { w: new Float32Array(this.h).map(() => (r() * 2 - 1) * 0.1), b: 0 });
    this.vocab.push(tok);
  }

  forward(ctx) {
    const { C, d, h, CD } = this;
    const x = new Float32Array(CD);
    const toks = [];
    for (let i = 0; i < C; i++) {
      const tok = ctx[ctx.length - C + i];
      toks.push(tok);
      const e = tok !== undefined && this.emb.get(tok);
      if (e) x.set(e, i * d);
    }
    const hid = new Float32Array(h);
    for (let j = 0; j < h; j++) {
      let s = this.b1[j];
      const row = j * CD;
      for (let i = 0; i < CD; i++) s += this.W1[row + i] * x[i];
      hid[j] = Math.tanh(s);
    }
    const V = this.vocab.length;
    const probs = new Float32Array(V);
    let max = -Infinity;
    for (let v = 0; v < V; v++) {
      const o = this.out.get(this.vocab[v]);
      let s = o.b;
      for (let j = 0; j < h; j++) s += o.w[j] * hid[j];
      probs[v] = s;
      if (s > max) max = s;
    }
    let sum = 0;
    for (let v = 0; v < V; v++) {
      probs[v] = Math.exp(probs[v] - max);
      sum += probs[v];
    }
    for (let v = 0; v < V; v++) probs[v] /= sum;
    return { x, hid, probs, toks };
  }

  /** Full distribution as [[tok, p], ...]. */
  distribution(ctx) {
    if (!this.vocab.length) return [];
    const { probs } = this.forward(ctx);
    return this.vocab.map((t, v) => [t, probs[v]]);
  }

  predict(ctx) {
    if (!this.trained || !this.vocab.length) return { dist: new Map(), conf: 0 };
    const all = this.distribution(ctx).sort((a, b) => b[1] - a[1]).slice(0, 20);
    let total = 0;
    for (const [, p] of all) total += p;
    const dist = new Map(all.map(([t, p]) => [t, p / total]));
    return { dist, conf: all.length ? all[0][1] : 0 };
  }

  /** One pass of learning on [ctx, target] examples. */
  train(examples, epochs, lr, rng) {
    const { C, d, h, CD } = this;
    for (let ep = 0; ep < epochs; ep++) {
      // shuffle (deterministic)
      for (let i = examples.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [examples[i], examples[j]] = [examples[j], examples[i]];
      }
      for (const [ctx, target] of examples) {
        const { x, hid, probs, toks } = this.forward(ctx);
        const dh = new Float32Array(h);
        for (let v = 0; v < this.vocab.length; v++) {
          const g = probs[v] - (this.vocab[v] === target ? 1 : 0);
          const o = this.out.get(this.vocab[v]);
          for (let j = 0; j < h; j++) {
            dh[j] += g * o.w[j];
            o.w[j] -= lr * g * hid[j];
          }
          o.b -= lr * g;
        }
        const dx = new Float32Array(CD);
        for (let j = 0; j < h; j++) {
          const dpre = dh[j] * (1 - hid[j] * hid[j]);
          this.b1[j] -= lr * dpre;
          const row = j * CD;
          for (let i = 0; i < CD; i++) {
            dx[i] += dpre * this.W1[row + i];
            this.W1[row + i] -= lr * dpre * x[i];
          }
        }
        for (let i = 0; i < C; i++) {
          const e = toks[i] !== undefined && this.emb.get(toks[i]);
          if (!e) continue;
          for (let q = 0; q < d; q++) e[q] -= lr * dx[i * d + q];
        }
        this.examplesSeen++;
      }
    }
    if (examples.length) this.trained = true;
  }

  /** Checksum of all weights, for determinism tests. */
  checksum() {
    let s = 0;
    for (let i = 0; i < this.W1.length; i += 7) s += this.W1[i];
    for (const t of this.vocab) s += this.emb.get(t)[0] + this.out.get(t).w[0];
    return s;
  }
}
