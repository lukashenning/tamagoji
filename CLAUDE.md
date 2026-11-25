# Tamago-ji

A Tamagotchi-like creature that the player only talks to with **emojis**: one emoji per message,
back and forth. The creature learns through a small **next-token-prediction** system. Its whole
identity (behaviour, later its appearance) should follow from its **token history**.

## Current phase

**v1.0: the sign engine (engine 1.0, merged into `main` 2026-11-25)**, described in
`docs/08-sign-engine.md`. Built on branch `experiment` as a complete replacement of the 0.13 engine
from the user's sketch: associations on levels 1–4 (votes, longer contexts count ×1.5 per level),
✓/✗ on the last real sign (+3/−3, negative links), its own ✓/✗ (your ✗ inverts, ✓ repeats),
"not that, this" (A ✗ B ✓ takes A back), its ☐ when unsure, surprise (10% base + repetition +
waiting), ☐ chaining, slow fading, dreams (+0.1, plus proximity links the other way round at +0.04,
D70), top 6 of its last 1000 outputs → seats (look) and a usage-weighted voice. Complexity =
known signs × order, measured after dreams of ≥ 700 signs (D75). **Creature graphic** (D77,
`docs/09-creature-art.md`): no body, up to 7 stacked parts from its top 7 signs by rank, level 1–5
from complexity (level 1 = eyes, hat, mouth), per-sign moves, fixed poses. Art: the user's drawing
sheets → `scripts/extract_parts.py` (traced to SVG in `art/parts/`) → `scripts/build_parts.py` →
`assets/parts/parts.json`; 5 styles per part so far. UI: tap creature ✓,
tap around ❓, swipe through ✗, soft flashes, exchange row bottom left; phones/tablets game-only,
Escape toggles game-only on desktop (D71). Browser storage `tamagoji.creature.exp1` (kept so the
user's creature survives). Rule checks over simulated play: `jsc -m tests/play.js` (40 creatures ×
1500 steps, ~7 s); proximity vs sequence learning: `jsc -m tests/proximity.js` (~10 s). `sim/` is
not updated for it.
Next: the user plays it.

The text below describes the previous engine (0.13, tag `v0.13`, code no longer on `main`):

**Prototype 0.13 on the simple core of 0.6** (2026-11-23), described in `docs/07-simple-core.md`. The user found
v0.5 too complex and not working well, so it was stripped down:
- one pattern memory over the whole history, used for next-token prediction
- ✅ / ❌ (re)inforce the emoji, its link to the previous emoji, and its link to the recent sequence
- ❓ = your turn / what comes next (one guess) or its "I don't know"; ❤️ and 💬 are ordinary emojis
- sleep consolidates by dreaming next-token predictions and learning from them
- no emotions, stages, habits, neural net or living character

The old code is in `archive/v0.5/`. Loops are handled by loop avoidance (D47). In 0.7: ❓ gives one
guess, ✅/❌ act on the reaction (❌ halves it), and repetition triggers surprising new emojis (D48).
In 0.8: 💬 merged into ❓, and several ❓ in a row trigger surprises (D49). In 0.9: loop avoidance
covers loops of any length, awake and in dreams (D50). In 0.10: "Zuletzt" + hourly keyboard,
"Zu müde...", 10 MB pruning, complexity score, appearance basis, melodies (D51).
Melodies: 500 ms, creature only, diatonic with keys per emoji category, fixed ✅ ❌ ❓ (D52); one-octave range (D53); two octaves up, voice from the look (D54),
8 synth instruments chosen by the face slot (D55). Surprises and all other new emojis come from the hourly keyboard set (D56, D57).
In 0.11: gradual look (blended traits, half-way per sleep) and a continuous synth voice driven by it
(D58, D60); ❓ draws out learned chains (D59); dreams rise straight up, paced by the dreams (D61–D63).
In 0.12: after ❌ a more surprising retry, and ✅ after it teaches "not that, this" (D64).
In 0.13: ❌ takes the rejected emoji back out of the sequence; rankings use pattern strength, so
new emojis can gradually overtake old ones (D65).

**Keep it simple.** The user strongly prefers a small, transparent system. Don't add mechanisms
back without being asked. Prefer tuning existing parameters.

## Working agreements

- **Git + GitHub** (local since 2026-11-23, GitHub since 2026-11-25): remote `origin` =
  https://github.com/lukashenning/tamagoji. Branch `main`; commit each finished change with a short
  message; tag versions (`v0.10`, …, `v1.0`); push only when the user asks. Repo-local author
  identity is a placeholder (`lukas@tamagoji.local`).
- **Everything in English**: code, comments, docs, conversation. (The original notes were German;
  the translation lives in `docs/01-vision.md`.) Exception: in-game UI labels the user specified in
  German (none are shown any more since 2026-11-25; the keyboard has no labels).
- The user has **little ML background**. Explain ML concepts in plain language, give a clear
  recommendation with pros/cons, and prefer approaches that can be shown in experiments over theory.
- Concept work lives in `docs/`. Keep it current:
  - new questions → `docs/03-open-questions.md` (with IDs Q1, Q2, …)
  - answers that settle something → `docs/04-decisions.md` (D1, D2, …, with status)
  - don't rewrite `docs/01-vision.md`; it's the source vision. Record changes as decisions.
- Update the **Current phase** section above at the end of each work session.

## Core constraints (from the vision)

- Messages are always exactly **one symbol**. Symbols have **no inherent meaning**, except the three
  **elemental signs** ✅ ❌ ❓ (D39, D46, D49).
- The **token history is the source of truth**. Anything else stored must be rebuildable from it.
- A creature's stored data stays within **a few MB**.
- **Lightweight**: runs offline on a phone, no server, no heavy ML library.

## Docs map

| File | Content |
|---|---|
| `docs/01-vision.md` | Translated original concept notes (source vision) |
| `docs/02-technology-options.md` | Model options, recommended architecture, storage, stack, experiment tooling |
| `docs/03-open-questions.md` | Q&A tracker |
| `docs/04-decisions.md` | Decisions log |
| `docs/08-sign-engine.md` | **Current design** (v1.0): the sign engine (replaces 07) |
| `docs/09-creature-art.md` | Creature graphic: parts, levels, moves, art format and workflow |
| `docs/07-simple-core.md` | Design of 0.6–0.13: the simple core (superseded by 08) |
| `docs/05-system-design.md` | Design of v0.1–0.5 (mostly superseded by 07) |
| `docs/06-proposals-v6.md` | v0.5 changes after the first broad test (superseded by 07) |
| `docs/simulations/` | Simulation reports |

## Stack (D32)

Plain JavaScript ES modules, no build step · vanilla DOM · hand-written tiny neural net · tests on
JavaScriptCore. A small service worker (`sw.js`) always loads the newest files (network first,
offline fallback). TypeScript + Vite later, once Node is available.
Manual testing via the test panel; headless bot players maybe later (D25).
Local server: `python3 scripts/serve.py` (this Mac only) or `python3 scripts/serve.py 5173 --lan`
(also from a phone on the same Wi-Fi; launch config `tamagoji-phone`).
