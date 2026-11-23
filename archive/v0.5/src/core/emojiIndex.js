// The emoji "world": every emoji with its palette section and subgroup.
// The creature uses this only as a neighbourhood for trying new emojis, never as meaning.

import { SECTIONS } from '../data/emoji.js';
import { pick } from './rng.js';
import { ELEMENTALS } from './tokens.js';

export { SECTIONS };
export const ALL = []; // every ordinary emoji (the five elemental signs are kept apart)
export const INFO = new Map(); // emoji -> { section, subgroup, name }
const bySection = new Map();
const bySubgroup = new Map();

for (const section of SECTIONS) {
  bySection.set(section.key, []);
  for (const [emoji, subgroup, name] of section.emojis) {
    if (ELEMENTALS.includes(emoji)) continue;
    ALL.push(emoji);
    INFO.set(emoji, { section: section.key, subgroup, name });
    bySection.get(section.key).push(emoji);
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

/**
 * Pick an emoji the creature hasn't used yet, mostly near `anchor` in the palette.
 * @param {string|null} anchor emoji the conversation is currently about
 * @param {(e: string) => boolean} isKnown
 * @param {() => number} rng
 * @param {number} nearby fraction of picks from the neighbourhood
 */
export function pickNew(anchor, isKnown, rng, nearby) {
  const info = anchor ? INFO.get(anchor) : null;
  const r = rng();
  let pools = [ALL];
  if (info && r < nearby * 0.6) pools = [bySubgroup.get(info.subgroup), bySection.get(info.section), ALL];
  else if (info && r < nearby) pools = [bySection.get(info.section), ALL];
  for (const pool of pools) {
    const fresh = pool.filter((e) => !isKnown(e));
    if (fresh.length) return pick(fresh, rng);
  }
  return pick(ALL, rng);
}
