// Input panel: two 4×4 grids.
// Left ("Zuletzt"): the most recently used emojis (yours and its). ✅ ❌ ❓ are gestures, not keys.
// Right ("16 Uhr"): 16 random emojis that change every full hour.

const cells = (list) => list.map((e) => `<span class="em${e.pinned ? ' pinned' : ''}" data-e="${e.tok}">${e.tok}</span>`).join('');

export function buildPalette(root, { onPick, onZz }) {
  root.innerHTML = `
    <div class="kb-half"><div class="kb-title kb-title-left"></div><div class="kb-grid kb-recent"></div></div>
    <div class="kb-half"><div class="kb-title kb-title-right"></div><div class="kb-grid kb-random"></div></div>`;
  const recent = root.querySelector('.kb-recent');
  const random = root.querySelector('.kb-random');
  const titleLeft = root.querySelector('.kb-title-left');
  const titleRight = root.querySelector('.kb-title-right');
  let lastRecent = '';
  let lastRandom = '';
  let sleepy = null; // "Zu müde...": the 💤 slots shown (as a key), else null

  root.addEventListener('click', (e) => {
    const b = e.target.closest('.em');
    if (!b) return;
    if (b.dataset.zz) onZz(Number(b.dataset.zz));
    else if (b.dataset.e) onPick(b.dataset.e);
  });

  return {
    /** @param {string[]} pinned @param {string[]} list */
    setRecent(pinned, list) {
      sleepy = null;
      const key = pinned.join('') + '|' + list.join('');
      if (key === lastRecent) return;
      lastRecent = key;
      recent.innerHTML = cells([...pinned.map((tok) => ({ tok, pinned: true })), ...list.map((tok) => ({ tok }))]);
    },
    /** @param {string[]} list */
    setRandom(list) {
      sleepy = null;
      const key = list.join('');
      if (key === lastRandom) return;
      lastRandom = key;
      random.innerHTML = cells(list.map((tok) => ({ tok })));
    },
    /**
     * "Zu müde...": a little game. The keys are empty except for a few 💤 at the given slots
     * (0–15 left half, 16–31 right half); tapping one calls onZz(slot).
     * @param {Set<number>} slots
     */
    setSleepy(slots) {
      const key = [...slots].sort((a, b) => a - b).join(',');
      if (sleepy === key) return;
      sleepy = key;
      lastRecent = lastRandom = ''; // the normal keys are redrawn afterwards
      const half = (from) =>
        Array.from({ length: 16 }, (_, i) => (slots.has(from + i) ? `<span class="em zz" data-zz="${from + i}">💤</span>` : '<span class="em zz"></span>')).join('');
      recent.innerHTML = half(0);
      random.innerHTML = half(16);
    },
    setTitles(left, right) {
      if (titleLeft.textContent !== left) titleLeft.textContent = left;
      if (titleRight.textContent !== right) titleRight.textContent = right;
    },
    setLocked(locked) {
      root.classList.toggle('locked', locked);
    },
  };
}
