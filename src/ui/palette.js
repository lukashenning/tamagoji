// Input panel: two 5×5 grids.
// Left ("Zuletzt"): the pinned signs ✅ ❌ ❓ + the most recently used emojis (yours and its).
// Right ("16 Uhr"): 25 random emojis that change every full hour.

const cells = (list) => list.map((e) => `<span class="em${e.pinned ? ' pinned' : ''}" data-e="${e.tok}">${e.tok}</span>`).join('');

export function buildPalette(root, { onPick }) {
  root.innerHTML = `
    <div class="kb-half"><div class="kb-title kb-title-left"></div><div class="kb-grid kb-recent"></div></div>
    <div class="kb-half"><div class="kb-title kb-title-right"></div><div class="kb-grid kb-random"></div></div>`;
  const recent = root.querySelector('.kb-recent');
  const random = root.querySelector('.kb-random');
  const titleLeft = root.querySelector('.kb-title-left');
  const titleRight = root.querySelector('.kb-title-right');
  let lastRecent = '';
  let lastRandom = '';

  root.addEventListener('click', (e) => {
    const b = e.target.closest('.em');
    if (b) onPick(b.dataset.e);
  });

  return {
    /** @param {string[]} pinned @param {string[]} list */
    setRecent(pinned, list) {
      const key = pinned.join('') + '|' + list.join('');
      if (key === lastRecent) return;
      lastRecent = key;
      recent.innerHTML = cells([...pinned.map((tok) => ({ tok, pinned: true })), ...list.map((tok) => ({ tok }))]);
    },
    /** @param {string[]} list */
    setRandom(list) {
      const key = list.join('');
      if (key === lastRandom) return;
      lastRandom = key;
      random.innerHTML = cells(list.map((tok) => ({ tok })));
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
