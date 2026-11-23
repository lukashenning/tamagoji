# 02 — Technology options & counsel

> Status: **proposal**, waiting for your feedback. Written for someone without ML background.

## 1. What "next-token prediction" means here

- A **token** is one unit in the creature's history: an emoji, or a special event such as
  `SLEEP`, `WAKE` or (later) `TAP:eyes:2`.
- A **model** looks at the last few tokens (the **context**). For every token it knows, it outputs
  a probability: "after 🌞 🌞 the next one is 🌻 with 60%, 🌙 with 20%, …".
- The creature **samples** its answer from those probabilities. **Temperature** is the chaos knob:
  low = predictable, high = wild.
- **Learning** means: after it sees what actually came next, it adjusts so that this becomes more
  likely next time.

Large language models do exactly this, just with billions of parameters and trillions of tokens.
We'll do it with a few thousand parameters and a few hundred tokens a day.

## 2. The constraints that decide the design

| Constraint | Consequence |
|---|---|
| **Tiny amount of data.** A player gives maybe 20–300 emojis per day. | Plain neural nets learn too slowly from that. They need many repetitions of small nudges. |
| **Learning must be visible within minutes.** If you repeat 🌞→🌻 three times, it should "get it". | We need some kind of **instant memory**. |
| **Runs on a phone, offline.** | Small models only, plain JavaScript, no server. |
| **The history *is* the creature.** | Everything must be **re-computable from the history**, so learning must be deterministic. |
| **A few MB of storage.** | Compact history format; model weights must stay small. |
| **Should feel alive, surprising, not like a lookup table.** | We want *some* generalisation: it should treat emojis that are used alike as related. That is what a neural net adds. |

## 3. Model options

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **A. Variable-order n-gram / PPM** ("counting memory") | Counts what followed each context of length 1…4. Predicts by mixing short and long contexts. PPM (Prediction by Partial Matching) is literally a compression algorithm. | Learns **instantly** (one example is enough). Tiny, fast, transparent, easy to debug. "Rules" are just high-confidence contexts. Fits "compression" perfectly. | Not a neural net. **No generalisation**: what it learned for 🐶 says nothing about 🐱. Can feel mechanical. |
| **B. Tiny MLP with embeddings** (Bengio-style neural language model) | Each emoji gets a small vector (**embedding**, e.g. 16 numbers). The vectors of the last N tokens go through one small hidden layer, then a softmax over the vocabulary. ~10k–50k parameters. | A real neural net, but small enough to hand-write in ~200 lines. Embeddings give **generalisation and "creative" mistakes**. Trains in milliseconds in JS. | Learns slowly from few examples. Training on new things makes it **forget** old things ("catastrophic forgetting"), unless we replay the old history. Fixed context length. |
| **C. Tiny recurrent net (GRU/LSTM)** | Like B, but it carries a hidden "mood" state through the whole sequence. | Unlimited context in principle, feels "stateful". | Harder to train online, fragile, slower, harder to make deterministic and debuggable. Not worth it for a PoC. |
| **D. Tiny transformer** | A mini GPT. | Buzzword-compatible. | Needs far more data than we will ever have. Overkill. ❌ |
| **E. Hybrid: A + B** ("two memories") | Fast counting memory while awake + small neural net that is trained **during sleep** by replaying the history. | Instant learning **and** generalisation. Maps almost 1:1 onto your notes (see §4). | Two systems to tune. Blending their predictions takes some care. |

## 4. Recommendation: **Hybrid "two memories" (Option E)**

Neuroscience has a theory for this, **Complementary Learning Systems**: the hippocampus memorises
quickly during the day, and in sleep it **replays** experiences into the cortex, which learns slowly
and extracts general rules. Your notes describe almost exactly this. So the mechanics aren't
arbitrary; they come out of the concept.

| Your concept | Proposed mechanism |
|---|---|
| Learning while awake | **Fast memory** (counting, Option A). Updated after every token. |
| Question → learns much faster | The player's answer to a question gets a **multiplied weight** in fast memory. |
| Positive / negative reinforcement | Scales up or down the weight of whatever the creature just did in that context. |
| Forgetting (but all symbols stay) | Fast-memory weights **decay with recency**. The history itself is never changed. |
| Remembering | When the current context matches an old chain somewhere in the full history, sometimes **copy its continuation forward**. |
| Sleep = compression, dream visible | **Consolidation**: the neural net (Option B) trains on the history (recent part weighted higher). The **dream symbols are what the net generates while it trains**, so the dream literally shows what it is learning. |
| Recovery measured in dream symbols | Tiredness = tokens since waking vs. capacity. Recovery = number of dream tokens produced at a fixed rate. |
| Narratives / compressed chains | Frequent chains get **merged into one "chunk" token**. This is the same trick LLM tokenizers use (Byte-Pair Encoding). Similar chunks are **bundled** by the similarity of their embeddings. |
| Rules / learning inertia | A rule = a context whose prediction is confident (p > threshold) **and** supported by ≥ N occurrences. |
| Complexity | Weighted count of rules (longer and more varied ones weigh more). Drives grow/shrink later. |
| Chaos parameter | Temperature + a small "novelty" chance to slip in a new or random emoji. |

