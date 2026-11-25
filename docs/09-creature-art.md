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

## Drawing the art

- **One frame for everything.** All part images have the same size (e.g. 48 × 48 or 64 × 64 px; pixel
  art is shown sharp, scaled up). Draw each part **in its place** on that frame, as if the whole
  creature were there, with a transparent background. The game simply stacks them, back to front:
  legs, arms, eyes, nose, mouth, hat.
- **The object** uses the same frame size, but its frame stands right next to the creature's frame,
  on its right. Draw it where it should be in that frame.
- **Grey shades only.** The game colours each part with its sign's gbc1 colour by multiplying:
  white → the colour, lighter/darker greys → lighter/darker shades of it, black stays black (outlines).
  Colours in the drawings are turned into greys (by brightness).
- **Variants** of a style keep the same look and differ in the detail (eyes open / closed / looking
  up …). Respect the fixed variants above. A style can have 1–6 variants.
- **Styles**: up to 26 per part (more is fine). Each style is a different look for that part.

## Workflow (what happens when you send art)

1. You send images in any form (single PNGs, a sheet, a zip), saying which part/style/variant they are
   (or the layout makes it clear).
2. Claude cuts and sorts them into the source folder, as delivered:
   `art/parts/<part>/<NN-name>/<variant>.png`, e.g. `art/parts/eyes/03-sleepy/2.png`
   (NN = style order; variant = 1–6). Resizing or format fixes are done with `sips` where needed;
   the images must end up exactly the frame size, 8-bit PNG.
3. `python3 scripts/build_parts.py` turns the sources into what the game loads:
   `assets/parts/<part>.png` (one atlas per part: a row per style, 6 columns, grey + transparency) and
   `assets/parts/manifest.json` (frame size, styles with their variant counts, version).
4. Check in the game (lab panel: level buttons, the parts table shows style / colour / variant), then
   commit sources and built files together.

Until a part has art, the game draws simple placeholder shapes for it (with the variants above), so
everything can be tried before the art exists.
