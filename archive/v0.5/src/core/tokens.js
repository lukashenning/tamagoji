// Tokens in the history: emojis, the five elemental signs, and a few system events.

// The five elemental signs have built-in meaning (docs/05 §17). They are "meta" signs:
// skipped when looking for content patterns, used by built-in rules instead.
export const YES = '✅'; // confirms: that was right
export const NO = '❌'; // rejects: not that
export const LOVE = '❤️'; // affection (and a softer "yes")
export const ASK = '❓'; // question: you ask it to elaborate / it asks you
export const TIME = '💬'; // waiting / passing: you pass / it waits and listens
export const ELEMENTALS = [YES, NO, LOVE, ASK, TIME];
export const isElemental = (tok) => ELEMENTALS.includes(tok);

// 💬 is both "wait" (creature) and "pass" (player)
export const WAIT = TIME;
export const PASS = TIME;

// system events
export const SLEEP = '⟨sleep⟩';
export const WAKE = '⟨wake⟩';
export const BIRTH = '⟨birth⟩';

// tokens from saves made before the elemental signs existed
export const LEGACY = { '⟨wait⟩': TIME, '⟨pass⟩': TIME };

/** Content tokens are ordinary emojis: the material patterns are made of. */
export const isContent = (tok) => !tok.startsWith('⟨') && !ELEMENTALS.includes(tok);

export const SEP = '\u0001';
