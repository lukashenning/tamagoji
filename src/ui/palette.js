// Input panel: two 4×4 grids.
// Left ("Zuletzt"): the pinned signs ✅ ❌ ❓ + the most recently used emojis (yours and its).
// Right ("16 Uhr"): 16 random emojis that change every full hour.

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
  let sleepy = null; // "Zu müde...": { order, shown } while the 💤 keys are shown

  root.addEventListener('click', (e) => {
    const b = e.target.closest('.em');
    if (b) onPick(b.dataset.e);
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
     * "Zu müde...": all keys show 💤; `progress` 0…1 hides them one by one in a random order (a new
     * order each time it starts), so at 1 all are gone. Afterwards the normal keys come back.
     */
    setSleepy(progress) {
      if (!sleepy) {
        const order = [...Array(32).keys()];
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        sleepy = { order, shown: -1 };
        lastRecent = lastRandom = ''; // the normal keys are redrawn afterwards
      }
      const hidden = Math.min(32, Math.floor(Math.max(0, progress) * 33));
      if (hidden === sleepy.shown) return;
      sleepy.shown = hidden;
      const gone = new Set(sleepy.order.slice(0, hidden));
      const half = (from) => Array.from({ length: 16 }, (_, i) => `<span class="em zz">${gone.has(from + i) ? '' : '💤'}</span>`).join('');
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