**How the creature picks its answer while awake:**
`final = blend(fast memory, neural net)` → apply temperature → sometimes inject novelty or a
memory → sample one emoji. The blend leans on fast memory for fresh patterns and on the net for
"intuition" in contexts it has never seen.

**Staged build, so you see results early:**
1. **M0**: chat loop and emoji palette, history stored, no intelligence (random/echo).
2. **M1**: fast memory only. The creature visibly learns patterns.
3. **M2**: sleep and the neural net. Compare with M1: does it feel more alive?
4. **M3**: questions, reinforcement, rules, complexity score.

## 5. "The history is the creature": how to keep that true

- History = an **append-only list of tokens** (+ timestamps where needed). This is the **single
  source of truth**.
- Everything else (fast memory, neural weights, rules, complexity) is **derived data**: a cache that
  can always be rebuilt by replaying the history.
- That requires **deterministic learning**: a seeded random generator (seed derived from the
  history), fixed training order, no GPU. Plain JS floats are deterministic on one engine.
  Different browsers can differ in the last digits of `Math.exp`. For the PoC that's acceptable.
  If it ever matters, we can use our own `exp` approximation.
- **Snapshots**: rebuilding from scratch gets slower as the history grows, so we store a cached
  snapshot (weights + fast memory) after each sleep. This is the "extra local data, only if
  needed" from your notes. It is **not** a second source of truth, just a speed-up.
- **Engine version**: if we change the learning code, the same history produces a different
  creature. So the history file records which engine version created it.
- **Dreams** don't need to be stored. They can be regenerated from `SLEEP` timestamp + seed + now.
  That's also how the fast replay on reopening works.

## 6. Tokens & vocabulary

- Unicode has ~3,700 emojis (~1,900 without skin-tone/gender variants). The model only needs to
  know emojis that have **actually appeared** in the history, so the **vocabulary grows** as the
  creature meets new emojis. That keeps it small and gives a nice "it has never seen this" moment.
- Special tokens: `SLEEP`, `WAKE`, a turn/speaker marker (who said it: player or creature), later
  `TAP:*`, and `CHUNK:*` for compressed narratives.
- Proposal for the PoC: treat skin-tone variants as their base emoji (keeps the vocabulary
  meaningful). Flags and ZWJ sequences count as single emojis.

## 7. Storage estimate

- Compact format, e.g. a token dictionary + array of `[id, Δt]`: ~4–8 bytes per token.
  **4 MB ≈ 500k+ tokens ≈ years of daily play.** No problem.
- Neural-net snapshot: ~50k parameters × 4 bytes ≈ 200 KB.
- **localStorage** holds ~5 MB per site (some browsers store strings as UTF-16, which effectively
  halves that). **IndexedDB** allows much more and is better for the binary snapshot. Proposal:
  history in localStorage or IndexedDB, snapshot in IndexedDB.
- ⚠️ **iOS Safari may delete site storage** of websites not visited for ~7 days. Installed
  home-screen PWAs are exempt. So: **export/import the creature as a file** from day one. Bonus: a
  creature becomes a shareable file.

## 8. Proposed stack

| Part | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Types help a lot with token/model code. Runs everywhere. |
| Build/dev server | **Vite** | Zero config, instant reload, PWA plugin available later. |
| UI | **Vanilla TS + DOM** (or Preact if it gets fiddly) | The UI is tiny: one creature, one palette. No framework needed. |
| Neural net | **Hand-written in TS** (`Float32Array`, manual backprop) | ~200 lines. Full control, deterministic, no 1 MB+ library. TensorFlow.js is overkill and non-deterministic on GPU. |
| Emoji data | `emojibase-data` or `unicode-emoji-json` (npm) | Complete emoji list with categories for the palette. |
| PWA | `vite-plugin-pwa` (manifest + service worker) | Add at M1/M2 once the core works. Not needed to test in the browser. |
| Tests / experiments | **Vitest** + headless simulation scripts (Node) | See §9. |

## 9. Experiment tooling (important for a PoC)

To find good parameter values we shouldn't rely only on manual play:

- **Lab panel** in the app (toggle): shows the model's top predictions with probabilities, fast
  memory vs. net, current rules, complexity, tiredness, and sliders for all parameters. Plus
  buttons like "sleep now" and "fast-forward".
- **Bot players** (headless scripts): simulated players with simple habits ("always answers 🌞 with
  🌻", "rewards with 👍", "random"). We measure e.g. *how many repetitions until the creature reliably
  continues a pattern*, *how chaotic it is*, *how complexity grows over a simulated week*. That
  turns "does it feel alive?" into numbers we can compare across settings.
