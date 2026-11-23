// All tunable numbers in one place. See docs/05-system-design.md §12.

export const ENGINE_VERSION = '0.5.0';

export const DEFAULT_PARAMS = {
  // learning
  repsToLearn: 3, // repetitions until a pattern is "confident" (~75%)
  fastHalfLife: 300, // player inputs until short-term memory weight halves
  shortTermFade: 0.5, // short-term memory multiplier at each sleep
  questionBoost: 3, // weight of an answer to a question
  selfLearnWeight: 0.5, // learning from its own move when joy follows

  // elemental signs (docs/05 §17)
  yesWeight: 2, // ✅: its last move(s) learned this strongly
  noWeight: 1.5, // ❌: its last move(s) weakened this much
  loveWeight: 1, // ❤️: softer reinforcement, but lots of warmth
  elabDepth: 2, // ❓: emojis it elaborates at stage 0 (+1 per stage)
  elabMinSure: 0.2, // stops elaborating below this certainty
  reactYes: 0.3, // chance it confirms ✅ when you did what it confidently expected
  reactNo: 0.4, // chance it rejects ❌ when you break a strong habit
  reactLove: 0.2, // chance of ❤️ when it's very joyful

  // behaviour
  temperature: 0.8, // chaos
  maxCertainty: 0.85, // no choice is ever more likely than this
  noveltyBase: 0.03, // chance to try something new
  noveltyBored: 0.3, // extra chance when bored
  nearbyNovelty: 0.8, // new emojis from the current palette neighbourhood
  habitAfterSleeps: 2, // sleeps a pattern must survive to become a habit
  habitBoost: 0.4, // extra pull of a habit

  // emotions
  emotionFade: 0.8, // per player input
  contagion: 0.3, // how strongly emojis/patterns trigger associated emotions
  expressiveness: 0.2, // how much its emotion biases its emoji choice
  labelAt: 0.35, // emotion strength needed to show the label

  // energy & sleep
  capacity: 100, // player inputs until tired (stage factor applies)
  capacityJitter: 0.2,
  sleepyBelow: 0.25, // energy fraction where nodding off can start
  idleSleepMin: 2, // falls asleep when left alone this long
  fullRecoveryMin: 60, // empty → full; energy recovers steadily while sleeping
  dreamIntervalSec: 3, // one dream emoji every few seconds (independent of recovery)
  wakeDelaySec: [2, 20],
  characterSize: 6, // emojis in its inborn character
  replyDelaySec: [0.6, 1.5],

  // growth by experience (docs/06 #1): maturity points needed for stage 1, 2, 3, 4
  stageThresholds: [3, 6, 9, 12],
  maturityFullAt: 30, // player inputs in a session that count as one full point of engagement
  maturityBonusMax: 0.2, // extra points for learning in a session (new rules, habits, adopted tries…)
  neglectDays: 2, // after this many days without play…
  neglectLoss: 0.5, // …it loses this many maturity points per extra day

  // consistent but not repetitive (docs/06 #2, #3, #6)
  loopBoredAt: 0.2, // share of repeated 3-emoji sequences (last ~20 emojis) that starts boredom
  habitFatigue: 0.75, // pull of a pattern × this, per time it was used in the current session
  habitChallenge: 0.1, // habit strength lost when you answer differently (changing the topic also counts, so keep it mild)
  memoryShare: 0.35, // share of its "new" impulses that bring back an old emoji instead (stage 2+)

  // living character (docs/06 #7)
  characterBirth: 2, // starting weight of inborn emojis
  characterDecay: 0.97, // per sleep
  characterGain: 0.1, // max weight an emoji can gain per sleep
  characterMin: 0.15, // minimum weight to count as part of its character

  // keyboard
  frequentHalfLife: 3, // sessions

  // sleep brain (tiny neural net)
  netEmbed: 16,
  netHidden: 48,
  netContext: 4,
  netLr: 0.05,
  netEpochs: 3,
  netOldSamples: 200,
};

// What each growth stage can do. See docs/05 §5.
// capacity: × params.capacity (small ones tire quickly) · impulse: × novelty chance ·
// chaos: + temperature · nature: share of its inborn character in its choices ·
// babble: share of random babbling when it has no idea what to say ·
// improvise: share of 'no idea' moments where it improvises (twist / new / memory) instead of waiting.
export const STAGES = [
  { context: 1, echoK: 1, gut: false, dejavu: false, questions: false, games: false, capacity: 0.35, contagion: 0.3, impulse: 4, chaos: 0.5, nature: 0.35, babble: 0.45, improvise: 0 },
  { context: 2, echoK: 2, gut: false, dejavu: false, questions: true, games: false, capacity: 0.5, contagion: 0.5, impulse: 2.5, chaos: 0.3, nature: 0.25, babble: 0.3, improvise: 0.1 },
  { context: 4, echoK: 2, gut: true, dejavu: true, questions: true, games: true, capacity: 0.65, contagion: 0.7, impulse: 1.8, chaos: 0.15, nature: 0.15, babble: 0.15, improvise: 0.25 },
  { context: 6, echoK: 3, gut: true, dejavu: true, questions: true, games: true, capacity: 0.8, contagion: 0.85, impulse: 1.2, chaos: 0.05, nature: 0.1, babble: 0.1, improvise: 0.35 },
  { context: 8, echoK: 4, gut: true, dejavu: true, questions: true, games: true, capacity: 0.95, contagion: 1.0, impulse: 1.0, chaos: 0, nature: 0.08, babble: 0.08, improvise: 0.45 },
];

// Sliders shown in the test panel.
export const SLIDERS = [
  { key: 'repsToLearn', label: 'learning speed (reps to learn)', min: 1, max: 8, step: 1 },
  { key: 'temperature', label: 'chaos', min: 0.2, max: 2, step: 0.1 },
  { key: 'noveltyBase', label: 'novelty', min: 0, max: 0.3, step: 0.01 },
  { key: 'capacity', label: 'capacity (inputs until tired)', min: 20, max: 200, step: 10 },
];
