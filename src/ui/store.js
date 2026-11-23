// Saving: the creature is its history (+ seed). Settings are stored separately.

import { BIRTH, WAKE, LEGACY, ASK } from '../core/tokens.js';
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
    format: 3,
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
  // the wait/pass sign was ⏳ (format 1, before 0.4), then 💬 (format 2, until 0.7); since 0.8 it's ❓
  const format = obj.format || 1;
  const oldWait = format < 2 ? { '⏳': ASK } : format < 3 ? { '💬': ASK } : {};
  const history = obj.history.map((e) => {
    const [t, who, tok, m] = e;
    const entry = { t, who, tok: LEGACY[tok] || oldWait[tok] || tok };
    if (m) entry.m = m;
    return entry;
  });
  return { format: 3, engine: obj.engine || '?', seed: obj.seed >>> 0, clockOffset: obj.clockOffset || 0, pruned: obj.pruned || 0, history };
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

/**
 * Drop the oldest part of the history: about `share` of it, cut at the start of a session (a wake-up)
 * so the rest stays a clean sequence of sessions. The birth entry (seed character) is always kept.
 * The creature is rebuilt from what's left, so it forgets its oldest conversations; those had mostly
 * faded from its memory anyway. Returns the number of entries removed.
 */
export function pruneHistory(save, share = 0.2) {
  const h = save.history;
  if (h.length < 10) return 0;
  let cut = Math.max(2, Math.floor(h.length * share));
  while (cut < h.length - 1 && h[cut].tok !== WAKE) cut++;
  if (cut >= h.length - 1) return 0;
  const removed = cut - 1;
  save.history = [h[0], ...h.slice(cut)];
  save.pruned = (save.pruned || 0) + removed;
  return removed;
}

/**
 * Save to localStorage. If the save is larger than maxMB (measured as stored, 2 bytes per character),
 * or the browser runs out of space, the oldest history is dropped first.
 * Returns { bytes, pruned } (pruned = entries removed now).
 */
export function saveCreature(save, maxMB = 10) {
  let pruned = 0;
  let json = JSON.stringify(encode(save));
  for (let i = 0; i < 20 && json.length * 2 > maxMB * 1024 * 1024; i++) {
    const n = pruneHistory(save);
    if (!n) break;
    pruned += n;
    json = JSON.stringify(encode(save));
  }
  for (let i = 0; i < 20; i++) {
    try {
      localStorage.setItem(KEY, json);
      break;
    } catch (e) {
      const n = pruneHistory(save); // storage full: drop old history and try again
      if (!n) {
        console.warn('could not save creature', e);
        break;
      }
      pruned += n;
      json = JSON.stringify(encode(save));
    }
  }
  return { bytes: json.length * 2, pruned };
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
