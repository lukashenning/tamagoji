# 09 · Creature art: parts, levels, moves, and the art workflow

The creature has no body: it is made of up to 7 **parts** that stack on one frame (D77).
Code: `src/core/look.js` (rules), `src/ui/creature.js` (drawing), `scripts/build_parts.py` (art).

## Parts and levels

| # | part | shown from level | driven by |
|---|---|---|---|
| 1 | 👀 eyes | 1 | its most used sign |
| 2 | 🎩 hat | 1 | 2nd most used |
| 3 | 👄 mouth | 1 | 3rd |
| 4 | 🦵 legs | 2 | 4th |
| 5 | 🦾 arms | 3 | 5th |
| 6 | 🐽 nose | 4 | 6th |
| 7 | 🎸 object | 5 | 7th (stands somewhere around it, outside its layout; see Motion) |

There are **5 levels** (D81). The looks of all 7 parts always come from the top 7 signs, whether a
part is shown yet or not.

- "Most used" = in its last 300 awake outputs (D99; was 1000). The parts are re-assigned at birth and after each
  sleep; until it has 7 top signs, its seed signs fill up.
- **Level** comes from complexity (docs/08), checked at each measurement; it grows or shrinks towards
  the level its complexity calls for by **at most one level per sleep** (D97):
  level 2 from complexity 6, level 3 from 10, level 4 from 15, level 5 from 19
  (`levelAt`; in simulation a consistent teacher reaches level 5 after about 2 days, D92). The lab panel can set a
  level directly (`level: auto 1 2 3 4 5`).

## Motion

- **Breathing**: all body parts swell together, one breath every 3.6 s (scale ±1.2%, rising
  0.6 px when breathing in), and each part also wobbles a tiny bit on its own (±0.6% scale, under a
  pixel of movement), with its own irregular rhythm.
- The **object** moves just as subtly. But when the creature says something (a sign or ✓ ✗ ❓), with
  a 33% chance (`objectMoveChance`) it glides (0.8 s) to another spot around the creature, never the same one twice in a row: right or
  left of it, right or left of its feet, right or left of its hat, or on its feet
  (`OBJECT_SPOTS` in `src/core/look.js`). The spot is picked with the creature's seed, so it is
  rebuilt from the history like everything else.
- Asleep, all motion runs at a bit over half speed. Movements are given for a 252 px wide creature and
  scale with it. With the system setting "reduce motion", nothing moves.
- Code: `animate()` in `src/ui/creature.js`, called every frame.

## Style and colour

Every emoji has one fixed **style + colour** per part, the same for every creature: the 1,633 emojis
are put in one fixed shuffled order; emoji number *i* gets style *i* mod *S* (*S* = how many styles
that part has) and colour number ⌊*i* / *S*⌋ of the 64 **gbc1** colours. With 26 styles per part,
26 × 64 = 1,664 combinations cover all emojis; with fewer styles, more emojis share a style.

## Variants, moves, poses

Each style has up to **6 variants**. Variant 1 is the default. Fixed meanings:

| part | variant | meaning |
|---|---|---|
| eyes | 2 | closed (always while it sleeps) |
| mouth | 2 | ✓ (whenever you or it give ✓) |
| mouth | 3 | ✗ (whenever you or it give ✗) |
| arms | 2 | ? (whenever you or it give ❓) |

A **move** = 7 digits 1–6, one variant per part (eyes, hat, mouth, legs, arms, nose, object). Every
sign it says has its own move, random the first time it says it. A digit beyond the variants of that
part's style shows variant 1; digits of parts not shown at its level have no effect. Fixed variants can
also come up in moves.

Your answer to its sign changes that sign's move (for the next time): **✓** keeps it, **✗** re-rolls
it, **anything else** changes one digit to another.

The **pose** (what is shown now):

| moment | pose |
|---|---|
| it says a sign | that sign's move, until its next sign (your real sign doesn't change it) |
| you or it give ✓ | 1121111 |
| you or it give ✗ | 1131111 |
| you or it give ❓ | 1111211 |
| asleep | 2111111 |
| woken up, newborn | 1111111 |

