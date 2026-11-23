# 07 — The simple core (prototype 0.6, updated 0.7–0.10)

> **Current design** (2026-11-23). Replaces the complex systems of v0.2–0.5 (emotions, growth stages,
> habits, fatigue, boredom, living character, council of voices, neural net). The old code is kept in
> `archive/v0.5/`; the older design docs (05, 06) describe that version.
>
> User decision: *"The system is too complex now. Take out the emotion system entirely. What should
> become much more robust is the next-token prediction based on recent tokens and patterns in the
> history. No stages. ✅ reinforces a token, its connection to the token before, and the recent
> sequence; ❌ counter-reinforces the same. Take the heart out of the inherent meaning. Keep sleep,
> but learning during sleep should simply be a string of next-token prediction based on the entire
> sequence until then, so it solidifies reinforced patterns in a natural way."*

## In plain words

The creature has **one memory**: what followed which sequence of emojis, over the whole
conversation. When it's its turn, it looks at the last few emojis (up to 6) and predicts what comes
next. A longer matching sequence wins if it's been seen often enough; otherwise shorter ones fill in.
Recent patterns count more, older ones slowly fade but are never forgotten abruptly.

## What it learns from

| event | what changes in its memory |
|---|---|
| **you send an emoji** | "after the recent sequence comes this emoji", +1 (×3 if it was the answer to its ❓) |
| **✅** | its **reaction**, i.e. everything it said since your last emoji: the link to the emoji it answered and to the sequence it answered, +2 *(0.7; in 0.6 also the emoji in general)* |
| **❌** | the same links **halved**, −0.5 more (one ❌ clearly lowers the chance even for a strong habit). Then it immediately tries something else |
| **sleep (dream)** | it dreams a string of next-token predictions continuing from the whole conversation. On waking, it learns from the part of the dream it got through (+0.01 per dreamed emoji). Patterns that are already strong come up more in the dream, so they solidify naturally. Woken early = learns less. |
| its own emojis | not learned by themselves, only through ✅ / ❌ and dreams |

## The built-in signs (three since 0.8)

| sign | from you | from it |
|---|---|---|
| ✅ | reinforce what it just said | it confirms: you did what it confidently expected |
| ❌ | counter-reinforce and take it back; it retries (a more surprising answer). **"Not that, this"**: a ✅ right after that retry links the new answer extra strongly to what came *before* the rejected emoji *(0.12, 0.13)* | it objects: you broke a confident expectation |
| ❓ | "your turn / what comes next?" (also: passing): **one** best guess, then it waits for you. Pressing ❓ again and again draws out a learned chain step by step, so you can ✅ longer chains *(0.11)*. Below 25% certainty it asks back ❓, and **several ❓ in a row** there make a surprise likelier: +35% per extra ❓ (2nd ≈ 35%, 3rd ≈ 70%, max 85%) | "I don't know / I'm listening" when it has no pattern. Your next emoji counts ×3 |

❤️ and 💬 are ordinary emojis now. *(0.8: 💬 (wait/pass) merged into ❓; old saves are converted.)*

## How it picks its emoji

1. You sent ❓? → if it knows how the recent sequence continues (its own emojis included), it follows
   that pattern, however many ❓ in a row (D59). Only if it doesn't know: ❓ back, or with several ❓
   in a row a surprise.
2. Out of energy / sleepy? → sleeps.
3. You said ❌? → it answers again what the rejected emoji answered (the sequence before it), never
   the rejected emoji, with a flatter choice (retryTemperature 1.6, so less tied to its most likely
   idea) and 30% a surprise from the hourly set (D64). Same situation, old vs new: 🎾 61% · 🌞 39%
   → 🎾 39% · 🌞 30% · surprise 32%.
   - **❌ takes it back** (0.13, D65): the rejected emoji(s) leave the conversation's sequence, as
     if never said. So they don't become the context of what follows and gain no patterns from it.
   - **"Not that, this":** if you then ✅, what it said since the ❌ is linked to what came before
     the rejected part with +4 instead of +2. So after 🐶 🦴 ❌ 🌞 ✅ it learns 🐶 → 🌞. Used once:
     the next ✅ is an ordinary ✅. Several ❌ in a row work the same ("not that either"). Your next
     ordinary emoji or sleep ends it.
