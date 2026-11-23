> ⚠️ **Superseded** by [07-simple-core.md](07-simple-core.md) (prototype 0.6). This describes v0.1–0.5, kept in `archive/v0.5/`.

# 05 — System design: rules, logic, architecture

> **v3** (2026-11-23). v2: feelings no longer a central mechanic, patterns beyond A → B, growth
> stages, sticky-but-surprising, real-time sleep. v3: emotions replace positive/negative, iOS-style
> palette, spontaneous waking. **v4:** five essential emotions + tiredness (§7), the "curiosity" voice
> renamed **novelty** (to avoid confusion with the emotion), minimal game screen + test panel (§15).
> **Implemented** as prototype 0.1 (plain JavaScript, see §13). Where the code differs from this text, §16 says so.
> Each section starts with the idea in plain words, then the exact rule. All numbers are
> **starting values**, tunable in `params.ts` (§12). Open points → Qxx in
> [03-open-questions.md](03-open-questions.md).

---

## 1. The big picture

**What the game is about:** watching a creature **pick up behaviours**, **invent new signs and
little games**, and settle into habits that you can recognise, **while it keeps surprising you**.

```
                 ┌──────────────── AWAKE (~5 min) ───────────────┐     ┌──── ASLEEP (≤ ~1 h) ────┐
 your emoji ───▶ │ 1. notice  how well each "voice" predicted it  │     │ consolidate the session │
                 │ 2. learn   patterns, habits, emotions          │ ──▶ │ dream = sleep brain     │
                 │ 3. reply   voices vote → habit / variation /   │tired│   "thinking out loud"   │
 its emoji  ◀─── │            invention / question / wait         │     │ rules, complexity,      │
                 └────────────────────────────────────────────────┘ ◀── │ growth stage            │
                                                                rested  └─────────────────────────┘
```

Under the hood there's a small **council of "voices"** (§4). Each one predicts the next emoji in a
different way, and the creature listens most to whichever voice has been right lately. That's how
it handles **larger patterns**, not just A → B.

**Stored:** only the token history (§3). **Everything else is recomputed** from it.

---

## 2. Turns

**In plain words:** you and the creature strictly take turns, one emoji or nothing each. If it
doesn't answer, it's **listening** and you can say a second thing. If you pass, it carries on,
which is **narrating**.

| Turn content | Player | Creature |
|---|---|---|
| one emoji | ✔ | ✔ |
| nothing | `PASS` | `WAIT` (waiting marker) |

- Strict alternation while awake. While it sleeps, the palette is locked.
- `WAIT`/`PASS` are skipped when looking at patterns, so `🌞 · WAIT · 🌻` teaches the same as two
  adjacent emojis.
- After waking up (and at birth), **the creature moves first**.
- It replies after a short random delay (0.6–1.5 s).

---

## 3. History: what is stored

Each entry: `{ token, who, t }`
- `token`: an emoji, or `WAIT`, `PASS`, `SLEEP`, `WAKE`, `BIRTH`
- `who`: `P` (player) or `C` (creature)
- `t`: timestamp

`BIRTH` carries a random **seed** and the **engine version**. All randomness *inside the mind*
(training, dreams) comes from that seed, so the same history always rebuilds the same creature.
The creature's own choices are random, but they're written into the history, so replay doesn't need
to repeat them.

**Snapshot cache:** after each sleep, save the mind's state + history position. On startup, load
it and replay only the newer tokens. If it's missing or outdated, rebuild from scratch.

---

## 4. Patterns: the council of voices

**In plain words:** instead of one rulebook there are five voices. Each guesses the next emoji in
its own way. After each of your emojis, the creature checks who was right and trusts that voice a
bit more. If you play a lot of "echo games", the echo voice gets loud. If you have fixed
call-and-response pairs, the phrasebook voice gets loud.

