# Complexity fixes: what makes a teacher grow (2026-11-26)

Follow-up to `2026-11-25-complexity-by-player-style.md`. Goal: a consistent teacher grows over days
and reaches level 5 (complexity ≥ 21) after about 2 days; small vocabulary, shared signs,
contradicting, ❓-only and repetition stay low; a random babbler scores clearly below the teacher.

All runs: `tests/styles.js` (10 creatures per style, 4 days, 4 sessions a day), same seeds. New
mechanisms are parameters whose defaults keep engine 1.0 exactly as it was (the baseline numbers
below are identical to the 2026-11-25 report). **No defaults were changed.**

## What was added (all experiment parameters, default off)

| parameter | what it does |
|---|---|
| `fadeSpare` | strong links fade slower: a link of strength w fades (1 + k·w) times slower |
| `dreamTemperature` | chaos in dreams (0 = as awake) |
| `dreamSurprise` | base surprise chance in dreams (null = as awake) |
| `dreamJump` | chance that a dream surprise is a **random sign it knows a follower for** instead of a keyboard emoji |
| `crossAssociation` | the user's idea, awake: with this chance it says what follows the sign it picked, instead of that sign |
| `dreamCrossAssociation` | the same in dreams |

`tests/styles.js` got: a new style **"teacher, only newest chains"** (grows the language but only
starts its 2 newest chains, so it never revisits old ones), an awake metric **"continues your
chain"** (how often its reply right after your chain sign is that sign's next sign), **"own"**
(different real signs it says per session), per-session trajectory, `SIM.creatures`, a compact
result in `globalThis.SIM_RESULT`, and an `SIM.onSleep` hook. `tests/play.js` takes `SIM.params`,
`tests/proximity.js` takes `SIM.variants`.

## Single changes (complexity at the end of day 1–4, teacher with ✓/✗ unless noted)

| change | teacher d1–d4 | babbler d4 | small d4 | verdict |
|---|---|---|---|---|
| baseline | 10.3 10.1 11.1 8.9 | 10.1 | 6.6 | plateau, babbler = teacher |
| fading 0.01 | 10.9 9.6 9.8 8.9 | 11.9 | 7.3 | no help |
| fading 0.005 | 11.7 13.2 15.3 12.7 | **6.8** (order 20%) | 6.9 | memory kept, babbler fixed, dreams still circle |
| fading 0.003 | 9.8 13.0 14.3 15.0 | **3.8** (order 13%) | 6.9 | same, slower start |
| fadeSpare 1 / 3 | 9.5 / 11.1 (d4) | 14.8 / 12.2 | 6.7 / 7.2 | helps the babbler more than the teacher: rejected |
| dream jump 1 | 13.6 14.3 16.2 16.0 | 14.2 | 9.7 | dreams cover memory, order ↑ (76%), but babbler ↑ too |
| dream jump 0.5 | 12.8 11.5 13.5 12.2 | 11.2 | 8.7 | half the effect |
| dream surprise 0.05 / 0.2 | 10.2 / 9.4 (d4) | 10.5 / 7.9 | 8.2 / 5.9 | small effects |
| dream chaos 1.5 / 2 | 7.9 / 8.1 (d4) | 12.0 / 10.4 | 6.9 / 7.2 | worse |
| dream learning 0.05 / 0.2 | 8.1 / 11.0 (d4) | 8.9 / 13.5 | 6.6 / 7.5 | small effects |
| dream proximity 0 | 12.1 12.1 11.3 10.6 | 11.2 | 7.5 | a bit more order |

Two problems, two fixes: **slower fading** lets memory hold the whole language (and makes random
babble a dense tangle, so its dreams lose order), and **dream jumps** let the dream visit all of
memory instead of circling its strongest part. Each alone is not enough; together they are.

## Combinations (all styles)

Complexity at the end of day 1 / 2 / 3 / 4 · known × order on day 4 · creatures at level 5 (of 10) on day 2 and day 4.