4. Sometimes reacts with ✅ / ❌ (see above).
6. Otherwise **next-token prediction**, with:
   - **chaos** (temperature 0.8) and a certainty cap of 85%, so it's never fully predictable
   - **loop avoidance** *(0.9, for loops of any length)*: for each possible next emoji it counts how
     often the sequence it would complete already occurred among the last 20 emojis. Sequences of 3–6
     count from their first repeat; pairs from their second, because answering the same thing twice
     is consistency, not a loop. It also counts how often the emoji itself is among the last 12, beyond 2.
     That option then counts × e^(−0.7 × count). The freed share goes to a **surprise** (see below).
     The same rule runs **in dreams**, where the freed share goes to other emojis it knows, so dreams
     don't get stuck in loops either.
   - **surprise when repetitive** *(0.7)*: the more repetitive the recent conversation (repeated
     3-emoji sequences in the last 20, or one emoji dominating the last 12), the likelier a **surprise**:
     +70% × repetitiveness, at most 80%. A surprise is an emoji from the **current hourly keyboard
     set** ("16 Uhr"), one it hasn't used yet if possible (D56). The same goes for the loop-avoidance
     share and for surprises after several ❓.
   - **novelty** 4%: a new emoji, also from the current hourly keyboard set (D57). So every emoji it
     tries for the first time comes from there, except its seed character.
   - when it has **no matching pattern**: its general tendency (the emojis it uses most), asking ❓,
     echoing you, or its **seed character** (6 fixed emojis from birth, mostly relevant when new)

## Sleep and energy

Fixed capacity: ~80 of your inputs (≈ 6–8 min). Below 25% energy it can nod off. It falls asleep
after 2 min alone. Energy recovers in ~60 min. One dream emoji every 3 s (≈ 1,200 per full sleep).
It wakes by itself 2–20 s after it's rested while the app is open, or when you send an emoji
(groggy if early). While it sleeps, each dreamed emoji rises straight up from its head, growing as it goes (D61–D63). The rising speed follows the dream pace: dreams coming faster (e.g.
fast-forward) make all of them rise faster, slower dreams slow them down; about 3 are visible. A creature that knows nothing yet dreams nothing.

## Settings (test panel sliders)

learning speed (reps to learn) · chaos · novelty · dream learning · loop avoidance (0 = off) ·
surprise when repetitive. Everything else is in
`src/core/params.js`.

## Broad test (docs/simulations/broad-test.md)

