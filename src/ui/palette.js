// Input panel: two 4×4 grids, no labels.
// Left: the most recently used emojis (yours and its). ✅ ❌ ❓ are gestures, not keys.
// Right: 16 random emojis that change every full hour.
// While it sleeps the whole keyboard slides away (main.js), so there is nothing to type.

const cells = (list) => list.map((tok) => `<span class="em" data-e="${tok}">${tok}</span>`).join('');

export function buildPalette(root, { onPick }) {
  root.innerHTML = `
    <div class="kb-half"><div class="kb-grid kb-recent"></div></div>
    <div class="kb-half"><div class="kb-grid kb-random"></div></div>`;
  const recent = root.querySelector('.kb-recent');
  const random = root.querySelector('.kb-random');
  let lastRecent = '';
  let lastRandom = '';

  root.addEventListener('click', (e) => {
    const b = e.target.closest('.em');
    if (b && b.dataset.e) onPick(b.dataset.e);
  });

  return {
    /** @param {string[]} list */
    setRecent(list) {
      const key = list.join('');
      if (key === lastRecent) return;
      lastRecent = key;
      recent.innerHTML = cells(list);
    },
    /** @param {string[]} list */
    setRandom(list) {
      const key = list.join('');
      if (key === lastRandom) return;
      lastRandom = key;
      random.innerHTML = cells(list);
    },
    setLocked(locked) {
      root.classList.toggle('locked', locked);
    },
  };
}
