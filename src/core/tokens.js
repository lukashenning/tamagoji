// Tokens in the history: emojis, the three elemental signs, and a few system events.

// The three elemental signs have built-in meaning. They are "meta" signs: never part of the
// patterns themselves, they act on them (docs/07).
export const YES = '✅'; // reinforces what it just said
export const NO = '❌'; // counter-reinforces what it just said
export const ASK = '❓'; // you: "your turn / what comes next?" · it: "I don't know / I'm listening"
export const ELEMENTALS = [YES, NO, ASK];
export const isElemental = (tok) => ELEMENTALS.includes(tok);

// ❓ also covers what used to be "wait" (creature) and "pass" (player)
export const WAIT = ASK;
export const PASS = ASK;

// system events
export const SLEEP = '⟨sleep⟩';
export const WAKE = '⟨wake⟩';
export const BIRTH = '⟨birth⟩';

// tokens from saves made before the elemental signs existed
export const LEGACY = { '⟨wait⟩': ASK, '⟨pass⟩': ASK };

/** Content tokens are ordinary emojis: the material patterns are made of. */
export const isContent = (tok) => !tok.startsWith('⟨') && !ELEMENTALS.includes(tok);

export const SEP = '\u0001';
