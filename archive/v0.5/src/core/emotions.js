// Five emotions + tiredness (a body state treated like an emotion). See docs/05 §7.
// Emotions arise from situations (rules in mind.js) and from learned associations:
// every emoji and emoji pattern gets an "emotion profile" over time.

export const EMO = ['joy', 'curiosity', 'unease', 'sadness', 'anger'];
export const PROFILE_DIMS = [...EMO, 'tiredness'];

export const LABELS = {
  joy: 'joyful',
  curiosity: 'curious',
  unease: 'uneasy',
  sadness: 'sad',
  anger: 'angry',
  tiredness: 'tired',
};

export function newEmotions() {
  return { joy: 0, curiosity: 0, unease: 0, sadness: 0, anger: 0 };
}

/** How established an association is, 0..1. */
export function strength(profile, repsToLearn) {
  return profile.n / (profile.n + 2 * repsToLearn);
}

/** Move a profile toward the current emotional state (a slow average). */
export function updateProfile(profiles, key, vec, weight) {
  let pr = profiles.get(key);
  if (!pr) {
    pr = { v: new Array(PROFILE_DIMS.length).fill(0), n: 0 };
    profiles.set(key, pr);
  }
  const rate = Math.max(0.05, 1 / (pr.n + 1)) * weight;
  for (let i = 0; i < vec.length; i++) pr.v[i] += rate * (vec[i] - pr.v[i]);
  pr.n += weight;
}
