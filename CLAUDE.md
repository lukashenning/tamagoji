# Tamago-ji

A Tamagotchi-like creature that the player only talks to with **emojis**: one emoji per message,
back and forth. The creature learns through a small **next-token-prediction** system. Its whole
identity (behaviour, later its appearance) should follow from its **token history**.

## Current phase

**Prototype 0.6: the simple core** (2026-11-23), described in `docs/07-simple-core.md`. The user found
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
Next: the user plays it.

**Keep it simple.** The user strongly prefers a small, transparent system. Don't add mechanisms
back without being asked. Prefer tuning existing parameters.

## Working agreements

- **Local git only** (since 2026-11-23): no remote, no GitHub for now. Branch `main`; commit each
  finished, tested change with a short message; tag prototype versions (`v0.10`, …). Repo-local
  author identity is a placeholder (`lukas@tamagoji.local`).
- **Everything in English**: code, comments, docs, conversation. (The original notes were German;
  the translation lives in `docs/01-vision.md`.) Exception: in-game UI labels the user specified in
  German ("Zuletzt", "16 Uhr", "Zu müde...").
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
| `docs/07-simple-core.md` | **Current design** (0.6): the simple core |
| `docs/05-system-design.md` | Design of v0.1–0.5 (mostly superseded by 07) |
| `docs/06-proposals-v6.md` | v0.5 changes after the first broad test (superseded by 07) |
| `docs/simulations/` | Simulation reports |

## Stack (D32)

Plain JavaScript ES modules, no build step · vanilla DOM · hand-written tiny neural net · tests on
JavaScriptCore. TypeScript + Vite + PWA service worker later, once Node is available.
Manual testing via the test panel; headless bot players maybe later (D25).
