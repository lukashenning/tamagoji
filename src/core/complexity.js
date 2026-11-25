// Complexity (D75): how many signs it knows, and how orderly it uses them. Measured on its dreams,
// which show what it produces on its own. After a dream of at least complexityDreamMin learned signs,
// the last complexityDreamMin of them are measured:
//  - known (K): how many different signs appear at least complexityMinUses times AND at least once
//    come right where they usually come (after a sign they usually follow), so surprise signs that
//    happen to recur don't count
//  - order (O, 0…1): how often the next sign could have been guessed from what usually follows the
//    previous one elsewhere in the window (leave-one-out, so a sign seen once can never look ordered)
//  - complexity = K × O: roughly "the number of signs it uses in an orderly way"

/** @param {string[]} signs @param {number} minUses @returns {{ known: number, order: number, value: number }} */
export function measureComplexity(signs, minUses = 3) {
  const uses = new Map();
  for (const x of signs) uses.set(x, (uses.get(x) || 0) + 1);
  const placed = new Set(); // signs that at least once came where they usually come

  // followers: A -> Map(B -> how often B came right after A)
  const next = new Map();
  for (let i = 0; i + 1 < signs.length; i++) {
    const [a, b] = [signs[i], signs[i + 1]];
    if (!next.has(a)) next.set(a, new Map());
    next.get(a).set(b, (next.get(a).get(b) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i + 1 < signs.length; i++) {
    const row = next.get(signs[i]);
    const mine = row.get(signs[i + 1]) - 1; // what followed A everywhere else
    if (mine < 1) continue;
    let best = 0;
    let ties = 0;
    for (const [b, n] of row) {
      const c = b === signs[i + 1] ? mine : n;
      if (c > best) [best, ties] = [c, 1];
      else if (c === best) ties++;
    }
    if (mine === best) {
      hits += 1 / ties; // a tie for "most common" counts as a shared guess
      placed.add(signs[i + 1]);
    }
  }
  let known = 0;
  for (const x of placed) if (uses.get(x) >= minUses) known++;
  const order = signs.length > 1 ? hits / (signs.length - 1) : 0;
  return { known, order, value: known * order };
}
