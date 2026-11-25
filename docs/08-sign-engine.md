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
- **"Zu müde..."**: your sign wakes it only with an energy-based chance (never below 10%, 70% at 70%,
  always at 100%). If it doesn't wake, the keyboard empties and **10 💤** appear on random keys. Tap
  them all away (or wait until it wakes by itself) to get the keyboard back.

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

## Your side: the corner row and gestures

Bottom left (growing to the right): the real signs of the current exchange, yours and its (its dimmer), since your last
✓ ✗ ❓; its own specials don't clear the row; it starts fresh after sleep. At most the last 5.

On the stage: **tap the creature = ✓**, **tap around it = ❓**, **swipe through it (left ↔ right) = ✗**.
Your ✓ ✗ ❓ (also from the keyboard) play their melodies an octave below its voice, in one steady,
soft, hollow sound of your own (`PLAYER_VOICE`).
Each also flashes the stage's background softly (full colour at once, held briefly, ~3.5 s fade): green for ✓, red for ✗, white for ❓.

## Top 6 → seats → look and voice

- Its signs are ranked by how often it used them in its **last 1000 outputs** (awake real signs,
  minus taken-back ones; ties → the more recently used).
- The top 6 hold **seats** (segments: body, eyes, mouth, limbs, crest, accessory). A seat belongs
  to its sign, not its rank: reordering inside the top 6 changes nothing. When a new sign dethrones
  one, it takes over that seat → that one segment changes style and colour. A newborn's seats are
  its seed signs. Recomputed at birth and after each sleep.
- **Voice**: a blend of the 6 seat signs' synth settings, weighted by their usage, so a new #6
  shifts it only slightly.

## Not in this engine

Complexity score, ❓-streak rules, special retry rule, loop avoidance,
pattern strength rankings (all `main`, docs/07). Growth measurement comes later.
