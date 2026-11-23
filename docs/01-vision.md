# 01 — Vision (translated original notes)

> English translation of the original German concept notes (2026-11-23).
> This is the **source vision**. Don't overwrite it with later decisions: those go in
> [04-decisions.md](04-decisions.md). Editorial remarks are marked _[note: …]_.

## Core idea

A Tamagotchi-like creature on a phone screen. The player **only ever interacts by giving it
emojis**. The lower part of the screen is an emoji palette (frequently used emojis first, then the
full emoji keyboard, scrolling horizontally). Above it is the creature, which shows its own emoji
above its head. It's a back-and-forth, **one emoji at a time**.

## Principles

- Symbols have **no inherent meaning**.
- Messages are **always exactly one symbol** long.
- There are a few **basic semantic meanings**. Learning binds them to symbols or symbol chains:
  - **positive**: reinforcement
  - **negative**: reinforcement
  - **listening**: to the next symbol
  - **question**: targeted training. Speeds up learning; happens when bored.
  - **narrating / dreaming**: compresses context, and rules/patterns emerge from that.

## Behaviours

### Sleeping
- Limits interaction chains. Rest allows a reset.
- Bigger tamago-ji have more capacity.
- During sleep, memories are compressed. The symbol chain of this process appears as a **dream**,
  shown semi-transparent above the tamago-ji.
- Falling asleep and waking up are recorded as **tokens**.
- Sleep is shown with a graphical marker, e.g. Zs. More Zs = more tired = it needs more dream
  symbols to recover.
- Dreaming has a **fixed rate (seconds per symbol)**, which is also how recovery is measured. If the
  player watches the sleep in real time, they see the symbols above the tamago-ji. If they close the
  app in the meantime, everything is **replayed very fast on reopening** while the tamago-ji
  "wakes up".

### Moving
- Two-frame animation on certain symbols.
- All features have **pressed states** when tapped, some with several variants.
- The player can tap features to **cycle** them.
- When the next symbol is entered, the current tap configuration is first written to memory as a
  **token**. Later, during generation, it is recalled like a symbol (partly or fully).

### Growing
- Happens with more complexity, after waking up.
- When it grows or shrinks depends on **thresholds** on a fixed scale that still has to be defined
  during development.

### Shrinking
- Happens with low complexity, after waking up.

### Forgetting
- Processes work on **recent** symbols.
- But **all symbols stay in memory**.

### Remembering
- Sometimes old symbol chains are **copied forward as a memory**, when they are preceded by a
  chain that is currently relevant.

### Asking
- Sometimes a tamago-ji starts a **question** with a symbol, either by replaying a sequence from
  recent memory or by randomly bringing up new symbols.
- Question mode is shown with a graphical marker.
- When question mode ends is not fixed. A question can be one symbol long and already
  "answered" (ended) with a single symbol, or it can go on for a few symbols.
- Outside question mode, learning is less targeted. The creature reacts to symbols and symbol
  patterns via token prediction, or slips in new symbols.

## Appearance
- No outline, only **slots** for facial features and limbs. Pre-made variants, pressed states,
  pastel colours.
- **Complexity (= growth)** decides how many slots a tamago-ji has, e.g. eyes only → eyes + headwear
  → + feet → + arms → + object.
- Which part goes in each slot, and in which colour, depends on which learned patterns are **most
  stable** at the moment of growing/shrinking/morphing, i.e. which emojis occur most.
- This needs its own system, which can be developed later.

## Learning
- Once there is enough certainty (through repetition), a symbol chain is **compressed into a
  narrative**. Similar narratives are **bundled**. A bundle counts as more complex when it has more
  variants.
- Chains are learned **much faster** when the creature asks them as a question and the player then
  continues them correctly.

## Complexity
- During compression, the sleeping tamago-ji tries to derive **rules** from its memories. When a
  threshold (**learning inertia**) is exceeded, a recurring pattern becomes a rule.
- Complexity rises when more symbols or symbol combinations have a rule; longer ones …
  _[note: the sentence is cut off in the original. Presumably "longer ones count more". See open questions.]_

## Data / file structure
- A tamago-ji should be **fully described by its symbol (token) history**. How it looks, how it
  behaves etc. should follow procedurally from that history. Its recovery state could also be read
  from it, because the fall-asleep and wake-up times are stored as tokens in the sequence.
- **Only if really necessary** for a convincing learning mechanic, extra local data may be stored
  on the device separately from the history.
- One tamago-ji's localStorage instance should not grow beyond **a few megabytes**.

## Technology
- The app should use **neural-network next-token-prediction** technology, but keep it simple. Not
  a highly complex system: just enough to stay flexible and lightweight, and enough to make a fun
  creature that feels alive.

## States
- **sleeping** (= dreaming)
- **asking** (question mark)
- **narrating** (no graphical marker)

## Development parameters (to tune)
- How fast does a tamago-ji learn patterns?
- How fast does it dream (seconds per symbol)?
- How random is next-token prediction, i.e. how much chaos?
- At which complexity levels does it grow or shrink? What are the levels? When does a part morph?
- How much capacity does it have before it must sleep again (ratio of symbols to recovery), and how
  much randomness is involved?

## Scope of the first proof of concept
- Simple PWA, tested in the desktop/phone browser.
- **No graphics yet**: the creature can be a placeholder. The goal is to test whether the learning
  system is feasible and fun, and to find a setup for further development.