(The user's example "✓ → 1211111" put the mouth in position 2; with the part order above the mouth
is position 3, so ✓ is 1121111.)

## Drawing sheets (the user's format)

- A sheet holds **rows of 6 red boxes**: each row is **one style** of a part, the boxes are its
  **variants 1–6**, left to right. One sheet = one part (e.g. 5 eye styles), unless said otherwise.
- **Red** only marks the boxes, plus the labels around them (part name at the left of a row, variant
  number and a reminder above a box). Red is never part of the creature. It may also be used inside a
  box as an alignment guide (e.g. the default figure); it is ignored.
- **Dark blue** inside a box is the drawing. Its place inside the box is its place on the creature:
  all parts share the box as their frame and are stacked, back to front: legs, arms, eyes, nose,
  mouth, hat. The **object** is drawn the same way (filling its box is fine); in the game it is shown
  at half size to the creature's right (its frame starts at 74% of the creature's frame width), so it
  fits on a phone. The creature is shown 252 px wide.
- An **empty box** (no dark blue) = that variant doesn't exist → the game shows variant 1 instead.
  If variant 1 is empty, the row is skipped.
- Fixed variants (see above): eyes 2 closed, mouth 2 ✓, mouth 3 ✗, arms 2 ?.
- In the game every drawing becomes **one colour**: the sign's gbc1 colour. Colours too light for thin
  lines on the light background (30 of the 64) are drawn darker: scaled towards black until their
  contrast with the background is at least 2.5 : 1 (same hue, like the colour in shadow; cream → tan).
- **Detail**: the outlines are traced from the sheet, so a sharper sheet gives more exact curves (on a
  ~2000 px wide sheet a box is ~210–220 px). Sheets saved straight into the project folder (e.g.
  `art/incoming/`) at full resolution keep more detail than images pasted into the chat.

## Workflow (what happens when you send a sheet)

1. Claude saves the sheet and reads the row labels (which part each row is).
2. `python3 scripts/extract_parts.py <sheet> <part> --preview <preview.png>` (or `--rows eyes,hat,…`
   for mixed sheets):
   - finds the red boxes (hand-drawn lines are fine: each side is taken where its line mostly runs,
     overshoots and slight slants don't matter), groups them into rows, left to right;
   - takes the dark blue inside each box (grid lines, paper, red and grey writing are dropped),
     scales it to the **frame** (320 units on the longer side, the shape of the boxes; fixed by the
     first sheet in `art/parts/frame.json`, later sheets are scaled to the same frame). A box side is a
     long red line across the whole box, so labels next to boxes are never mistaken for sides; all
     boxes on a sheet are assumed to be the same size;
   - **traces the drawing into vector outlines** (`scripts/vectorize.py`): a light blur so outlines
     follow the strokes rather than the scan's pixel steps, marching-squares contours, simplified and
     joined by smooth curves; where a red guide line crosses the drawing, the ink is bridged across;
   - writes one SVG per variant to `art/parts/<part>/<NN>/<variant>.svg` (viewBox = the frame, one
     filled path; can be opened and edited in any vector program),
     continuing the style numbers, and keeps the sheet in `art/sheets/` (e.g. `eyes-2.webp`);
   - writes a preview of everything it extracted, which Claude checks (and can show you).
3. `python3 scripts/build_parts.py` collects the SVGs into what the game loads:
   `assets/parts/parts.json` (frame, and per part its styles with the path data of each variant).
   The game fills the paths in the sign's colour, sharp at any size and screen density.
4. Check in the game (lab panel: level buttons; the parts table shows style, colour, variant), then
   commit the sheet, the extracted images and the built files together.

Only the Python standard library and macOS's `sips` (for other image formats) are used.
Until a part has art, the game draws simple placeholder shapes for it, so everything can be tried
before the art exists.
