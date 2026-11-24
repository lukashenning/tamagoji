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

Each repeat adds **+1** to that link. Its own signs are learned only through ✓ / ✗ (and a little
in dreams). No forgetting: links only change by use, ✓, ✗ and dreams.

## Expecting the next sign: votes

For the current context, each level votes for the signs that followed that context:

- **vote = level weight × strength(link)**, strength = log₂(1 + w) (negative links vote against:
  −log₂(1 + |w|)). Repeats keep adding, with diminishing returns (1 → 1, 3 → 2, 7 → 3, 15 → 4).
- **Level weights double**: 1, 2, 4, 8 (slider). A rare, specific 4-sign context seen twice
  (8 × 1.58 = 12.7) outvotes a 1-sign link seen 20 times (1 × 4.4). The longer the matching
  context, the more it says.
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
4. **Surprise**: a random emoji from this hour's keyboard set (unused ones first). Chance:
   - always at least **10%**,
   - **+ repetition**: for a pattern of length k (1–4) repeating at the end of the real signs
     (☐ ✓ ✗ ignored), m = how many signs at the end repeat the sign k places earlier.
     Pressure = max over k of m / k² (more repeats → more, shorter patterns → more), × 0.16.
     Examples: `a b a` +4%, `a b a b a b a b` +24%, `a b c a b c` +5%, `abcd abcd abcd` +8%,
     `a a a a` +48%.
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

Left alone for 2 minutes it falls asleep (also when its energy is still high: then it's a short nap,
at least ~3 min). When it wakes up, by itself or woken by you, it **waits for you** and says nothing.

## Dreams

It answers itself with the same rules (votes, repetition surprise), without ✓ ✗ ☐. On waking, the
dreamed signs it got to are learned at **+0.1** each (sleep consolidates). Dreams don't count as
its outputs.

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

Complexity score, memory fading, ❓-streak rules, special retry rule, loop avoidance,
pattern strength rankings (all `main`, docs/07). Growth measurement comes later.
