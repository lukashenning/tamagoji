// All tunable numbers in one place. See docs/07-simple-core.md.

export const ENGINE_VERSION = '0.11.0';

export const DEFAULT_PARAMS = {
  // pattern memory
  contextMax: 6, // longest sequence of previous emojis it looks at
  repsToLearn: 3, // repetitions until a pattern is "confident" (~75%)
  memoryHalfLife: 2000, // conversation emojis until an old pattern counts half (recent counts more)
  questionBoost: 3, // your answer to its ❓ counts this much

  // reinforcement
  // ✅ / ❌ act on the reaction: its emoji's link to the emoji it answered and to the sequence it answered
  yesWeight: 2, // ✅: those links +2
  noFactor: 0.5, // ❌: those links × 0.5 …
  noWeight: 0.5, // … and −0.5 (so one ❌ clearly lowers the chance, even for a strong habit)

  // behaviour
  temperature: 0.8, // chaos
  maxCertainty: 0.85, // no choice is ever more likely than this
  // loop avoidance (awake and in dreams): for each possible next emoji, count how often the sequence it
  // would complete (2, 3, … 6 emojis long) already occurred among the recent emojis, plus how often the
  // emoji itself already occurs in the last 12 (beyond 2). That option counts × e^(−strength × count).
  // Awake, the freed share goes to a totally new emoji; in dreams, to other emojis it knows.
  loopStrength: 0.7, // 0 = off
  loopWindow: 20, // "recent" = the last this many emojis
  noveltyBase: 0.04, // chance to try a new emoji
  repeatNovelty: 0.7, // extra chance of a totally new emoji, × how repetitive the recent conversation is
  reactYes: 0.25, // chance it confirms ✅ when you did what it confidently expected
  reactNo: 0.3, // chance it says ❌ when you broke a confident expectation
  answerMinSure: 0.25, // your ❓: below this certainty it asks back instead of guessing
  askSurprise: 0.35, // each further ❓ of yours in a row adds this chance of a totally new emoji

  // energy & sleep
  capacity: 80, // player inputs until tired (~6 min)
  sleepyBelow: 0.25, // energy fraction where nodding off can start
  idleSleepMin: 2, // falls asleep when left alone this long
  fullRecoveryMin: 60, // empty → full; energy recovers steadily while sleeping
  dreamIntervalSec: 3, // one dream emoji every few seconds
  dreamWeight: 0.01, // how much each dreamed emoji is learned on waking (full sleep ≈ 1200 × 0.01)
  dreamTemperature: 0.9,
  wakeDelaySec: [2, 20],
  replyDelaySec: [0.6, 1.5],

  // seed character: a few emojis it babbles while it knows nothing (and its first look)
  characterSize: 6,

  // appearance basis (docs/07): which emojis define its face, extremities, hair/hat and object
  lookUnlock: [0, 4, 10, 20], // slots 2–4 fade in from this complexity, fully there at twice it
  lookTop: 8, // the look is blended from the 8 emojis that weigh most in its patterns
  lookFollow: 0.5, // after each sleep the look moves halfway to the new blend (gradual change)

  // too tired: while asleep with low energy your sign only sometimes wakes it
  tiredBelow: 0.1, // below this energy it never wakes from a sign
  tiredBlockSec: 10, // after a failed attempt, input is blocked this long ("Zu müde...")

  // storage
  maxSaveMB: 10, // above this, the oldest part of the history is dropped
};

// Sliders shown in the test panel.
export const SLIDERS = [
  { key: 'repsToLearn', label: 'learning speed (reps to learn)', min: 1, max: 8, step: 1 },
  { key: 'temperature', label: 'chaos', min: 0.2, max: 2, step: 0.1 },
  { key: 'noveltyBase', label: 'novelty', min: 0, max: 0.3, step: 0.01 },
  { key: 'dreamWeight', label: 'dream learning', min: 0, max: 0.05, step: 0.005 },
  { key: 'loopStrength', label: 'loop avoidance (0 = off)', min: 0, max: 2, step: 0.1 },
  { key: 'repeatNovelty', label: 'surprise when repetitive', min: 0, max: 1.5, step: 0.05 },
];
