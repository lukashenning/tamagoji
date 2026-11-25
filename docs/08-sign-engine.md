# 08 · The sign engine (branch `experiment`, engine 1.0)

A new engine built from the user's sketch (2026-11-24). It **replaces** the simple core of
`docs/07`; controls, keyboard, sleep/energy, melodies and visuals stay. Not compatible with
creatures from `main` (separate browser storage).

## Signs

- **Real signs**: every ordinary emoji. Only they form patterns.
- **Special signs**: ✅ (✓), ❌ (✗) and ❓ (☐, "wait / your turn"; ❓ and ☐ are the same sign).
  They are never part of a pattern: context skips over them, nothing is linked *to* them.

## Learning: associations on 4 levels

When **you** use a real sign `s`, the creature strengthens its links from what came before, on four
levels (both speakers' real signs count as context; special signs are skipped):

| level | link |
|---|---|
| 1 | `x → s` |
| 2 | `a x → s` |
| 3 | `b a x → s` |
| 4 | `c b a x → s` |

**Special signs cut chains** (D68): levels 2–4 only change if no special sign (✓ ✗ ☐, yours or its)
came anywhere between the signs of that chain; level 1 always changes. When you enter the final D,
`Z A B C D` strengthens `ZABC→D`, `ABC→D`, `BC→D` and `C→D`, but `Z A ✗ B C D` only `BC→D` and
`C→D`. This holds for your signs, ✓ / ✗ (yours and its) and dreams. Its expectation still reads
across special signs. A take-back removes the rejected sign together with the ✗ after it, so the
retried sign joins the chain before it.

Each repeat adds **+1** to that link. Its own signs are learned only through ✓ / ✗ (and a little
in dreams).

**Slow fading** (D67): while it's awake, every link drifts **0.03 towards 0 per turn of yours** (any
input of yours counts as a turn). A +3 or −3 link is back at 0 after about 100 turns; a +30 link
after about 1000. Not while it sleeps. Slider "fading".

## Expecting the next sign: votes

For the current context, each level votes for the signs that followed that context:

- **vote = level weight × strength(link)**, strength = log₂(1 + w) (negative links vote against:
  −log₂(1 + |w|)). Repeats keep adding, with diminishing returns (1 → 1, 3 → 2, 7 → 3, 15 → 4).
- **Level weights grow ×1.5 per level**: 1, 1.5, 2.25, 3.4 (slider; D69, was ×2). A sign learned
  after a whole 4-sign chain B U E A (so on all four levels) against one only linked to A, same
  strength 1: about 10 : 1 in its expectation (was ~100 : 1). The longer the matching context, the
  more it says, but not overwhelmingly.
- The votes per sign are added up. Signs with a positive total are its **expectations**; their
  chances come from a softmax (temperature "chaos", default 3): clearly more votes → much likelier,
  never certain.

## What it answers (its turn)

1. **Tired?** Falls asleep at no energy; can nod off below 25%.
2. **React with its own ✓ / ✗** (only right after your real sign):
   - ✓ 35% if your sign had been at least 40% expected (slider),
   - ✗ 25% if it expected something else at ≥ 60% and your sign was below 10%,
   - otherwise 2% (✓ if your sign was among its expectations, else ✗).
   Its ✓ / ✗ strengthens (+3) or weakens (−3) the link of your sign to what came before it, like yours.
3. **☐ (wait)**: 5% base, rising to 25% when its top two expectations are within 5 points.
4. **Surprise**: a random emoji from this hour's keyboard set (16 emojis; unused ones first). Chance:
   - always at least **10%**,
   - **+ repetition**: for a pattern of length k (1–4) repeating at the end of the real signs
     (☐ ✓ ✗ ignored), m = how many signs at the end repeat the sign k places earlier.
     Pressure = max over k of m / k² (more repeats → more, shorter patterns → more), × 0.3.
     Examples: `a a` +30%, `a a a` +60%, `a b a` +8%, `a b a b` +15%, `a b a b a b` +30%,
     `a b c a b c` +10%, `abcd abcd abcd` +15% (total capped at 70%).
   - **+ waiting**: from your 4th ☐ in a row, +5% per further ☐ (max +40%), so it gets playful,
   - at most 70% in total.
5. **Otherwise its expectation**; with no expectation at all (e.g. after a sign it has never seen
   followed): mostly one of its **familiar signs**, its seats (its top signs; for a newborn its 6
   random seed emojis), by use, so it finds its way back into its patterns; sometimes a surprise.

When you press ☐ again and again, it simply chains predictions, like dreaming, while awake.

## ✓ and ✗

- Your ✓ / ✗ acts on the **last real sign** (skipping special signs) and its links on all 4
  levels: ✓ **+3**, ✗ **−3** (links can go negative).
- Right after **its** ✓ / ✗: your ✗ **inverts** that effect (+3 becomes −3), your ✓ applies it
  **once more**.
- **"Not that, this"**: `A ✗ B ✓` takes **A back**: A stays in the history but becomes invisible
  as context (like ☐) and no longer counts as its output. So B's ✓ strengthens B's links to the
  signs *before* A. `A ✗ B ✗ C ✓` takes back A and B. A keeps its ✗ weakening. Anything else in
  between (your real sign or ☐, its ☐ or reaction) ends this.

## Sleep

- **Left alone** it falls asleep after 2 min × its energy: at 90% after ~1:50, at 50% after 1 min,
  at 25% after 30 s (never sooner than 10 s). **At 100% energy it doesn't fall asleep.**
- **Mid-conversation** it can nod off below 40% energy, the more tired the likelier: per turn of its
  50% × ((40% − energy) / 40%)²: at 30% 3%, at 20% 13%, at 10% 28%; at 0% it falls asleep.
