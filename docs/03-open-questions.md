# 03 — Open questions (Q&A tracker)

> Each question has an ID. When answered, add the answer here, move the resulting decision into
> [04-decisions.md](04-decisions.md), and mark the question ✅.

## Batch 1: foundations (answered 2026-11-23)

### ✅ Q1 · Turn structure
**Answer:** Strictly in turns (while awake): exactly one symbol each. The creature can also
**wait**: a blank output with a waiting marker. The player can also **pass** a turn instead of
sending an emoji.
→ D7

### ✅ Q2 · Where do good/bad come from?
**Answer:** Emojis have no inherent value. The **creature itself** has feelings and may *associate*
emojis with good or bad. Feelings are shown as **visual markers on the creature**, not as emojis.
Markers: **good, bad, question, sleeping, waiting**.
→ D8, D9

### ✅ Q3 · What does "continued correctly" mean when answering a question?
**Answer:** It always uses the answer to learn. It may also react positively or negatively (and/or
"with more signs") depending on whether it likes the answer: when it is surprised, or when it feels
confirmed. (The user isn't sure yet.)
→ D10 proposes a concrete feeling rule. See Q15, Q18.

### ✅ Q4 · Boredom and real time
**Answer:** It only sends emojis while the app is open. Boredom comes from **too little variety**
(patterns become too same-y). Then it **tries something new**.
→ D11

### ✅ Q5 · Cut-off sentence
**Answer:** Longer sequences add more complexity.
→ D12

### ✅ Q6 · Rebuildable cache next to the history
**Answer:** Yes. → D5 accepted.

### ✅ Q7 · PoC scope
**Answer:** OK. → D13

### ✅ Q8 · Technology
**Answer:** OK. → D3, D4 accepted.

## Batch 2: alignment on the system design (answered 2026-11-23)

### General feedback (2026-11-23)
- **De-emphasise** the "it reacts well/badly when contradicted or when you play along" game. It
  shouldn't feel important. The focus is on how it **learns behaviours**, **introduces new signs
  and interactions**, and **acts predictably or surprises**.
- Learning must go beyond "sign A → sign B": **larger patterns** should be taken into account to
  predict the next token.
- The player must be able to see behaviours **sticking over time**, while there's always a sense
  that things can **vary and change**, and aren't completely predictable.
- Learning speed ("are 3 repetitions enough?") must be **tunable** during development.
→ D16, D17, D18, D19

### ✅ Q15 · Feeling rule (superseded)
**Answer:** Superseded by the general feedback. Contradiction/confirmation is no longer a visible
mechanic. → D10 revised (see D20).

### ✅ Q16 · Who does it learn from?
**Answer:** Agreed: fully from the player, from its own moves only when reinforced. → D15 accepted.

### Q17 · Sleep hand-over (still open)
Not answered yet. Asked again in Batch 3.

### ✅ Q18 · "With more signs"
**Answer:** The *player* has no good/bad markers. The player communicates good/bad **with emojis**,
which the creature learns to understand as positive or negative. (The creature still shows its own
good/bad markers, D9.) → D20

### ✅ Q11 · Interaction during sleep
**Answer:** While it sleeps the player can't send symbols, only after it wakes up. It goes to bed
by itself: when tired (sometimes suddenly / randomly) or when nobody has interacted with it for a
while. This must also work while the app is closed: everything is computed retroactively and
quickly from the elapsed time when the app is opened.
Guidelines: a session ≈ **5 minutes ≈ 100 interactions** (fluctuating), **fully rested after ~1
hour**. This also sets the dream speed. → D21

### ✅ Q19 · First contact / progression
**Answer:** Yes. It should feel like a **progression**: primitive and simple at first, and as it
learns, patterns get more complex and involved. → D22

## Batch 3 (answered 2026-11-23)

### ✅ Q17 · Sleep hand-over
**Answer:** Go with the proposal: short-term memory fades (×0.5) at each sleep. → D23

### ✅ Q20 · What is "an interaction"?
**Answer:** An input from the player. Capacity ≈ 100 player inputs. → D21 refined

### ✅ Q21 · Positive/negative → emotions
**Answer:** Emojis, or rather **patterns** of emojis, become quietly associated over time with
**emotions**: joy, boredom, sadness, anger, playfulness, curiosity, inspiration, laughter,
exhaustion. **No simulated players for now.** Test manually first; bots maybe later. → D24, D25

### ✅ Q22 · Where new signs come from
**Answer:** Yes, emojis are quietly associated with sections. All emojis are available, shown in the
**same order and organisation as the iOS emoji keyboard**. → D26

### ✅ Q23 · Opening the app / waking
**Answer:** If it's well rested, it should **sometimes wake up while the app is open**, and then
either wait or send an emoji to start an exchange. → D27

## Batch 4 (answered 2026-11-23)

### General feedback (2026-11-23)
- Associations between emojis (and emoji **patterns**) and emotions are **important**. The
  situation-based "arises when" rules are good as well. Both are wanted. → D24 accepted
- **Building: keep the feature set and the interface as minimal and simple as possible.** No
  synthetic complexity, no gauges, no extra UI elements. Really minimal. → D28
- "Am I missing a basic emotion?" → see Q29.

### ✅ Q24 · How emotions are shown
**Answer:** b. For the PoC, a small **text label** with the strongest emotion. → D29

### ✅ Q25 · Emotion triggers
**Answer:** The "arises when" rules are good. → D24 accepted

### ✅ Q26 · Skin tones
**Answer:** Leave skin tones out. → D26 refined

### ✅ Q27 · Waking timing
**Answer:** OK, maybe even quicker. Also: the player can **wake it manually by sending an emoji**.
→ D27 refined (see Q30)

### ✅ Q28 · Testing tools
Superseded by "really minimal" (D28). Reduced proposal → Q31.

## Batch 5 (answered 2026-11-23)

### ✅ Q29 · Missing emotions? → reduce instead
**Answer:** Reduce the number. It's getting too complex. Cut down to the essentials:
joy/laughter/affection · confusion/boredom · sadness · anger/disgust · curiosity/surprise ·
exhaustion/tiredness. → D30

### ✅ Q31 · Testing tools
**Answer:** The test panel *is* a good idea. The user wants to **view relevant data**, **control**
things, **fast-forward** for testing, and **reset** a creature. (Minimal still applies to the game
screen.) → D31

### Q30 · Manual waking while tired (not answered yet, asked again in Batch 6)
### Q32 · Build order (not answered yet, asked again in Batch 6)

## Batch 6 (answered 2026-11-23)

- **Desktop:** the PoC is developed on desktop, so the game view and the test panel are shown side by
  side. → D31 refined
- ✅ **Q34:** boredom and confusion are "essentially one discrete emotion". → one emotion, label
  "uneasy" (D30). Internally it still notes whether it came from sameness or chaos, which only changes
  how it reacts.
- ✅ **Q32 · Build order:** all systems are interconnected, so build them **together**, not in steps.
  → built as one prototype (D32)
- Q30, Q33, Q35 weren't answered explicitly. The proposals were built as defaults: manual waking
  works any time (groggy if tired); five emotions + tiredness; four sliders.

## Open (from playing the prototype)

- **Q36**: Tune the starting values by playing: learning speed, chaos, novelty, capacity, growth
  thresholds, emotion triggers.
- **Q37**: Does "uneasy" read well as a label, or should it say "bored"/"confused" depending on the
  cause?

## Later

- **Q9**: How many "frequently used" slots? (Organisation settled by D26, skin tones → Q26.)
- **Q12**: Can a creature "die" or reset? Several creatures per player?
- **Q14**: Pruning old history if the size limit is ever reached (would take years).

## Batch 7: elemental signs (see 05 §17)

**User decision (2026-11-23):** five emojis have inherent meaning: ❌ no · ❤️ affection · ✅ yes ·
❓ question · ⏳ passing (replaces "pass"). They're in "frequently used" from the start. The input
panel is redone: left half = frequently used (max 25), right half = 25 random emojis, reshuffled after
each interaction; used emojis move to frequently used. Search, categories and pass are dropped.
→ D39–D41

### Q39 · Are the five elementals pinned forever?
Should ✅ ❌ ❤️ ❓ ⏳ always stay in "frequently used" (leaving 20 slots for your own), or can they be
pushed out if you rarely use them?
- _Proposal_: pinned forever.

### Q40 · Can you always answer with its new emoji?
If the creature introduces 🍐 and 🍐 isn't in your 25 random emojis, you can't pick it up.
- _Proposal_: the random half always includes its latest new emoji(s). The rest is random.

### Q41 · Does it use ✅ ❌ ❤️ itself?
Proposal (05 §17): yes. ✅ when you did what it confidently expected, ❌ when you broke a strong
habit, ❤️ when it's very happy. These are occasional reactions, never more than ~30% of its moves.
Its ❓ questions start at stage 1.

### Q42 · Your ❓
Proposal: when you send ❓, it answers with its best guess for what comes next (low chaos): "show me
what you know". OK, or did you mean something else?

**Answers (2026-11-23):**
- ✅ Q39: the five signs are never pushed out (pinned).
- ✅ Q40: yes, the random half includes its newest emojis.
- ✅ Q41: yes, it uses ✅ ❌ ❤️ itself, and ❓ from stage 1.
- ✅ Q42: ❓ makes it guess **deeper than one symbol** if possible (elaborate a chain).
- Essential: the signs enable teaching by positive/negative reinforcement and by asking it to
  elaborate. ✅ = simply correct; ❤️ = correct **and** affection.
→ implemented in 0.3, D40, D42

## From the 7-day raising simulation (docs/simulations/raising-7days.md)

- **Q44**: The conversation collapses into one loop, and the creature never gets bored of it. Should
  boredom also react to its *own* repetitiveness?
- **Q45**: Growth is fast and then stuck (stage 3 on day 2, never 4). Retune the thresholds and the
  complexity formula?
- **Q46**: Joy is almost permanent with frequent ✅ / ❤️. Should praise wear off when repeated?
- **Q47**: Associations pick up base rates (frequent emojis look "tired"). Measure them relative to
  its average mood?
- **Q48**: The inborn character leaves no lasting trace. Give it a stronger or more persistent role?

## User goals for the system (2026-11-23, guiding v6)

Some consistency, and it can be moulded, but not too repetitive, with frequent surprises from the
creature. Full sessions shouldn't be much longer than 5–10 min when it's fully developed. A new stage
about every 3 sessions. Even fully developed, it adapts to new tendencies and absorbs new impulses
into its character. The initial character and early experiences persist somewhat, but are eventually
replaced or modified. → broad test + [06-proposals-v6.md](06-proposals-v6.md) (covers Q44–Q48)

## Simple core (0.6), see [07-simple-core.md](07-simple-core.md)

**User decision (2026-11-23):** strip it down: no emotions, no stages, ❤️ not built in, ✅ / ❌ on three
levels, robust next-token prediction from recent tokens and history patterns, keep sleep, and sleep
learning = dreaming next-token predictions over the whole sequence. → D46

- ✅ **Q49** (answer: add one simple fix → D47): Consistent players now get loops: 42–51% repeated sequences in the broad test, because
  it follows their language faithfully. Accept this, tune it with chaos/novelty, or add one simple
  counter-mechanism?
- Not answered, built as recommended: no neural net (pure pattern memory), and a fixed seed
  character.