| style | baseline | **fading 0.005 + jump 1 (recommended)** | fading 0.01 + jump 1 | fading 0.005 + jump 1 + proximity 0 |
|---|---|---|---|---|
| teacher (✓/✗) | 10.3 10.1 11.1 8.9 · 13×70% · 0/0 | **13.1 19.0 24.8 26.2 · 40×65% · 2/9** | 15.4 20.7 23.9 25.2 · 34×73% · 4/9 | 17.8 23.4 27.3 32.4 · 40×81% · 8/10 |
| teacher, only newest chains | 8.0 9.6 7.8 6.7 | 13.0 21.0 28.8 32.8 · 6/10 | 12.9 22.6 29.1 34.2 · 9/10 | 14.1 24.0 30.5 35.6 · 8/10 |
| teacher without ✓/✗ | 11.0 10.4 8.8 8.5 | 14.2 21.8 29.6 31.6 · 6/10 | 15.4 22.8 28.2 31.0 · 8/10 | 16.4 24.4 29.8 35.3 · 9/10 |
| small vocabulary | 7.7 6.7 7.2 6.6 | 8.7 9.4 9.4 9.4 | 9.2 9.7 9.5 9.2 | 10.0 10.4 10.3 10.6 |
| shared signs | 5.7 4.9 5.1 5.5 | 6.9 8.2 8.7 8.7 | 7.2 8.7 8.8 8.7 | 8.1 9.1 9.7 10.1 |
| contradicting | 9.1 7.3 7.0 5.9 | 10.9 9.9 9.5 8.9 | 12.4 10.3 9.6 9.4 | 13.1 10.8 11.1 10.5 |
| random babbler | 7.2 9.4 10.5 10.1 · 19×52% | **11.6 9.7 6.6 7.2 · 35×20%** | 13.2 13.8 13.1 13.4 · 35×38% | 13.2 11.3 8.5 8.6 |
| ❓ presser | 4.4 3.5 3.5 3.3 | 4.6 5.4 5.9 6.0 | 4.9 6.0 6.4 6.3 | 5.7 7.8 9.0 9.4 |
| repeater | 0.7 0.6 0.6 0.7 | ~0.7 | ~0.7 | ~0.7 |
| teacher, then only ❓ | 8.6 7.5 6.4 5.6 | 14.6 22.4 23.8 24.0 | 15.9 21.1 19.4 19.0 | 16.3 23.6 24.2 24.3 |
| wakes it after 10 min | never measured | never measured | never measured | never measured |

Trajectory by session, recommended, teacher: 10 11 12 13 16 17 19 19 21 22 23 25 … (steady growth;
baseline: 8 9 9 10 11 10 10 10 10 9 …).

Awake, `tests/styles.js` teacher: continues your chain 37% of its replies (baseline 37%); it uses
35 different own signs per session (baseline 29).

## The user's idea: cross-association

With chance r, instead of the sign X it picked, it pretends X was said and says what it expects after
X (so in A B C D, after A it sometimes says C). Implemented in `decide()` (expectation and familiar
picks) and optionally in dreams.

| rate | teacher d4 | small d4 | babbler d4 | awake: continues your chain (teacher) | own signs / session |
|---|---|---|---|---|---|
| 0 (baseline) | 8.9 | 6.6 | 10.1 | 37% | 29 |
| 0.1 awake | – | 7.0 | 9.7 | small: 51% (was 54%) | – |
| 0.2 awake | 6.9 | 7.3 | 11.7 | 29% | 28 |
| 0.3 awake | – | 6.7 | 11.7 | small: 40% (was 54%) | – |
| 0.1 in dreams | – | 6.0 | 7.4 | – | – |
| 0.2 in dreams | 6.3 (order 49%) | 4.7 | 7.6 | 37% | 31 |
| 0.2 awake + dreams | 6.7 (order 48%) | 5.3 | 8.2 | 31% | 30 |

(– : that run covered only the small-vocabulary and babbler styles because of the time box.)

On top of the recommended setting (fading 0.005 + dream jump 1), awake only:

| rate | teacher d1–d4 | at level 5 d2 / d4 | babbler d4 | small d4 | contradicting d4 | continues your chain (teacher) |
|---|---|---|---|---|---|---|
| 0 | 13.1 19.0 24.8 26.2 | 2 / 9 | 7.2 | 9.4 | 8.9 | 37% |
| 0.1 | 11.9 19.3 26.2 31.3 | 2 / 10 | 7.2 | 9.3 | 9.5 | 35% |
| 0.2 | 13.7 19.5 27.9 28.2 | 3 / 10 | 6.9 | 9.3 | 7.4 | 32% |