- **Waking by itself**: once rested (100%), 1–4 s later (while the app is open).
- When it **wakes up by itself**, it greets you with a **surprise** sign (from this hour's set).
  Woken by you, it waits for your sign.
- **While it sleeps** the keyboard slides away (the stage grows into its place) and slides back when it
  wakes. Any tap or swipe on the stage wakes it, always as your ❓ (D76). Woken with little energy, it
  soon nods off again by itself (the nod-off chance and idle time depend on energy).
- **Sleep clouds**: large ☁️ (48–120 px) of different sizes and opacity spread wide over the lower area, barely moving
  below it while it sleeps (no "sleeping" label any more), up to 14
  when it's empty, fewer as its energy comes back (one fades out at a time), none when nearly rested.

## Dreams

It answers itself with the same rules (votes, repetition surprise), without ✓ ✗ ☐. On waking, the
dreamed signs it got to are learned at **+0.1** each (sleep consolidates). Dreams don't count as
its outputs.

**Proximity (D70).** Dreams also link each sign to its neighbours the other way round, at **+0.04**
(`proximityWeight`, slider). In the dream C A B D E S G D, the D after B gets, besides the usual
B → D and A B → D: after E comes D (one after), after S E comes D (two after, read backwards) and
after B E comes D (around it). Never a sign to itself. So repeated A → B also teaches a little B → A.
Check: `jsc -m tests/proximity.js` (40 creatures × 1500 steps per weight). At 0.04 its top choice
after a learned chain is unchanged (98%), the next sign after the chain is expected 94% (was 98%),
and after a single chain sign the previous one is now expected 18% (was 0%), as its top choice 6%.
At 0.1 the sequence learning starts to suffer (next after one sign 68%, was 96%).

The dream emojis rising above it come out at the 1× dream pace (one per 3 real seconds, rising in
9 s), also when time runs faster; then each shows the dream sign of that moment.
Each one also plays its melody as a very quiet glockenspiel in a roomy space (a short, soft reverb:
~1.6 s tail, high tones damped; the notes ring ~0.5 s, so they don't blur into each other), slowed down so it lasts exactly until the
next dream emoji appears (3 s instead of 0.5 s). While it sleeps, a small speaker button at the top
right (below the logo) mutes / unmutes these dream sounds (it cuts off their whole audio channel at once, ringing notes and
reverb included). The channel is open only while it sleeps and you haven't muted it: waking up cuts it
off at once (when you wake it: the moment your finger touches the stage), falling asleep opens it again unless you muted the dreams; the choice is remembered on the device.

## Your side: the corner row and gestures

Bottom left (growing to the right): the real signs of the current exchange, yours and its (its dimmer), since your last
✓ or ✗; your ❓ and its own specials don't clear the row (display only: for learning, ❓ still cuts chains); while you
answer with ✗ (also several times), it keeps showing what came before the sign your first ✗ rejected,
plus its newest try, until you send something other than ✗ (the "not that, this" context); it starts fresh after sleep. At most the last 5.

✓ ✗ ❓ are not on the keyboard (both halves are 16 emojis); you give them only with gestures.
On the stage: **tap the creature = ✓**, **tap around it = ❓**, **swipe sideways anywhere on the stage = ✗**.
On phones the app stays put (no dragging, rubber-banding or pull-to-refresh).
Your ✓ ✗ ❓ (also from the keyboard) play their melodies an octave below its voice, in one steady,
soft, hollow sound of your own (`PLAYER_VOICE`).

**Layout.** On phones and tablets (touch, no mouse) and in windows narrower than 700 px, only the game
is shown, filling the whole screen; the keys grow with the screen (8 across, keyboard at most ~45% of
the height, 34–84 px). On desktop, **Escape** switches between the game alone (whole window) and
game + lab panel.

**Logo.** "TAMAGOJI" across the top of the game view; tapping it asks whether to start over with a new
creature (the lab panel's reset button does it right away).

## Complexity (D75)

Measured on its dreams (what it produces on its own). After a dream in which it learned at least
**700** signs (about 35 min of sleep; shorter dreams don't change it), the last 700 of them are measured
(`src/core/complexity.js`):

- **known (K)**: different signs that appear at least 3 times *and* at least once come right where they
  usually come (after a sign they usually follow). Surprise signs that happen to recur don't count.
- **order (O, 0–100%)**: how often the next sign could have been guessed from what usually follows the
  previous one elsewhere in those 700 signs (each step judged without itself, so a sign seen once can
  never look ordered).
- **complexity = K × O**: roughly "the number of signs it uses in an orderly way".

Checks: a 4-sign loop → 4 (4 × 100%); random babbling from 60 signs → 0.1; 40 signs in 8 chains with
10% surprises → 20 (36 × 56%). Simulated play (12-sign player language): 3–10 (≈ 11 known × 70%).
Shown in the panel (association memory) with the earlier values; stored per measurement, rebuilt from
the history like everything else. Not used for anything else yet.

## Top 7 → parts → look and voice

- Its signs are ranked by how often it used them in its **last 1000 outputs** (awake real signs,
  minus taken-back ones; ties → the more recently used).
- The top 7 drive the **parts by rank** (D77): 1st → eyes, 2nd → hat, 3rd → mouth, 4th → legs,
  5th → arms, 6th → nose, 7th → object. Its level (from complexity) decides how many are shown.
  Each sign has its own **move** (which variant each part shows when it says that sign). Recomputed
  at birth and after each sleep. Details: **docs/09-creature-art.md**.
- **Voice**: a blend of the 7 part signs' synth settings, weighted by their usage.

## Not in this engine

Complexity score, ❓-streak rules, special retry rule, loop avoidance,
pattern strength rankings (all `main`, docs/07). Growth measurement comes later.
