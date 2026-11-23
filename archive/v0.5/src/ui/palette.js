// Input panel (docs/05 §17): two 5×5 grids.
// Left: frequently used: the five elemental signs (pinned) + your most used emojis.
// Right: 25 random emojis, reshuffled after every input. Always includes the creature's
// newest emojis, so you can pick up what it introduces.

const cells = (list) => list.map((e) => `<span class="em${e.pinned ? ' pinned' : ''}" data-e="${e.tok}">${e.tok}</span>`).join('');

export function buildPalette(root, { onPick }) {
  root.innerHTML = `
    <div class="kb-half"><div class="kb-title">frequently used</div><div class="kb-grid kb-frequent"></div></div>
    <div class="kb-half"><div class="kb-title"></div><div class="kb-grid kb-random"></div></div>`;
  const frequent = root.querySelector('.kb-frequent');
  const random = root.querySelector('.kb-random');

  root.addEventListener('click', (e) => {
    const b = e.target.closest('.em');
    if (b) onPick(b.dataset.e);
  });

  return {
    /** @param {string[]} pinned @param {string[]} list */
    setFrequent(pinned, list) {
      frequent.innerHTML = cells([...pinned.map((tok) => ({ tok, pinned: true })), ...list.map((tok) => ({ tok }))]);
    },
    /** @param {string[]} list */
    setRandom(list) {
      random.innerHTML = cells(list.map((tok) => ({ tok })));
    },
    setLocked(locked) {
      root.classList.toggle('locked', locked);
    },
  };
}
