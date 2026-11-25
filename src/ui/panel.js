// Test panel: look inside the creature and control time, settings and the creature itself.
// Plain text and simple numbers. See docs/08 (the sign engine).

import { SLIDERS, DEFAULT_PARAMS } from '../core/params.js';
import { SLEEP, WAKE, BIRTH } from '../core/tokens.js';
import { melodyText, keyOf, KEY_NAMES } from '../core/melody.js';
import { voiceFor, voiceText } from '../core/voice.js';
import { soundOn } from './sound.js';
import { PART_EMOJI, lookOf, partsShown, levelFor, moveText, inkColor } from '../core/look.js';

const pct = (x) => (x * 100).toFixed(0) + '%';
const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
};
const tokLabel = (t) => (t === SLEEP ? 'sleep' : t === WAKE ? 'wake' : t);
const pill = (txt) => `<span class="pill">${txt}</span>`;

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
        <button data-act="sound"></button>
        <button data-act="hear">▶ its voice</button>
        <button data-act="instruments">▶ archetypes</button>
        <span class="note"></span>
      </div>
      <div class="row"><b>level</b>
        <button data-level="0">auto</button>
        ${[1, 2, 3, 4, 5, 6].map((n) => `<button data-level="${n}">${n}</button>`).join('')}
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
  let noteTimer = null;
  const showNote = (text) => {
    note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note.textContent = ''), 4000);
  };

  root.querySelector('.controls').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.warp) return h.setWarp(Number(b.dataset.warp));
    if (b.dataset.level) return h.setParam('levelOverride', Number(b.dataset.level)); // 0 = from complexity
    const act = b.dataset.act;
    if (act === 'skip10') h.skip(10 * 60000);
    if (act === 'skip60') h.skip(60 * 60000);
    if (act === 'sleep') h.sleepNow();
    if (act === 'wake') h.wakeNow();
    if (act === 'export') h.exportCreature();
    if (act === 'import') fileInput.click();
    if (act === 'reset') {
      h.reset(); // right away, no confirmation
      showNote('new creature born');
    }
    if (act === 'defaults') h.setParams({ ...DEFAULT_PARAMS });
    if (act === 'sound') h.toggleSound();
    if (act === 'hear') h.hearVoice();
    if (act === 'instruments') h.hearInstruments(showNote);
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) showNote(await h.importCreature(fileInput.files[0]));
    fileInput.value = '';
  });
  root.querySelectorAll('input[type=range]').forEach((inp) =>
    inp.addEventListener('input', () => h.setParam(inp.dataset.key, Number(inp.value))),
  );

  const soundBtn = root.querySelector('[data-act="sound"]');
  function syncControls(s) {
    soundBtn.textContent = soundOn() ? 'sound on' : 'sound off';
    root.querySelectorAll('[data-warp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.warp) === s.clock.warp));
    root.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', Number(b.dataset.level) === (s.params.levelOverride || 0)));
    for (const sl of SLIDERS) {
      const inp = root.querySelector(`input[data-key="${sl.key}"]`);
      if (document.activeElement !== inp) inp.value = s.params[sl.key];
      root.querySelector(`output[data-for="${sl.key}"]`).textContent = s.params[sl.key];
    }
  }

  const live = { at: 0, data: null, mind: null }; // pattern lists, recomputed at most every 1.5 s

  return function update(s) {
    syncControls(s);
    const m = s.mind;
    const p = s.params;
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
    const level = frac > 0.5 ? 'high' : frac > p.sleepyBelow ? 'mid' : 'low';
    out.push(`<section><h3>now</h3>
      <div>${new Date(now).toLocaleString()} ${s.clock.warp > 1 ? `<b>×${s.clock.warp}</b>` : ''}</div>
      <div>${state}${!m.awake && m.sleep ? ` · dream ${Math.max(0, m.dreamIndex(now) + 1)}/${m.sleep.count}` : ''}</div>
      <div class="energy ${level}${m.awake ? '' : ' charging'}">
        <span class="energy-bar"><span style="width:${(frac * 100).toFixed(1)}%"></span></span>
        <span class="energy-text">energy ${num(energy, 0)} / ${num(m.capacity, 0)}${m.awake ? '' : ' · recovering'}</span>
      </div>
      <div>${m.sleepCount} sleeps · ${m.sessionInputs} inputs this session · ${m.totalInputs} in total · ✅ ${m.stats.yes} · ❌ ${m.stats.no}</div>
      <div>seed character: <span class="character">${m.character.join(' ')}</span></div>
      <div>save: ${(s.saveInfo.bytes / 1024).toFixed(0)} KB of ${p.maxSaveMB} MB${s.save.pruned ? ` · ${s.save.pruned} oldest entries dropped so far` : ''}</div>
      ${s.save.engine !== s.engine ? `<div class="warn">saved with engine ${s.save.engine}, running ${s.engine}</div>` : ''}
    </section>`);

    // ── why: its last move and its expectation now ──
    const why = s.why;
    const ex = m.expect();
    const sp = m.surpriseChance();
    const ev = m.lastEval;
    const ctx = m.context();
    const levelRows = ex.levels
      .slice()
      .reverse()
      .map((lv) => {
        const links = lv.links
          .slice()
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 6)
          .map(([t, w]) => pill(`${t} ${w > 0 ? '+' : ''}${num(w, w % 1 ? 1 : 0)}`))
          .join(' ');
        return `<tr><td>level ${lv.L} ×${num(lv.weight, lv.weight % 1 ? 2 : 0)}</td><td>${lv.ctx.join('')} → ${links || '<span class="dim">never seen</span>'}</td></tr>`;
      })
      .join('');
    const wc = m.awake ? m.waitChance(ex.probs) : 0;
    out.push(`<section><h3>why it said that · what it expects</h3>
      <div>last move: ${why ? `<b>${why.mode}</b>` : '<span class="dim">none since page load</span>'}</div>
      ${ev && m.lastPlayer === 'sign' ? `<div>your ${ev.tok}: it had expected it ${pct(ev.p)}${ev.top && ev.top !== ev.tok ? ` · it expected ${ev.top} (${pct(ev.pTop)})` : ''}</div>` : ''}
      ${m.lastEffect ? `<div>your last ✓/✗: ${m.lastEffect}</div>` : ''}
      <h4>votes for what follows ${ctx.join('') || '<span class="dim">(nothing yet)</span>'} <span class="dim">(link weights; a level's vote = level weight × log2(1 + weight))</span></h4>
      <table class="rules">${levelRows || '<tr><td class="dim">no context yet</td></tr>'}</table>
      <div>expects: ${ex.probs.slice(0, 6).map(([t, q]) => `${t} ${pct(q)}`).join(' · ') || '<span class="dim">nothing (uses its seed or a surprise)</span>'}</div>
      <div>surprise <b>${pct(sp.total)}</b> = base ${pct(sp.base)} + repetition ${pct(sp.repetition)}${sp.rep.k ? ` <span class="dim">(${sp.rep.m} signs repeat a ${sp.rep.k}-sign pattern)</span>` : ''} + waiting ${pct(sp.waiting)}${m.waitStreak ? ` <span class="dim">(your ☐ ×${m.waitStreak})</span>` : ''} · its ☐ ${pct(wc)}</div>
    </section>`);

    // ── association memory ──
    if (!live.data || live.mind !== m || Date.now() - live.at > 1500) {
      const byL = [];
      for (let L = 1; L <= p.levels; L++) byL.push([L, m.assoc.strongest(L, 10)]);
      live.data = { byL, sizes: m.assoc.sizes() };
      live.mind = m;
      live.at = Date.now();
    }
    const strongRows = live.data.byL
      .filter(([, xs]) => xs.length)
      .map(([L, xs]) => `<tr><td>level ${L} <span class="dim">(${live.data.sizes[L]})</span></td><td>${xs.map((x) => pill(`${x.ctx.join('')}→${x.sign} ${x.w > 0 ? '+' : ''}${num(x.w, x.w % 1 ? 1 : 0)}`)).join(' ')}</td></tr>`)
      .join('');
    out.push(`<section><h3>association memory <span class="dim">(live)</span></h3>
      <div class="dim">Your sign: +${p.repeatWeight}. ✓ +${p.yesWeight}, ✗ −${p.noWeight} on the last real sign. Dreams +${p.dreamWeight}. Level 1 always; levels 2–4 only where no ✓ ✗ ☐ came between the signs. (number) = contexts known on that level.</div>
      <table class="rules">${strongRows || '<tr><td class="dim">nothing learned yet</td></tr>'}</table>
      <div>${m.seq.length} real signs in the conversation · ${m.stats.takenBack} taken back · last dream: learned ${m.stats.dreamLearned} dreamed signs</div>
      <div><b>complexity</b> ${
        m.complexity
          ? `${num(m.complexity.value, 1)} <span class="dim">= ${m.complexity.known} signs known (used ≥ ${p.complexityMinUses}×) × ${Math.round(m.complexity.order * 100)}% order, from its last ${p.complexityDreamMin} dream signs${
              m.complexityLog.length > 1 ? ` · earlier: ${m.complexityLog.slice(-8, -1).map((c) => num(c.value, 1)).join(' → ')}` : ''
            }</span>`
          : `<span class="dim">not measured yet (needs a dream of ${p.complexityDreamMin}+ signs, about ${Math.round((p.complexityDreamMin * p.dreamIntervalSec) / 60)} min of sleep)</span>`
      }</div>
    </section>`);

    // ── top signs → parts (look) & voice ──
    const ranked = m.topSigns();
    const top = ranked.slice(0, 10).map((r, i) => pill(`${i < p.seats ? '' : '<span class="dim">'}${r.tok} ${r.uses}${i < p.seats ? '' : '</span>'}`)).join(' ');
    const lvl = m.shownLevel();
    const shown = partsShown(lvl);
    const styles = (part) => s.styleCount?.(part) || 1; // how many styles the art has for that part
    const partRows = m.seats
      .map((x, i) => {
        const l = lookOf(x.tok, styles(x.seat));
        const off = i >= shown ? ' class="dim"' : '';
        return `<tr${off}><td>${i + 1}. ${PART_EMOJI[i]} ${x.seat}</td><td>${x.tok} · style ${l.style + 1}/${styles(x.seat)} · <span class="swatch" style="background:${l.color}"></span> gbc1 #${l.colorIndex + 1}${inkColor(l.color) !== l.color ? ` <span class="dim">(drawn darker</span> <span class="swatch" style="background:${inkColor(l.color)}"></span><span class="dim">)</span>` : ''} · used ${x.uses}× · variant ${m.pose[i]}${i >= shown ? ' · from level ' + i : ''}</td></tr>`;
      })
      .join('');
    const lastC = (() => {
      for (let i = s.save.history.length - 1; i >= 0; i--) if (s.save.history[i].who === 'C') return s.save.history[i].tok;
      return null;
    })();
    const auto = m.complexity ? `complexity ${num(m.complexity.value, 1)} → level ${levelFor(m.complexity.value, p.levelAt)}` : 'no complexity measured yet → level 1';
    out.push(`<section><h3>look · parts · voice</h3>
      <div><b>level ${lvl}</b> <span class="dim">(${p.levelOverride ? 'set in the panel; auto would be ' + m.level : 'auto'} · ${auto} · levels 2–6 from complexity ${p.levelAt.join(' / ')})</span></div>
      <div>pose now: <b>${moveText(m.pose)}</b>${lastC && m.moves.has(lastC) ? ` <span class="dim">· move of its sign ${lastC}: ${moveText(m.moves.get(lastC))} · ${m.moves.size} signs have moves</span>` : ''}</div>
      <div>top signs (its last ${p.outputWindow} outputs, ${m.outputs.length} so far): ${top || '–'}</div>
      <h4>parts <span class="dim">(1st sign → eyes, 2nd → hat, …; updated at birth and after each sleep; dim = not shown at this level)</span></h4>
      <table class="rules">${partRows}</table>
      <div class="dim">voice: ${voiceText(voiceFor(m.seats))}</div>
      ${lastC ? `<div class="dim">melody of its last sign ${lastC}: ${melodyText(lastC)} (${KEY_NAMES[keyOf(lastC)]} major)</div>` : ''}
    </section>`);

    // ── history ──
    const offset = Math.max(0, s.save.history.length - 160);
    const hist = s.save.history.slice(-160).map((e, i) => {
      if (e.tok === BIRTH) return `<span class="h-sys">birth</span>`;
      if (e.tok === SLEEP) return `<span class="h-sys">💤 ${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      if (e.tok === WAKE) return `<span class="h-sys">☀︎ ${e.m === 'manual' ? 'woken' : 'wakes'} ${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      const cls = e.who === 'C' ? 'h-c' : 'h-p';
      const mark = e.m === 'surprise' ? '✦' : e.m === 'seed' ? '°' : '';
      const back = m.takenBack.has(offset + i) ? ' taken-back' : '';
      return `<span class="${cls}${back}" title="${e.who === 'C' ? 'creature' : 'you'}${e.m ? ' · ' + e.m : ''}${back ? ' · taken back' : ''}">${e.tok}${mark}</span>`;
    });
    out.push(`<section><h3>history <span class="dim">(${s.save.history.length} entries · <span class="h-c">creature</span> <span class="h-p">you</span>)</span></h3>
      <div class="history">${hist.join('')}</div></section>`);

    info.innerHTML = out.join('');
  };
}