| Voice | What it knows | Example pattern it catches |
|---|---|---|
| **Phrasebook** (exact patterns) | "After exactly these last 1…8 tokens came X." Prefers the longest context it has seen often enough. | 🌞 → 🌻 · or the longer 🌧️ ☂️ 🌧️ → ☂️ |
| **Echo** (structural patterns) | "The next token is a **copy** of the one *k* steps back." Independent of *which* emoji. | it repeats what you say · A B A B alternation · "you say X twice, I say X" |
| **Déjà vu** (long patterns, remembering) | Searches the **whole history** for the last time the current situation occurred, and suggests what came next back then. | picking up an old conversation thread from weeks ago (this replaces v1's "remembering") |
| **Gut feeling** (sleep brain) | The tiny neural net. Knows which emojis are used *alike*, so it guesses in situations it has never seen. | 🐶 → 🦴 learned, so 🐱 → 🦴 (or 🐟) guessed |
| **Novelty** | Proposes something new: an unused emoji, or a rarely used one. Mostly from the **same palette section** as the current conversation, ~20% from anywhere (§14). | trying 🍐 while you talk about 🍎 |

**Voting:** each voice gives probabilities. They are mixed, weighted by each voice's **trust**
(its recent hit rate). Then come the chaos/temperature and the stickiness rules (§6).

**Learning speed knob (`repsToLearn`, default 3):** how many consistent repetitions it takes until
the phrasebook is "confident" (≥ 75%) about a pattern. 1 = instant, 6 = slow and stubborn. One
value in `params.ts`. The other learning rates follow from it.

**What it learns from:**
- **your** tokens: always
- your answer to its **question**: ×3
- **its own** moves: only if followed by a "positive" emotion (§7)

**How you teach it, concretely:**
1. It **asks** (🌞 with question marker), you answer 🌻 → strong lesson "🌞 → 🌻".
2. It **listens** (`WAIT`), you demonstrate 🌞 then 🌻.
3. It **talks**, you answer: your answer teaches it how to answer that.
4. You **play a game** (e.g. always echo it): the echo voice gains trust and it starts playing too.

---

## 5. Progression: primitive → involved

**In plain words:** a newborn only sees the very last emoji and mostly echoes, waits or babbles.
As it grows, it sees further back, and more voices join the council. Growth happens after
waking up, based on its complexity (§11), the same score that later drives its appearance.

| Stage | Looks back | Voices available | Typical behaviour |
|---|---|---|---|
| 0 · newborn | 1 token | echo, novelty (random), wait | babbling, mirroring |
| 1 | 2 tokens | + phrasebook | first call-and-response pairs |
| 2 | 4 tokens | + questions, + gut feeling | asks things, first "creative" guesses |
| 3 | 6 tokens | + déjà vu, + inventing games (§8) | picks up old threads, starts little games |
| 4 | 8 tokens | all, larger capacity | longer narratives, rich habits |

- It can also **shrink back** a stage if its complexity drops (when it hasn't been played with
  in a varied way for a long time), as in the vision.
- Bigger stages = more **capacity** before it needs sleep (§10).

---

## 6. Sticky, but never fully predictable

**In plain words:** things you repeat across several sessions become **habits** that you can
recognise. But even a habit isn't 100%: sometimes it does a variation, sometimes it breaks it.
Fresh lessons are wobbly. Old habits are solid.

- **Fresh pattern:** learned in the current session, held by short-term memory, fades.
- **Habit:** a pattern that **survived ≥ 2 sleeps** (it's in the sleep brain *and* got confirmed
  again after waking). Habits get a strength bonus.
- **Certainty cap (`maxCertainty` = 85%):** no prediction ever goes above this. The rest is room for:
  - **twist**: a similar emoji instead (from the gut-feeling voice): 🌞 → 🌼 instead of 🌻
  - **break**: something else entirely (novelty voice)
  - **embellish**: the habit plus an extra step it hasn't done before
- **Chaos (temperature):** 0.8 normally, higher when bored, lower when confused (§7), slightly lower
  for strong habits.

So the player sees: *"It reliably answers 🌞 with 🌻 now… oh, today it said 🌼."*

---

## 7. Emotions (quiet, in the background)

**In plain words:** the creature has **five emotions** plus one body state, **tiredness**. They come
from two sources, and both matter:
1. **Situations**: what's happening in the conversation ("arises when" below).
2. **Learned associations**: emojis and emoji **patterns** that keep showing up in those moments take
   on the emotion. Later they trigger it on their own, and the creature uses them to express it.

Nothing is built in: if you always send 🥦 when it's tired, 🥦 becomes its "sleepy" emoji, and it
may send you 🥦 when it's tired.

| Emotion (label) | Includes | Arises when … | Changes behaviour like this |
|---|---|---|---|
| **joy** | laughter, affection, playfulness | something it tried gets picked up · a habit or game plays out smoothly · a surprise that makes sense (laughter) · you come back regularly (affection) | sticks with what works, repeats it, starts little games, more expressive |
| **curiosity** | surprise | a new emoji shows up · your move was unexpected · it's unsure what comes next | asks questions, explores |
| **unease** | boredom, confusion | **too predictable** (bored) **or too chaotic** (confused) | bored → tries something new · confused → simplifies: falls back on habits, echoes, waits |
| **sadness** | | ignored: you pass a lot, its tries go nowhere, you've been away a long time | waits more, quieter, tries less |
| **anger** | disgust | its strong expectations keep getting broken · (disgust) an emoji/pattern it associates with bad moments shows up | stubborn: insists on its habit · avoids "disgusting" emojis |
| **tiredness** *(body state)* | exhaustion | low energy (§10) | shorter, more waiting, nods off |

**Unease: one emotion, two directions.** Boredom and confusion are the two ends of the same scale:
*how new is this conversation?* Too little new → bored. Too much new → confused. Somewhere in the
middle is the sweet spot, where curiosity and joy happen. The label shows "bored" or "confused",
depending on the direction.

**Tiredness** isn't a real emotion. It's the energy level (§10), but it's treated like one: it gets
a label, and emojis/patterns can become associated with it.

**Mechanics**
- **State:** 5 emotion values from 0 to 1 (+ the unease direction), plus tiredness from energy.
  Situations raise them, and they fade over a few turns. Recomputed from the history.
- **Association:** every emoji and every recurring pattern (2–3 tokens, seen ≥ `repsToLearn`
  times) gets an **emotion profile**: a slow average of the emotion state at the moments it
  occurred. The player's tokens count fully, its own count less. Profiles build over many
  sessions.
- **Contagion:** receiving an emoji or pattern nudges its emotions toward that profile. The more
  established the association, the stronger the nudge. Contagion also grows with the growth stage:
  a newborn feels mostly what situations cause; an older creature feels more through what it has
  learned. It "grows up" emotionally.
- **Expression:** when replying, it slightly prefers emojis whose profile matches its current
  strongest emotion (`expressiveness`).
- **Reinforcement:** if **joy** follows its move, the move is learned as if you'd made it, so it
  sticks. If **sadness or anger** follows, the move is weakened, so it varies next time. Curiosity
  and unease don't reinforce; they drive exploration.
- **Visible:** one small text label with the strongest emotion, only when it's strong: joy ·
  curious · bored · confused · sad · angry · tired. Plus sleeping / asking / waiting.

---

## 8. Inventions and questions

**In plain words:** some emotions make it **try things**. Boredom leads to new signs and games, joy
leads to little games, curiosity leads to questions, and confusion makes it simplify.

- **New sign** (bored, curious): an emoji it has never used (picked as in §14). It enters its
  vocabulary.
- **Invented game** (stage 3+, bored or joyful): it starts a structural pattern on purpose and sees
  if you join in: echoing you, alternating two emojis, repeating its last emoji, building on a
  sequence. If you play along, joy rises and the pattern can become a habit.
- **Question** (stage 2+, curious): question marker on. It replays an emoji or a short chain it's
  unsure about. Your answer counts ×3. It can continue for up to 3 steps while still unsure, and
  ends when it's confident or you `PASS`.
- **Simplifying** (confused): lower chaos, prefer habits and echoing, more `WAIT`.

---

## 9. Choosing a reply (the creature's turn)

1. **Going to sleep?** (§10) → `SLEEP`.
2. **In a question or invented game?** → continue it.
3. **Bored, joyful or curious enough?** → invent / ask (§8). **Confused?** → simplify.
4. Otherwise **the council votes** (§4) → emotional expression bias (§7) → stickiness rules and
   chaos (§6) → one emoji.
5. **Clueless** (nothing above ~15%)? → `WAIT` (listen), echo, or babble. Newborns do this most.

---

## 10. Energy, sleep, dreams (real time)

**In plain words:** a play session lasts about 5 minutes (~100 of your inputs). Then it gets
tired and sometimes nods off suddenly. It also falls asleep if you leave it alone for a while.
Full recovery takes about an hour. While it sleeps you can't talk to it, but you can watch it
dream. If you close the app, everything is calculated when you come back.

**Energy**
- Capacity ≈ 100 player inputs ± 20% (stage 0 a bit less, later stages more).
- Cost per player input: 1 (a `PASS` costs 0.5). Something new or surprising costs up to 1.5
  (learning is tiring).
- **Sleepy below 25% energy:** each turn has a rising chance to fall asleep. At 0 it falls asleep
  for sure.
- **Idle:** no player input for 2 min → it falls asleep, however tired it is.

**Sleep**
- `SLEEP` is written with its timestamp, even if it's calculated after the fact.
- Recovery rate: empty → full in **60 min**. Sleep length is proportional to tiredness.
- **Dream:** one dream emoji per recovered energy point, so 1 full sleep ≈ 100 dream emojis ≈
  **one every ~36 s** (`dreamRate`). Dream emojis aren't stored; they're regenerated from the seed.
- During sleep the mind **consolidates**: the sleep brain trains on the session (plus a sample of
  older history), habits are checked (§6), rules and complexity are recalculated (§11), and the
  stage may change (§5). Short-term memory fades ×0.5.
- **Waking:** a rested creature only wakes up **while the app is open**, at a random moment
  (usually 2–20 s). Its first move is either `WAIT` or an emoji to start an exchange.
  - App closed when it becomes rested → it "sleeps in". When you open the app, you see a quick
    fast-forward of the dream; it keeps sleeping a moment, then wakes.
  - Not rested yet → you see it sleeping, with Zs showing how long it still needs.
  - **Manual waking:** sending an emoji wakes it (→ Q30 whether also when still tired).

**While the app is closed:** on opening, the app checks the time since the last token, writes the
missing `SLEEP` (last activity + 2 min, or right after the last turn if it was out of energy),
computes recovery, and replays the dream. `WAKE` is only written once it actually wakes up while
the app is open. Cost: one sleep-brain training run (< 1 s) plus the
fast-forward animation.

**Dev tool:** a **time-warp** slider (×1 … ×600) so we don't have to wait an hour.

---

## 11. Rules, narratives, complexity

**In plain words:** a pattern that is confident and repeated often enough becomes a **rule**. Rules
that link into each other form **narratives**. Complexity counts all of that, and longer and more
varied patterns count more.

- **Rule:** a pattern (from the phrasebook or a structural one from the echo voice) with ≥ 60%
  probability and ≥ `repsToLearn` occurrences.
- **Narrative:** a chain of ≥ 3 tokens where every step follows from a rule. **Bundle:** narratives
  with the same start and different branches (variants).
- **Complexity** = Σ rules × their length + Σ narratives × length + bonus per variant + bonus per
  habit.
- When you `PASS`, it prefers to continue a narrative (narrating).
- Computed during sleep. It drives the growth stage (§5), and later the appearance.

---

## 12. Starting parameters

| Parameter | Start | Meaning |
|---|---|---|
| `repsToLearn` | 3 | repetitions until a pattern is confident (the main learning-speed knob) |
| `maxCertainty` | 0.85 | upper limit for any prediction: room for surprise |
| `temperature` | 0.8 (→ 1.5 bored, → 0.5 confused) | chaos |
| `noveltyBase` | 3% (→ 30% bored) | trying something new |
| `questionBoost` | ×3 | weight of answers to questions |
| `habitAfterSleeps` | 2 | sleeps a pattern must survive to become a habit |
| `shortTermFade` | ×0.5 per sleep | fading of short-term memory (Q17) |
| `capacity` | 100 inputs ± 20% | player inputs until tired |
| `sleepyBelow` | 25% | when random nodding-off can start |
| `idleSleep` | 2 min | falls asleep when left alone |
| `fullRecovery` | 60 min | empty → full |
| `dreamRate` | ~36 s/emoji | follows from capacity / fullRecovery |
| `stageThresholds` | to find in experiments | complexity per growth stage |
| `emotionFade` | ~5 turns | how fast an emotion fades |
| `uneaseBand` | to tune | the "sweet spot" of novelty between bored and confused |
| `contagion` | 0.3 | how strongly received emojis/patterns trigger emotions |
| `expressiveness` | 0.2 | how much its emotion biases its emoji choice |
| `wakeDelay` | 2–20 s | random waking while app is open and rested |
| `nearbyNovelty` | 80% | new emojis from the current palette section |
| sleep brain | embedding 16, hidden 48, context ≤ 8 | size of the neural net |

---

## 13. Code architecture (as built, prototype 0.1)

Plain JavaScript ES modules, no build step (D32).

```
index.html, manifest.json
src/
  main.js            time loop (with fast-forward clock), player input, game view
  style.css
  data/emoji.js      generated: 1,906 emojis in iOS sections (scripts/build_emoji.py)
  core/              pure logic, no DOM: runs in the browser and headless
    params.js        all tunable numbers, growth stages, slider list
    tokens.js        WAIT / PASS / SLEEP / WAKE / BIRTH
    rng.js           seeded random numbers
    emojiIndex.js    emoji sections/subgroups + picking new emojis nearby (novelty)
    emotions.js      5 emotions + tiredness, emotion profiles
    voices/
      phrasebook.js  exact patterns, up to 8 tokens, fading
      echo.js        structural copy-from-k-back patterns
      dejavu.js      last time this situation happened, anywhere in the history
      gut.js         tiny neural net (sleep brain), hand-written backprop
    mind.js          observe(entry) / predict() / decide(), emotions, sleep & consolidation, growth
  ui/
    palette.js       iOS-style emoji keyboard + pass
    panel.js         test panel
    store.js         save/load (localStorage), export/import
scripts/build_emoji.py   regenerates src/data/emoji.js from Unicode emoji-test.txt
tests/run.js             headless tests (determinism, learning, sleep timing, scripted players)
```

**Key principle:** `mind = replay(history)`. `Mind.observe(entry)` is the only way state changes,
both live and on reload. `decide()` picks a move; the app writes it to the history and observes it.
No snapshot cache yet: the whole history is replayed on load (~0.1 s for 1,500 turns).

## 14. The palette

**In plain words:** it looks and is ordered like the iOS emoji keyboard. The creature quietly knows
which section each emoji belongs to, and uses that when it tries new emojis.

- Sections in iOS order: **Frequently Used** · Smileys & People · Animals & Nature · Food & Drink ·
  Activity · Travel & Places · Objects · Symbols · Flags. Horizontal scrolling, section tabs at the
  bottom, plus a `PASS` button.
- **Data:** the official Unicode emoji list and order, grouped into the iOS sections. Apple moves a
  few emojis compared to Unicode (e.g. clothing appears under Smileys & People). We copy the known
  differences, so it's very close to iOS but not guaranteed identical.
- Emojis the device can't render (too new for its system font) are hidden automatically.
- **No skin tones** (only the default variants).
- **Frequently Used:** your most used emojis (count → Q9).
- **For the creature:** each emoji's section and subgroup (e.g. "fruit") is known. The novelty voice picks
  new emojis from the current subgroup/section 80% of the time, anywhere 20%. This doesn't give
  emojis a meaning, only a neighbourhood.

---

## 15. Interface: minimal game screen + test panel

**In plain words:** the game screen stays minimal. Everything for testing lives in a separate
**test panel** that you open and close. The panel uses plain text and simple numbers, not fancy
gauges.

**Game screen** (D28)
- placeholder creature, its emoji above it, one small text label (§7), the palette with a pass
  button. Nothing else.
- one small button to open the test panel.

**Test panel: look inside**
- **Now:** the 5 emotions + tiredness as numbers, energy, growth stage, complexity.
- **Why it said that:** for its last reply, which voice won, the top 3 guesses with probabilities,
  and whether it was a habit, a variation, an invention or a question.
- **What it has learned:** current habits and rules (most solid first), and for each emotion the
  emojis/patterns most associated with it.
- **History:** the conversation as a scrollable strip, with sleep/wake marked.

**Test panel: control**
- **Time:** fast-forward (clock speed ×1 … ×600), "sleep now", "wake now".
- **Creature:** reset (new creature), export, import.
- **A few key settings** as sliders (→ Q35): learning speed (`repsToLearn`), chaos
  (`temperature`), novelty, capacity. Everything else stays in `params.ts`.
- **Re-run:** rebuild the current creature's mind from its history with the current settings, to
  compare settings on the same conversation.

---

## 16. Implementation notes (prototype 0.1)

Things the code does that this text doesn't spell out, or does differently:
- **Phrasebook from birth:** a newborn already uses exact patterns, but only with 1 token of
  context. The phrasebook always *records* up to 8 tokens, so a creature that grows "discovers"
  longer patterns it had already seen.
- **Rules ignore redundant long patterns:** 🐶🌞→🌻 doesn't count if 🌞→🌻 already exists. This
  keeps complexity meaningful.
- **Growth: max one stage per sleep.** Stage thresholds: complexity 6 / 18 / 40 / 80.
- **Habits** = rules found in ≥ 2 consecutive sleeps. They're forgotten after 3 sleeps without
  confirmation.
- **Surprise** = −log(probability of your emoji) scaled to 0..1. A completely new emoji is always
  maximum surprise.
- **Laughter** (part of joy): the phrasebook didn't expect it, but another voice did.
- **Clueless moves:** when the council isn't confident, the leftover probability goes to wait
  (listen), echo your last emoji, or babble a known emoji. That's why a newborn mostly waits and
  echoes.
- **Idle sleep** is written retroactively at "last event + 2 min". A rested creature only wakes while
  the app is open, 2–20 s after the dream has caught up. Fast-forward resets to ×1 on waking.
- **Dream tokens** are sampled from the sleep brain during consolidation and regenerated on replay.
  Before the first training they're empty (only Zs).
- **No snapshot cache** and no service worker yet.

### Changes in prototype 0.2 (2026-11-23, after first manual play)

- **Small creatures tire quickly:** stage capacity factors are 0.35 / 0.55 / 0.75 / 1.0 / 1.25 ×
  `capacity` (stage 0 ≈ 35 inputs).
- **Early impulses:** small creatures are more chaotic and impulsive. Per stage: novelty ×4 → ×1,
  extra chaos +0.5 → 0, more random babbling when clueless.
- **Inborn character ("seed"):** at birth it gets 6 emojis from 3 palette neighbourhoods (no flags
  or people). They're stored in the `BIRTH` entry, so the history still fully describes it. Effects:
  - known from birth
  - a share of every choice goes to them (35% at stage 0 → 5% at stage 4)
  - babbling and new emojis lean toward their neighbourhoods

  Nature fades as nurture grows.
- **Sleep:** energy recovers **steadily** while sleeping (empty → full in `fullRecoveryMin` = 60 min,
  whatever the size). Dreaming is **fast and independent** of recovery: one dream emoji every
  `dreamIntervalSec` = 3 s (≈ 1,200 per full sleep). When energy is full it wakes up by itself
  2–20 real seconds later while the app is open. (Bug fix: the wake delay used to scale with
  fast-forward, which could push waking hours away.)
- **Test panel:** big energy bar (green / yellow / red, striped while recovering), live energy while
  asleep, character shown.
- **Palette:** search field ("Search Emoji", by name and subgroup), emojis can't be text-selected,
  smoother scrolling (emojis rendered in blocks that are only painted when on screen), and the
  mouse wheel scrolls sideways.

---

## 17. Elemental signs & new input panel (v5, implemented in prototype 0.3)

**The change in plain words:** five emojis now have a **built-in meaning**, for both you and the
creature. Every other emoji still starts meaningless and gets its meaning by being used **around**
these five. They're the creature's first words, and they anchor everything it learns about good,
bad and affection.

| Sign | Meaning | When **you** send it | When **it** sends it |
|---|---|---|---|
| ✅ | yes | "that was right": its last move **sticks** strongly in that situation; joy | it recognises something: you did what it confidently expected |
| ❌ | no | "not that": its last move is **weakened** strongly, and it **tries again right away** with something else (then you can ✅ the right one) | it rejects: you broke a strong habit, or sent something it associates with bad moments |
| ❤️ | affection | warmth: strong joy, calms sadness/anger/unease, mild reinforcement | it's very happy, or greets you after waking when you come back often |
| ❓ | question | "what comes next? / show me": it answers with its **best guess** for what follows (low chaos), a way to test what it knows | it asks "what comes after that?" about your last emoji: your answer counts **×3** |
| ⏳ | passing time | you pass, and it continues on its own (narrating) | it waits and listens: you can say two things in a row |

**How the elementals shape learning**
- **Teaching loops get simple:**
  - it says X, you ✅ → X sticks
  - it says X, you ❌ → it immediately retries with something else; you ✅ the right one → that sticks
  - it ❓, you answer → triple lesson
  - you ❓ → it shows its best guess (testing)
- **Grounding of emotions:** each elemental has a fixed emotion profile (✅ ❤️ → joy, ❌ → sadness,
  ❓ → curiosity, ⏳ → calm/boredom). Ordinary emojis and patterns that keep appearing around them
  take on those emotions over time (conditioning). This replaces the vague "adoption"/mood grounding
  of earlier versions as the main source of good/bad.
- When you send ✅ / ❌ / ❤️, the creature's last emoji and the pattern it completed are
  associated **directly** with that emotion.
- **Elementals are "meta" signs:** they're skipped when looking for content patterns (like
  WAIT/PASS before). "🌞 ✅ 🌻" teaches 🌞→🌻, not 🌞→✅. The creature uses them by their built-in
  rules, not by imitation.
