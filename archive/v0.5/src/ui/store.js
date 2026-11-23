// Saving: the creature is its history (+ seed). Settings are stored separately.

import { BIRTH, LEGACY, TIME } from '../core/tokens.js';
import { ENGINE_VERSION, DEFAULT_PARAMS } from '../core/params.js';
import { makeCharacter } from '../core/emojiIndex.js';
import { rngFor } from '../core/rng.js';

const KEY = 'tamagoji.creature.v1';
const PKEY = 'tamagoji.params.v1';

export function newCreature(now, params = DEFAULT_PARAMS) {
  const seed = Math.floor(Math.random() * 4294967296) >>> 0;
  // its inborn character is written into the birth entry, so the history fully describes it
  const character = makeCharacter(rngFor(seed, 'character'), params.characterSize);
  return {
    format: 2,
    engine: ENGINE_VERSION,
    seed,
    clockOffset: 0,
    history: [{ t: now, who: 'S', tok: BIRTH, m: character.join(' ') }],
  };
}

function encode(save) {
  return { ...save, history: save.history.map((e) => (e.m ? [e.t, e.who, e.tok, e.m] : [e.t, e.who, e.tok])) };
}

export function decode(obj) {
  if (!obj || typeof obj.seed !== 'number' || !Array.isArray(obj.history)) throw new Error('not a Tamago-ji file');
  // format 1 (before 0.4) used ⏳ as the wait/pass sign; from format 2 on it's 💬 and ⏳ is ordinary
  const oldWait = (obj.format || 1) < 2 ? { '⏳': TIME } : {};
  const history = obj.history.map((e) => {
    const [t, who, tok, m] = e;
    const entry = { t, who, tok: LEGACY[tok] || oldWait[tok] || tok };
    if (m) entry.m = m;
    return entry;
  });
  return { format: 2, engine: obj.engine || '?', seed: obj.seed >>> 0, clockOffset: obj.clockOffset || 0, history };
}

export function loadCreature() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? decode(JSON.parse(raw)) : null;
  } catch (e) {
    console.warn('could not load creature', e);
    return null;
  }
}

export function saveCreature(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(encode(save)));
  } catch (e) {
    console.warn('could not save creature', e);
  }
}

export function loadParams() {
  try {
    const raw = localStorage.getItem(PKEY);
    return { ...DEFAULT_PARAMS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

export function saveParams(params) {
  const changed = {};
  for (const k of Object.keys(params)) if (params[k] !== DEFAULT_PARAMS[k]) changed[k] = params[k];
  try {
    localStorage.setItem(PKEY, JSON.stringify(changed));
  } catch {}
}

export function exportFile(save) {
  const blob = new Blob([JSON.stringify(encode(save))], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `tamagoji-${d.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file) {
  return decode(JSON.parse(await file.text()));
}
