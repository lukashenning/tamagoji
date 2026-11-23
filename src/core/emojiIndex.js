// The emoji "world": every emoji with its palette section and subgroup.
// Used for the seed character (pairs from the same subgroup) and melody keys, never as meaning.

import { SECTIONS } from '../data/emoji.js';
import { pick } from './rng.js';
import { ELEMENTALS } from './tokens.js';

export { SECTIONS };
export const ALL = []; // every ordinary emoji (the five elemental signs are kept apart)
export const INFO = new Map(); // emoji -> { section, subgroup, name }
const bySubgroup = new Map();

for (const section of SECTIONS) {
  for (const [emoji, subgroup, name] of section.emojis) {
    if (ELEMENTALS.includes(emoji)) continue;
    ALL.push(emoji);
    INFO.set(emoji, { section: section.key, subgroup, name });
    if (!bySubgroup.has(subgroup)) bySubgroup.set(subgroup, []);
    bySubgroup.get(subgroup).push(emoji);
  }
}

/**
 * An inborn character: a few emojis from a few palette neighbourhoods (its "seed").
 * Flags and people are left out so characters feel more like a temperament than a person.
 */
export function makeCharacter(rng, size) {
  const pool = ALL.filter((e) => {
    const i = INFO.get(e);
    return i.section !== 'flags' && !/^person|^people|^family|^hand|^hands|^body|^role|^fantasy/.test(i.subgroup);
  });
  const out = [];
  let guard = 0;
  while (out.length < size && guard++ < 100) {
    const anchor = pick(pool, rng);
    const group = bySubgroup.get(INFO.get(anchor).subgroup).filter((e) => !out.includes(e));
    for (let n = 0; n < 2 && group.length && out.length < size; n++) {
      out.push(group.splice(Math.floor(rng() * group.length), 1)[0]);
    }
  }
  return out;
}
