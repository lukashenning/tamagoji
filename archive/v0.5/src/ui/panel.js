// Test panel: look inside the creature and control time, settings and the creature itself.
// Plain text and simple numbers. See docs/05 §15.

import { SLIDERS, DEFAULT_PARAMS } from '../core/params.js';
import { EMO, PROFILE_DIMS, LABELS, strength } from '../core/emotions.js';
import { TIME, SLEEP, WAKE, BIRTH } from '../core/tokens.js';

const pct = (x) => (x * 100).toFixed(0) + '%';
const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
};
const tokLabel = (t) => (t === SLEEP ? 'sleep' : t === WAKE ? 'wake' : t);
const bar = (x) => `<span class="bar"><span style="width:${Math.round(Math.max(0, Math.min(1, x)) * 100)}%"></span></span>`;

export function buildPanel(root, h) {
  root.innerHTML = `
    <h2>Tamago-ji · test panel</h2>
    <div class="controls">
      <div class="row"><b>time</b>
        ${[1, 10, 60, 600].map((w) => `<button data-warp="${w}">×${w}</button>`).join('')}
        <button data-act="skip10">+10 min</button>
        <button data-act="skip60">+1 h</button>
        <button data-act="sleep">sleep now</button>
        <button data-act="wake">wake now</button>
      </div>
      <div class="row"><b>creature</b>
        <button data-act="export">export</button>
        <button data-act="import">import (replaces current)</button>
        <button data-act="reset" class="danger">reset</button>
        <span class="note"></span>
        <input type="file" accept="application/json,.json" hidden>
      </div>
      <div class="sliders">
        ${SLIDERS.map(
          (s) => `<label><span>${s.label}</span>
            <input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">
            <output data-for="${s.key}"></output></label>`,
        ).join('')}
        <button data-act="defaults">default settings</button>
      </div>
    </div>
    <div class="info"></div>`;

  const info = root.querySelector('.info');
  const fileInput = root.querySelector('input[type=file]');
  const note = root.querySelector('.controls .note');
  const resetBtn = root.querySelector('[data-act="reset"]');
  let noteTimer = null;
  let resetArmed = null;
  const showNote = (text) => {
    note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note.textContent = ''), 4000);
  };
  const disarmReset = () => {
    clearTimeout(resetArmed);
    resetArmed = null;
    resetBtn.textContent = 'reset';
    resetBtn.classList.remove('armed');
  };

  root.querySelector('.controls').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.warp) return h.setWarp(Number(b.dataset.warp));
    const act = b.dataset.act;
    if (act === 'skip10') h.skip(10 * 60000);
    if (act === 'skip60') h.skip(60 * 60000);
    if (act === 'sleep') h.sleepNow();
    if (act === 'wake') h.wakeNow();
    if (act === 'export') h.exportCreature();
    if (act === 'import') fileInput.click();
    if (act === 'reset') {
      // first click arms, second click (within 4 s) resets
      if (resetArmed) {
        disarmReset();
        h.reset();
        showNote('new creature born');
      } else {
        resetBtn.textContent = 'click again to delete this creature';
        resetBtn.classList.add('armed');
        resetArmed = setTimeout(disarmReset, 4000);
      }
    }
    if (act === 'defaults') h.setParams({ ...DEFAULT_PARAMS });
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) showNote(await h.importCreature(fileInput.files[0]));
    fileInput.value = '';
  });
  root.querySelectorAll('input[type=range]').forEach((inp) =>
    inp.addEventListener('input', () => h.setParam(inp.dataset.key, Number(inp.value))),
  );

  function syncControls(s) {
    root.querySelectorAll('[data-warp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.warp) === s.clock.warp));
    for (const sl of SLIDERS) {
      const inp = root.querySelector(`input[data-key="${sl.key}"]`);
      if (document.activeElement !== inp) inp.value = s.params[sl.key];
      root.querySelector(`output[data-for="${sl.key}"]`).textContent = s.params[sl.key];
    }
  }

  const live = { at: 0, data: null, mind: null }; // live rules, recomputed at most every 1.5 s

  return function update(s) {
    syncControls(s);
    const m = s.mind;
    const now = s.clock.now();
    const out = [];

    // ── now ──
    const state = m.awake
      ? `awake · ${m.turn === 'P' ? 'your turn' : 'its turn'}`
      : m.isRested(now)
        ? 'asleep · rested, about to wake'
        : `asleep · rested in ${mmss(m.sleep.restedAt - now)}`;
    const energy = m.energyAt(now);
    const frac = Math.max(0, Math.min(1, energy / m.capacity));
    const level = frac > 0.5 ? 'high' : frac > s.params.sleepyBelow ? 'mid' : 'low';
    out.push(`<section><h3>now</h3>
      <div>${new Date(now).toLocaleString()} ${s.clock.warp > 1 ? `<b>×${s.clock.warp}</b>` : ''}</div>
      <div>${state}${!m.awake && m.sleep ? ` · dream ${Math.max(0, m.dreamIndex(now) + 1)}/${m.sleep.count}` : ''}</div>
      <div class="energy ${level}${m.awake ? '' : ' charging'}">
        <span class="energy-bar"><span style="width:${(frac * 100).toFixed(1)}%"></span></span>
        <span class="energy-text">energy ${num(energy, 0)} / ${num(m.capacity, 0)}${m.awake ? '' : ' · recovering'}</span>
      </div>
      <div>stage ${m.stage} · complexity ${m.complexity} · knows ${m.vocab.size} emojis · ${m.sleepCount} sleeps
        · ${m.sessionInputs} inputs this session</div>
      <div>growth: maturity ${num(m.maturity, 1)}${m.stage < s.params.stageThresholds.length ? ` · next stage at ${s.params.stageThresholds[m.stage]}` : ' · fully grown'} · last session +${num(m.lastGain, 2)}</div>
      <div>character: ${m.character
        .map((e) => `<span class="character" title="weight ${num(m.charWeights.get(e) || 0)}">${e}</span><span class="dim">${num(m.charWeights.get(e) || 0, 1)}</span>`)
        .join(' ')}</div>
      ${s.save.engine !== s.engine ? `<div class="warn">saved with engine ${s.save.engine}, running ${s.engine}</div>` : ''}
    </section>`);

    // ── emotions ──
    const dom = m.dominantEmotion();
    out.push(`<section><h3>emotions</h3><table class="emo">${[...EMO, 'tiredness']
      .map((k) => {
        const v = k === 'tiredness' ? Math.max(0, 1 - m.energyAt(now) / m.capacity) : m.emo[k];
        const extra = k === 'unease' && v > 0.1 ? ` <i>(${m.uneaseCause})</i>` : '';
        return `<tr class="${dom && dom.name === k ? 'dom' : ''}"><td>${LABELS[k]}${extra}</td><td>${bar(v)}</td><td>${num(v)}</td></tr>`;
      })
      .join('')}</table></section>`);

    // ── why ──
    const why = s.why;
    const pred = m.awake ? m.predict() : null;
    const ev = m.lastEval;
    out.push(`<section><h3>why it said that</h3>
      ${
        why
          ? `<div>last move: <b>${why.mode}</b>${why.emotion && why.emotion.value >= 0.3 ? ` · feeling ${LABELS[why.emotion.name]}` : ''}</div>
             ${why.top3 ? `<div>options: ${why.top3.map(([t, p]) => `${tokLabel(t)} ${pct(p)}`).join(' · ')}</div>` : ''}`
          : '<div class="dim">no move since page load</div>'
      }
      ${
        ev && ev.signal
          ? `<div>you sent ${ev.tok}${ev.about && ev.about.length ? ' about its ' + ev.about.join('') : ev.tok === TIME ? ' (passing time)' : ''}</div>`
          : ev
            ? `<div>you sent ${ev.tok} — it expected ${ev.expected || 'nothing'} · surprise ${num(ev.surprise)}${ev.asked ? ' · answer to its ❓ (×' + s.params.questionBoost + ')' : ''}</div>`
            : ''
      }
      ${
        pred
          ? `<div>voices (trust × confidence): ${Object.entries(pred.voices)
              .map(([n, v]) => `${n} ${num(m.trust[n])}×${num(v.conf)}`)
              .join(' · ')}${pred.habit ? ` · <b>habit</b> ${pred.habit.ctx.join('')}→${pred.habit.next}` : ''}</div>
             <div>it expects next: ${[...pred.dist].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, p]) => `${t} ${pct(p * pred.conf)}`).join(' · ') || '–'}</div>`
          : ''
      }
    </section>`);

    // ── learned (live) ──
    if (!live.data || live.mind !== m || Date.now() - live.at > 1500) {
      live.data = m.findRules();
      live.mind = m;
      live.at = Date.now();
    }
    const { rules: liveRules, sequences, variants } = live.data;
    const pill = (txt) => `<span class="pill">${txt}</span>`;
    const ruleTxt = (r) => (r.structural ? `${r.next} ${pct(r.p)}` : `${r.ctx.join('')}→${r.next} ${pct(r.p)}`);
    const groups = new Map();
    for (const r of liveRules) {
      const key = r.structural ? 'structural' : r.ctx.length;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const groupRows = [...groups.keys()]
      .sort((a, b) => (a === 'structural' ? 99 : a) - (b === 'structural' ? 99 : b))
      .map((key) => {
        const rs = groups.get(key).sort((a, b) => b.w - a.w);
        const label = key === 'structural' ? 'structural' : `after ${key} emoji${key > 1 ? 's' : ''}`;
        return `<tr><td>${label}</td><td>${rs.slice(0, 12).map((r) => pill(ruleTxt(r))).join(' ')}${rs.length > 12 ? ` <span class="dim">+${rs.length - 12}</span>` : ''}</td></tr>`;
      });
    // known sequences: longer chains it can continue (also those that agree with shorter rules)
    const seqs = sequences
      .map((r) => ({ txt: r.ctx.join('') + r.next, len: r.ctx.length + 1, w: r.w }))
      .sort((a, b) => b.len - a.len || b.w - a.w);
    const shown = [];
    for (const q of seqs) if (!shown.some((x) => x.txt.endsWith(q.txt))) shown.push(q);
    const lookback = m.stageInfo.context;
    const habits = [...m.activeHabits.values()];
    out.push(`<section><h3>learned</h3>
      <div>looks back <b>${lookback}</b> emoji${lookback > 1 ? 's' : ''} (stage ${m.stage}) · patterns it knows from up to 8 back, it uses up to ${lookback}</div>
      <h4>short-term memory <span class="dim">(live · fades over time and by half at each sleep)</span></h4>
      <table class="rules">${groupRows.join('') || '<tr><td class="dim">no confident rules yet</td></tr>'}</table>
      <div>known sequences: ${shown.length ? shown.slice(0, 12).map((q) => pill(q.txt)).join(' ') + (shown.length > 12 ? ` <span class="dim">+${shown.length - 12}</span>` : '') : '–'}</div>
      <div>variants (one context, several solid answers): ${variants}</div>
      <h4>long-term memory</h4>
      <div>habits: ${habits.length ? habits.map((x) => pill(`${x.ctx.join('')}→${x.next} ${pct(x.strength)}`)).join(' ') : '–'}</div>
      <div>narratives <span class="dim">(chains of rules, last sleep)</span>: ${m.narratives.length ? m.narratives.slice(0, 6).map((n) => pill(n.join(''))).join(' ') : '–'}</div>
      <div>sleep brain: ${m.gut.trained ? `knows ${m.gut.vocab.length} emojis, trained on ${m.gut.examplesSeen} examples` : 'not trained yet (first sleep)'} · déjà vu: ${m.dv.idx.size} remembered situations · whole conversation: ${m.seq.length} emojis</div>
    </section>`);

    // ── associations ──
    const assoc = PROFILE_DIMS.map((k, i) => {
      const top = [...m.profiles]
        .map(([key, pr]) => [key, pr.v[i] * strength(pr, s.params.repsToLearn), pr])
        .filter(([, score, pr]) => score > 0.04 && pr.n >= s.params.repsToLearn)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      return `<tr><td>${LABELS[k]}</td><td>${top.map(([key, score]) => `<span class="pill">${key.replace(/ /g, '')} ${num(score)}</span>`).join(' ') || '<span class="dim">–</span>'}</td></tr>`;
    });
    out.push(`<section><h3>emoji ↔ emotion associations <span class="dim">(compared to its usual mood)</span></h3><table class="assoc">${assoc.join('')}</table></section>`);

    // ── history ──
    const hist = s.save.history.slice(-160).map((e) => {
      if (e.tok === BIRTH) return `<span class="h-sys">birth</span>`;
      if (e.tok === SLEEP) return `<span class="h-sys">💤 ${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      if (e.tok === WAKE) return `<span class="h-sys">☀︎ ${e.m === 'manual' ? 'woken' : 'wakes'} ${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      const cls = e.who === 'C' ? 'h-c' : 'h-p';
      const t = e.tok;
      const mark = e.m === 'elab' || e.m === 'elab-end' ? '›' : e.m === 'retry' ? '↺' : e.m && e.m.startsWith('game') ? '◇' : '';
      return `<span class="${cls}" title="${e.who === 'C' ? 'creature' : 'you'}${e.m ? ' · ' + e.m : ''}">${t}${mark}</span>`;
    });
    out.push(`<section><h3>history <span class="dim">(${s.save.history.length} entries · <span class="h-c">creature</span> <span class="h-p">you</span>)</span></h3>
      <div class="history">${hist.join('')}</div></section>`);

    info.innerHTML = out.join('');
  };
}
