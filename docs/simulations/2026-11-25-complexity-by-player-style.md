# Complexity by player style (2026-11-25)

Simulation: `tests/styles.js` (engine 1.0, default settings unless noted). 10 creatures per style,
4 days, sessions at 8:00, 12:00, 17:00, 21:00. In a session the player plays until the creature nods
off (~65–110 player signs), then leaves it alone: it sleeps until rested (long dreams, so complexity is
measured after every session) and wakes by itself before the next session. Runs in ~20 s.

## Results (mean of 10 creatures, measured at the end of each day)

| style | day 1 | day 2 | day 3 | day 4 | known × order (day 4) |
|---|---|---|---|---|---|
| teacher, growing language, ✓/✗ (one new chain of 4 per session) | 10.3 | 10.1 | 11.1 | 8.9 | 13 × 70% |
| same, without ✓/✗ | 11.0 | 10.4 | 8.8 | 8.5 | 12 × 71% |
| small vocabulary (12 signs, ✓/✗) | 7.7 | 6.7 | 7.2 | 6.6 | 10 × 69% |
| shared signs (16 signs, chains overlap) | 5.7 | 4.9 | 5.1 | 5.5 | 8 × 69% |
| contradicting (reshuffles order daily) | 9.1 | 7.3 | 7.0 | 5.9 | 10 × 62% |
| random babbler (60 signs) | 7.2 | 9.4 | 10.5 | 10.1 | 19 × 52% |
| ❓ presser (85% ❓) | 4.4 | 3.5 | 3.5 | 3.3 | 5 × 62% |
| repeater (always the same sign) | 0.7 | 0.6 | 0.6 | 0.7 | 1 × 61% |
| teacher for 2 days, then only ❓ | 8.6 | 7.5 | 6.4 | 5.6 | 8 × 68% |
| teacher who wakes it after 10 min | never measured | | | | |

Levels: nobody reaches level 5 (21); the best single creatures reach ~15–16 (level 4).

## Predictions checked

| prediction | result |
|---|---|
| a growing, consistent language makes it grow | **no**: it plateaus at ~10 from the 4th session on |
| ✓/✗ speeds it up | **no** measurable effect |
| small vocabulary stagnates | yes (~7) |
| shared / ambiguous signs keep it low | yes (~5) |
| contradicting yourself makes it shrink | yes (9 → 6 over 4 days) |
| random babbling makes it shrink | **no**: it scores like the teacher (~10) |
| mostly ❓ stagnates / shrinks | yes (~3.5) |
| repetition keeps it minimal | yes (~1) |
| stopping teaching makes it shrink | yes (9 → 6) |
| never sleeping long freezes it | yes (never measured) |

## Why

1. **Fading caps its memory at ~15 links.** At bedtime, the links of the player's language still in
   memory (right follower > 0.5): 7/12, 9/15, 11/18, 13/21, 14/24, then flat at ~15 however much has been
   taught (57 links by day 4). A link used once (+1) fades in ~33 of your turns, a ✓'d one (+3) in ~100;
   a session has ~80 of your turns, so only what was used in about the last session survives.
2. **Even with less fading the dreams don't show more.** With fading 0.01 the memory keeps 29/57 links
   by day 4, but complexity stays ~10: the 700-sign dream keeps circling the strongest part of the
   memory, so `known` stays ~14–17.
3. **No fading at all breaks the dreams.** With fading 0, order collapses (teacher 15% → 7%, babbler
   4%): dream learning, dream proximity and surprises keep adding links that nothing removes, the
   memory becomes a tangle and the dreams diffuse. Fading is what keeps the dreams ordered.
4. **Babbling looks ordered.** A sign heard only a few times has only one or two (random) followers in
   memory, so the dream walk is fairly predictable (order ~50%), while many different signs recur
   (known ~19–33). The measure can't tell "sparse random memory" from "taught order".
