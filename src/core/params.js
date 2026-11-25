// All tunable numbers in one place. See docs/08-sign-engine.md.

export const ENGINE_VERSION = '1.0.0-exp';

export const DEFAULT_PARAMS = {
  // associations
  levels: 4, // context lengths 1…4
  levelGrowth: 1.5, // level weights 1, 1.5, 2.25, 3.4: each longer context counts 1.5×
  repeatWeight: 1, // each use of a sign after a context adds this to the link
  decayPerTurn: 0.03, // while awake, every link drifts this much towards 0 per turn of yours (±3 → 0 in 100 turns)
  temperature: 3, // chaos: how strongly more votes win (higher = more even)

  // ✓ / ✗ (yours and its own) on the last real sign's links
  yesWeight: 3,
  noWeight: 3,

  // its own ✓ / ✗ right after your real sign
  reactYes: 0.35, // when your sign had been at least reactYesAt expected
  reactYesAt: 0.4,
  reactNo: 0.25, // when it expected something else at ≥ reactNoTop and yours was below reactNoBelow
  reactNoTop: 0.6,
  reactNoBelow: 0.1,
  reactBase: 0.02, // otherwise, rarely

  // its ☐ (wait): base chance, rising to waitMax when its top two expectations are within waitClose
  waitBase: 0.05,
  waitMax: 0.25,
  waitClose: 0.05,

  // surprise: a random emoji from this hour's keyboard set
  surpriseBase: 0.1, // always at least this
  repeatSurprise: 0.3, // × repetition pressure (max over k of m / k²): one sign twice +30%, abab +15%
  waitSurpriseFrom: 4, // your ☐ in a row from which waiting makes it playful
  waitSurprise: 0.05, // … + this per further ☐
  waitSurpriseMax: 0.4,
  surpriseMax: 0.7,
  seedWhenClueless: 0.7, // no expectation at all: one of its familiar (seat) signs (else a surprise)

  // energy & sleep
  capacity: 80, // inputs until tired (~6 min)
  sleepyBelow: 0.4, // below this energy it can nod off mid-conversation, more likely the more tired
  nodOffMax: 0.5, // chance per turn of its at 0 energy (curve: ((sleepyBelow − e) / sleepyBelow)²)
  idleSleepMin: 2, // left alone it falls asleep after this × its energy (50% → 1 min); never at 100%
  idleSleepMinSec: 10, // … but not sooner than this
  fullRecoveryMin: 60, // empty → full; energy recovers steadily while sleeping
  dreamIntervalSec: 3, // one dream sign every few seconds
  dreamWeight: 0.1, // each dreamed sign is learned this much on waking
  proximityWeight: 0.04, // dreams also link each sign to its neighbours the other way round (D70)
  complexityDreamMin: 700, // a dream of at least this many learned signs updates its complexity (D75)
  complexityMinUses: 3, // a sign counts as known when it appears this often in those signs
  wakeDelaySec: [1, 4], // rested (100%): wakes by itself this many seconds later
  replyDelaySec: [0.6, 1.5],

  // seed: random emojis it is born with (its first seats)
  characterSize: 7,

  // top signs → seats (look) and voice
  outputWindow: 1000, // ranked by use in its last this many outputs
  seats: 7, // one per part: eyes, hat, mouth, legs, arms, nose, object (D77)
  levelAt: [6, 10, 15, 21], // complexity needed for levels 2…5 (rough: ~2 days of play to level 5)
  objectMoveChance: 0.33, // each time it says something, its object moves to another spot with this chance
  levelOverride: 0, // lab panel: show this level (1–5) instead of the one from complexity; 0 = off


  // storage
  maxSaveMB: 10, // above this, the oldest part of the history is dropped
};

// Sliders shown in the test panel.
export const SLIDERS = [
  { key: 'temperature', label: 'chaos', min: 0.5, max: 8, step: 0.5 },
  { key: 'levelGrowth', label: 'longer contexts count (× per level)', min: 1, max: 4, step: 0.25 },
  { key: 'yesWeight', label: '✓ strength', min: 0, max: 10, step: 0.5 },
  { key: 'noWeight', label: '✗ strength', min: 0, max: 10, step: 0.5 },
  { key: 'reactYes', label: 'its ✓ when you did what it expected', min: 0, max: 1, step: 0.05 },
  { key: 'surpriseBase', label: 'base surprise', min: 0, max: 0.5, step: 0.01 },
  { key: 'repeatSurprise', label: 'surprise when repetitive', min: 0, max: 0.8, step: 0.01 },
  { key: 'dreamWeight', label: 'dream learning', min: 0, max: 0.5, step: 0.05 },
  { key: 'proximityWeight', label: 'dream proximity learning', min: 0, max: 0.2, step: 0.01 },
  { key: 'decayPerTurn', label: 'fading (towards 0 per turn)', min: 0, max: 0.1, step: 0.005 },
];
