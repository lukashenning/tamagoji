# 09 · Creature art: parts, levels, moves, and the art workflow

The creature has no body: it is made of up to 7 **parts** that stack on one frame (D77).
Code: `src/core/look.js` (rules), `src/ui/creature.js` (drawing), `scripts/build_parts.py` (art).

## Parts and levels

| # | part | shown from level | driven by |
|---|---|---|---|
| 1 | 👀 eyes | 1 | its most used sign |
| 2 | 🎩 hat | 1 | 2nd most used |
| 3 | 👄 mouth | 2 | 3rd |
| 4 | 🦵 legs | 3 | 4th |
| 5 | 🦾 arms | 4 | 5th |
| 6 | 🐽 nose | 5 | 6th |
| 7 | 🎸 object | 6 | 7th (stands to its right, outside its layout) |

- "Most used" = in its last 1000 awake outputs. The parts are re-assigned at birth and after each
  sleep; until it has 7 top signs, its seed signs fill up.
- **Level** comes from complexity (docs/08), set again at each measurement, so it can grow or shrink:
  level 2 from complexity 3, level 3 from 6, level 4 from 10, level 5 from 15, level 6 from 21
  (`levelAt`, a first guess for about 2 days of play to level 6; to be tuned). The lab panel can set a
  level directly (`level: auto 1 2 3 4 5 6`).

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
- **Detail** is limited by the sheet: on a ~2000 px wide sheet a box is ~210–220 px. Sheets saved
  straight into the project folder (e.g. `art/incoming/`) at full resolution keep more detail than
  images pasted into the chat, which may arrive scaled down.

## Workflow (what happens when you send a sheet)

1. Claude saves the sheet and reads the row labels (which part each row is).
2. `python3 scripts/extract_parts.py <sheet> <part> --preview <preview.png>` (or `--rows eyes,hat,…`
   for mixed sheets):
   - finds the red boxes (hand-drawn lines are fine: each side is taken where its line mostly runs,
     overshoots and slight slants don't matter), groups them into rows, left to right;
   - takes the dark blue inside each box (grid lines, paper, red and grey writing are dropped),
     scales it to the **frame** (320 px on the longer side, the shape of the boxes; soft edges,
     smooth enlarging; fixed by the
     first sheet in `art/parts/frame.json`, later sheets are scaled to the same frame). A box side is a
     long red line across the whole box, so labels next to boxes are never mistaken for sides; all
     boxes on a sheet are assumed to be the same size;
   - writes monochrome images (white + transparency) to `art/parts/<part>/<NN>/<variant>.png`,
     continuing the style numbers, and keeps the sheet in `art/sheets/` (e.g. `eyes-2.webp`);
   - writes a preview of everything it extracted, which Claude checks (and can show you).
3. `python3 scripts/build_parts.py` builds what the game loads: `assets/parts/<part>.png` (one
   atlas per part: a row per style, 6 columns, white + transparency; a few KB each) and
   `assets/parts/manifest.json` (frame, styles with the variants they have, version).
4. Check in the game (lab panel: level buttons; the parts table shows style, colour, variant), then
   commit the sheet, the extracted images and the built files together.

Only the Python standard library and macOS's `sips` (for other image formats) are used.
Until a part has art, the game draws simple placeholder shapes for it, so everything can be tried
before the art exists.