Here it is roughly neutral for complexity (day 2 unchanged; day 4 a little higher, within the
creature-to-creature spread) and costs 2–5 points of chain continuation.
In `tests/proximity.js` (awake, scripted player), cross-association 0.2 lowers "continues your
chain" from 48.5% to 41.6%; what it has learned is unchanged (top choice after a chain 98.6%).

**Verdict:** it does not meaningfully help complexity at any rate tried. Awake it mostly makes the creature
skip a sign, so it continues your chain less often (−8 points at 0.2) without using more different
signs; it only makes it "jump ahead", which can feel clever when it lands, but the measure and the
babbler gain from it. In dreams it is clearly harmful: skipping signs teaches A → C shortcuts and
the dream order drops from ~70% to ~50%. If you like the feel, 0.1 awake only is harmless; don't
use it in dreams.

## Rule checks and sequence learning (recommended setting)

- `tests/play.js` with fading 0.005 + dream jump 1: **all rules held** (its moves: expectation 62%,
  surprise 13%, ✓ 9%, seed 8%).
- `tests/proximity.js` (40 creatures × 1500 steps; its scripted player says a random sign 5% of the time):

| setting | in play: continues your chain | next after chain: expected / top choice | next after 1 sign | previous after 1 sign |
|---|---|---|---|---|
| baseline | 48.5% | 93.3% / 97.5% | 82.2% | 17.7% |
| **recommended** | **37.3%** | **78.4% / 98.1%** | **53.3%** | 24.6% |
| cross-association 0.2 | 41.6% | 93.4% / 98.6% | 82.4% | 16.5% |
| recommended + cross 0.2 | 32.0% | 76.0% / 95.8% | 52.6% | 24.1% |

Its **top choice** after a learned chain stays at 98%, but it is less sure (78% instead of 93%), and
after a single sign it knows less clearly what comes next. Reason: with slow fading the player's
random signs and the dreams' links stay in memory much longer, so there are more competing links.
In the styles simulation the teacher's awake continuation did not change (37%).

## Recommendation

**`decayPerTurn: 0.005` (was 0.03) and `dreamJump: 1` (new).** Keep everything else.

In plain words:
- **Forgetting is 6× slower.** Something you taught it once stays about 200 of your turns (2–3
  sessions) instead of 33; a chain you use regularly stays for days. So a growing language really
  accumulates in its memory.
- **In dreams, a surprise becomes a memory jump.** Instead of a random keyboard emoji, a dream
  surprise is a random sign it knows something about. From there it dreams on along what it learned.
  So over a night it visits all of its memory, not only its favourite chains.
- Because random babble now stays in memory long enough to become a dense tangle (every sign
  followed by many different signs), the babbler's dreams lose their order and its complexity
  sinks (~7 on day 4, order 20%) while the teacher keeps growing (26 on day 4).

| | |
|---|---|
| **Pros** | teacher grows every session (10 → 19 on day 2 → 26 on day 4, 9/10 at level 5 on day 4); babbler clearly below and shrinking; small vocabulary stagnates (~9); shared signs and contradicting stay low (contradicting shrinks 11 → 9); repeater stays at 1; only two numbers change, one of them a single new rule; all play.js rules hold |
| **Cons** | level 5 after 2 days only for 2/10 teachers (mean 19 = level 4; with `levelAt` [6, 10, 14, 19] the mean teacher would reach level 5 on day 2, but that is only a threshold choice); a teacher who stops teaching (only ❓ from day 3) no longer shrinks within 2 days (24, kept by dreams); ❓-only rises slightly (3 → 6); a teacher who never revisits old chains still grows as much (dream jumps keep old chains alive for it), so revisiting is not rewarded; awake predictions after a single sign are less sure (proximity.js 82% → 53%) |
| **✓/✗** | still no measurable benefit (the teacher without ✓/✗ is even a bit higher) |

Promising next steps if wanted: `proximityWeight: 0` on top raises the teacher to 23 on day 2 (8/10
at level 5), but also lifts ❓-only to 9 and small vocabulary to 10.6; a lower `levelAt` for level 5
(≈ 19); and making fading run partly on sleep/time so "stopping teaching" shrinks it again.