- **Inborn:** all five are known from birth, even by a newborn (part of its first vocabulary,
  besides its character).

**What it replaces**
- `WAIT` / `PASS` tokens → ⏳ (from either side).
- The question marker and waiting marker → the ❓ and ⏳ emojis themselves. The emotion text label
  stays.
- Questions (and therefore ❓) become available earlier: from stage 1 instead of stage 2 (→ Q41).

**New input panel** (replaces search, categories, tabs and the pass button)
```
┌──────────── frequently used ───────────┬──────────── random selection ──────────┐
│ ✅ ❌ ❤️ ❓ ⏳  (pinned from the start)  │ 25 random emojis, reshuffled after     │
│ + your most used emojis                 │ every emoji you send                   │
│ 5 × 5 = 25 max                          │ 5 × 5 = 25                             │
└─────────────────────────────────────────┴────────────────────────────────────────┘
```
- Left: the 5 elementals from the start, then your most used emojis (max 25 in total).
- Right: 25 random emojis. After you send one, the selection is reshuffled. Anything you use moves
  over to "frequently used".
- Proposal: the random half always includes the creature's **latest new emoji(s)**, so you can pick
  up what it introduces (→ Q40).
- Smaller cells (~36 px) so both halves fit side by side in the phone frame.

### As built (prototype 0.3)

