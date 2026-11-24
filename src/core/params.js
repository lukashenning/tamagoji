// All tunable numbers in one place. See docs/08-sign-engine.md.

export const ENGINE_VERSION = '1.0.0-exp';

export const DEFAULT_PARAMS = {
  // associations
  levels: 4, // context lengths 1…4
  levelGrowth: 2, // level weights 1, 2, 4, 8: each longer context counts double
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
  sleepyBelow: 0.25, // energy fraction where nodding off can start
  idleSleepMin: 2, // falls asleep when left alone this long
  fullRecoveryMin: 60, // empty → full; energy recovers steadily while sleeping
  dreamIntervalSec: 3, // one dream sign every few seconds
  dreamWeight: 0.1, // each dreamed sign is learned this much on waking
  wakeDelaySec: [2, 20],
  replyDelaySec: [0.6, 1.5],

  // seed: random emojis it is born with (its first seats)
  characterSize: 6,

  // top signs → seats (look) and voice
  outputWindow: 1000, // ranked by use in its last this many outputs
  seats: 6,

  // too tired: while asleep with low energy your sign only sometimes wakes it
  tiredBelow: 0.1, // below this energy it never wakes from a sign
  tiredBlockSec: 10, // after a failed attempt, input is blocked this long ("Zu müde...")

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
  { key: 'decayPerTurn', label: 'fading (towards 0 per turn)', min: 0, max: 0.1, step: 0.005 },
];