| | v0.5 (complex) | 0.6 without loop avoidance | **0.6 with loop avoidance (0.3)** |
|---|---|---|---|
| teacher: replies match their language | 30–38% | 65–76% | **55–60%** |
| adapts to a new language (shifter) | 25–35% | 55–81% | **26% → 66%** within 5 days |
| its own moves repeating a recent sequence | – | 32–46% | **6–10%** |
| whole conversation: repeated sequences | 12–16% | 42–51% | **21–34%** (the rest is the player's own consistency) |
| new emojis per session | 2–4 | 6–11 | 4–7 |
| session length, devoted player | 6.6 min | 8.3 min | 7.7 min |

The loop-avoidance strength was chosen by comparing 1 (off), 0.5, 0.3 and 0.1. At 0.1 it almost
never repeats itself (2–5%), which costs recognisability. At 0.5 loops come back (15–23%).

### 0.7: ❓ one sign, ✅/❌ on the reaction, repetition → surprise

| | 0.6 (loop avoidance 0.3) | **0.7** |
|---|---|---|
| teacher: replies match their language | 55–60% | **52–69%** |
| shifter after switching | 26% → 66% | **23% → ~57%**, old answers fade to 0–8% |
| its own moves repeating a recent sequence | 6–10% | **3–8%** |
| whole conversation: repeated sequences | 21–34% | **8–15%** |
| new emojis per session (teacher / devoted / mirror) | 4–7 | **9–12 / ~16 / ~17** (slider "surprise when repetitive") |
| session length, devoted player | 7.7 min | 7.0 min |

### 0.9: loop avoidance for loops of any length, also in dreams

| | 0.8 | **0.9** |
|---|---|---|
| teacher / devoted: replies match their language | 49–62% / 65–70% | **58–65% / 53–67%** |
| whole conversation: repeated sequences (teacher / devoted) | 12–14% / 15–16% | **12–13% / 15–18%** |
| its own moves repeating a recent sequence | 3–7% | **2–6%** |
| dream test: two-emoji loop steps | (unchecked; could loop endlessly) | **6%** |
| two-emoji loop (A B A B …) continued | – | 33% → **5%** |
| new emojis per session (teacher / devoted / mirror) | 11–14 / 18–21 / 15–16 | 11–14 / 16–19 / 16–18 |

## 0.10: keyboard, tiredness, storage, complexity, appearance basis, melodies

**Keyboard**
- Left, **"Zuletzt"**: the pinned signs ✅ ❌ ❓, then the most recently used emojis (yours *and*
  the creature's), newest first, no duplicates. So you can always answer with what it just said.
- Right, **"16 Uhr"** (the current full hour): 25 random emojis, the same for the whole hour, new at
  every full hour. Derived from the creature's seed + the hour, so a reload shows the same set.

**Too tired to wake.** While it sleeps, your sign wakes it only with a chance that depends on its
energy: 0% at ≤ 10%, rising steadily to 70% at 70%, 100% at full energy. If it doesn't wake, input
is blocked for 10 s and the keyboard header says **"Zu müde..."**. (At full energy it also wakes up
by itself, as before.)

**Storage.** If the save gets bigger than 10 MB (as stored: 2 bytes per character), or the browser
runs out of space, the oldest ~20% of the history is dropped, cut at the start of a session. The birth
entry (seed character) is kept. The creature is rebuilt from what's left, so it forgets its oldest
conversations; those had mostly faded from its memory anyway. The panel shows the save size.

**Complexity.** For every emoji, count the different **learned** patterns it takes part in:
- A learned pair counts for both emojis: after a comes b, ≥ 20% of what followed, faded weight
  ≥ 0.75 × reps to learn, and it **really happened ≥ 3×** or got ✅.
- A longer pattern counts only where the longer context changes the answer.

**Pattern strength** (0.13, D65): each learned pattern has a strength log₂(1 + weight / 4)
(weight 4 → 1, 12 → 2, 28 → 3, 60 → 4). "Most varied" and the look's blend rank emojis by their
summed strength. It grows with ✅ and shrinks with ❌, but every doubling adds the same, so a long-
established emoji can't run away: a new one that gets ✅ often while the old one gets ❌ overtakes
it gradually (test: 🐶 58 / 🐱 41 after 6 correction rounds, 58 / 61 after 12, 57 / 84 after 24).

Score = Σ log₂(1 + number of patterns per emoji). The "really happened" rule makes spam worthless: one
heavy event, like an answer to its ❓, doesn't count as a learned pattern. Test results:

| input | score |
|---|---|
| 300 random emojis | 0 |
| one repeated chain | 4.8 |
| a small varied language of 6 emojis | 32 |

Broad test over 10 days: chaotic player 0.4 → 1.3; structured players ~20 → 100–140; minimalist ~20.

**Appearance basis** (graphics come later; gradual since 0.11, D58). Four slots: **face,
extremities, hair/hat, object**, each with continuous traits **shape, size, texture** (0…1) and a
**hue**.
- Every emoji carries its own fixed trait values. The creature's traits are a **blend** of the 8
  emojis that weigh most in its learned patterns (shares by weight², so the strongest dominate).
  Before it has learned anything, its seed character is the blend.
- So a small change in its patterns moves the look a little, and a whole new "language" moves it a
  lot. (The blend is rescaled so a mix of many emojis varies as much as a single one would.)
- **Gradual:** recomputed only after sleep, moving **half the way** (lookFollow 0.5) to the new blend.
  A big change takes a few nights.
- Slots **fade in** with complexity: face from the start; extremities from 4 (full at 8), hair from
  10 (full at 20), object from 20 (full at 40).
- Test: a little more of the same → difference 0.03; a whole new language → 0.25 after one night,
  0.43 after three (0 = same, ~0.3+ = clearly different).

**Melodies.** Every symbol has its own 5-step melody: **500 ms** total, 100 ms per step. Only the
creature's signs play (yours are silent), and its reply comes at least 0.6 s after your sign.
- **Diatonic** (major scale): it starts on a note of the home chord, moves in small steps (at most
  a third), and ends on the home chord, mostly on the home note. Range: one octave above the home
  note, which lies between F#5 and F#6 (high and small-sounding).
- **Keys by category:** each palette section has a key (smileys C, animals F, food D, activity A,
  travel E♭, objects B♭, symbols E). A subgroup sits in that key or one fifth up/down, so similar
  emojis sound related.
- **Fixed signs** (C major): ✅ G6 · · · C7 (rising fourth), ❌ G6 · · · C6 (falling fifth),
  ❓ E6 · E6 · E6.
- **Voice** (`src/core/voice.js`, D60): one synth recipe with continuous settings, driven by the
  look's traits, so it changes as gradually as the look. A slot's influence fades in with its
  presence; until then the default (marimba-like) stays.

  | Slot | Sound |
  |---|---|
  | face shape / size / texture | rich (pure tone … many overtones) / struck (held … struck and ringing) / metal (wood … bell) |
  | extremities shape / size | note length (35% … 95% of a step) / hollow (fewer even overtones: chip-like) |
  | hair shape / size | glide into each note (scoop up 8% … drop down 8%) / breath (airy noise) |
  | object shape / size | wobble (vibrato, 0–3%) / chorus (a second, detuned voice) |

  Familiar instruments are regions of this space (archetypes: whistle, flute, organ, chip, marimba,
  bell, pluck, brass); the panel names the closest one. Newborns already differ (16 newborns: 5
  archetypes). Web Audio, no samples (`src/ui/sound.js`). The test panel shows the voice and has
  **▶ its voice** and **▶ archetypes** (its last sign in each archetype) to listen.
- Middle steps can be pauses; the first and last always sound. Same emoji, same melody.
  **Sound on/off** in the test panel, which also shows the last sign's notes.

## Code

```
src/core/memory.js   pattern memory (learn / predict / patterns), the heart of it
src/core/mind.js     observe the history, decide, sleep & dreams
src/core/params.js   all numbers
src/core/tokens.js   ✅ ❌ ❓ + system events
src/core/keyboard.js "Zuletzt" list and the hourly random set
src/core/melody.js   5-step diatonic melody per symbol (src/ui/sound.js plays it)
src/core/voice.js    the creature's voice, derived from its look
```