- **The point of the signs:** teaching by **positive reinforcement** (✅, ❤️), **negative
  reinforcement** (❌), and asking it to **elaborate** (❓).
- **✅ vs ❤️:** ✅ only confirms that something was correct (strong lesson `yesWeight` 2, a little
  joy). ❤️ also conveys affection (softer lesson `loveWeight` 1, strong joy, calms sadness, anger and
  unease).
- ✅ ❤️ ❌ refer to **everything it said since your last emoji** (one move, or a whole
  elaboration/narration).
- **❌** weakens those moves (`noWeight` 1.5). Its next move is a **retry** that avoids them: another
  known option, or a new emoji.
- **Your ❓ = elaborate (Q42):** it continues the current context with its best guesses, one emoji
  per beat (it keeps the turn), up to `elabDepth` + stage emojis (2 at stage 0 → 6 at stage 4). It
  stops early when it's less than 20% sure: with ⏳, or with ❓ ("I don't know, you tell me") if it
  couldn't even make the first step.
- **Its ❓** (from stage 1): "what comes after that?" when it's curious and unsure. Your answer counts
  ×3.
- **Its reactions:** ✅ when you did what it confidently expected (30%), ❌ when you broke a confident
  expectation or sent an emoji it associates with sadness/anger (40%), ❤️ when joy ≥ 0.6 (20%).
- **Keyboard:**
  - the 5 signs are pinned, plus your 20 most used emojis
  - the random half reshuffles after every input and always contains its 3 latest emojis
  - when it uses an emoji you can't see, it replaces a random slot
- Old saves: `⟨wait⟩` / `⟨pass⟩` are read as ⏳.

- **No flags** (D43): the emoji data has no flag emojis at all.
- **💬 replaces ⏳** as the wait/pass sign (D44). Everywhere §17 says ⏳, read 💬. Saves made before 0.4 (format 1) have their ⏳ converted to 💬 on load.
- **Test panel, "learned" section (0.5):**
  - Short-term rules are shown **live**, grouped by context length. Longer rules appear only where the
    context changes the answer.
  - **Known sequences:** longer chains it can continue, including ones that agree with shorter rules.
  - **How far back it looks** (stage).
  - **Long-term memory:** habits with strength, narratives (last sleep), sleep-brain size, déjà-vu
    situations.
  - Rule finding is shared between sleep and panel: `Mind.findRules()`.
