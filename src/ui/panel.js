// Test panel: look inside the creature and control time, settings and the creature itself.
// Plain text and simple numbers. See docs/07.

import { SLIDERS, DEFAULT_PARAMS } from '../core/params.js';
import { ASK, SLEEP, WAKE, BIRTH } from '../core/tokens.js';
import { LOOK_SLOTS } from '../core/mind.js';
import { melodyText, keyOf, KEY_NAMES } from '../core/melody.js';
import { voiceFor, voiceText } from '../core/voice.js';
import { soundOn } from './sound.js';

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

    // ── why ──
    const why = s.why;
    const pred = m.awake ? m.predict() : null;
    const ev = m.lastEval;
    out.push(`<section><h3>why it said that</h3>
      ${
        why
          ? `<div>last move: <b>${why.mode}</b>${why.repetition !== undefined ? ` <span class="dim">· recent repetition ${pct(why.repetition)}</span>` : ''}</div>
             ${why.top3 ? `<div>options: ${why.top3.map(([t, q]) => `${tokLabel(t)} ${pct(q)}`).join(' · ')}</div>` : ''}`
          : '<div class="dim">no move since page load</div>'
      }
      ${
        ev && ev.signal
          ? `<div>you sent ${ev.tok}${ev.about && ev.about.length ? ' about its ' + ev.about.join('') : ev.tok === ASK ? (ev.streak > 1 ? ` (${ev.streak}× in a row)` : '') : ''}</div>`
          : ev
            ? `<div>you sent ${ev.tok} — it expected ${ev.expected || 'nothing'}${ev.expected ? ` (${pct(ev.sure)} sure)` : ''}${ev.asked ? ' · answer to its ❓ (×' + p.questionBoost + ')' : ''}</div>`
            : ''
      }
      ${
        pred
          ? `<div>it expects next: ${
              [...pred.dist].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, q]) => `${t} ${pct(q * pred.conf)}`).join(' · ') || '–'
            } <span class="dim">(based on the last ${pred.L} emoji${pred.L === 1 ? '' : 's'} · ${pct(pred.conf)} backed by patterns)</span></div>`
          : ''
      }
    </section>`);

    // ── pattern memory (live) ──
    if (!live.data || live.mind !== m || Date.now() - live.at > 1500) {
      const minW = p.repsToLearn * 0.75;
      const byL = [];
      for (let L = 1; L <= p.contextMax; L++) byL.push([L, m.mem.patterns(L, 0.5, minW)]);
      live.data = { byL };
      live.mind = m;
      live.at = Date.now();
    }
    const rows = live.data.byL
      .filter(([, ps]) => ps.length)
      .map(([L, ps]) => `<tr><td>after ${L} emoji${L > 1 ? 's' : ''}</td><td>${ps.slice(0, 12).map((x) => pill(`${x.ctx.join('')}→${x.next} ${pct(x.share)}`)).join(' ')}${ps.length > 12 ? ` <span class="dim">+${ps.length - 12}</span>` : ''}</td></tr>`);
    const g = m.mem.rowAt('');
    const tendency = g ? g.items.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, w]) => pill(`${t} ${pct(w / g.total)}`)).join(' ') : '–';
    out.push(`<section><h3>pattern memory <span class="dim">(live)</span></h3>
      <div class="dim">Confident patterns: at least 50% of what followed, seen about ${p.repsToLearn}× or more. ✅ strengthens and ❌ halves its reaction: the link to the emoji it answered and to the sequence it answered.</div>
      <table class="rules">${rows.join('') || '<tr><td class="dim">no confident patterns yet</td></tr>'}</table>
      <div>general tendency (the emojis themselves): ${tendency}</div>
      <div>remembers ${m.mem.size} sequences · ${m.seq.length} emojis in the conversation · last dream: learned ${m.stats.dreamLearned} dreamed emojis</div>
    </section>`);

    // ── complexity & appearance basis ──
    const cx = m.complexity();
    const topSigns = [...cx.variety].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e, n]) => pill(`${e} ${n}`)).join(' ');
    const look = LOOK_SLOTS.map((slot, i) => {
      const x = m.look[slot];
      const lock = p.lookUnlock[i];
      if (!x) return '';
      const fade = x.presence < 1 ? ` · <span class="dim">present ${Math.round(x.presence * 100)}% (from complexity ${lock}, full at ${lock * 2})</span>` : '';
      return `<tr><td>${slot}</td><td><span class="swatch" style="background:${x.color};opacity:${0.25 + 0.75 * x.presence}"></span> shape ${num(x.shape, 2)} · size ${num(x.size, 2)} · texture ${num(x.texture, 2)} · hue ${x.hue}°${fade}</td></tr>`;
    });
    const lastTok = (() => {
      for (let i = s.save.history.length - 1; i >= 0; i--) if (s.save.history[i].who === 'C') return s.save.history[i].tok;
      return null;
    })();
    out.push(`<section><h3>complexity & appearance basis</h3>
      <div>complexity <b>${num(cx.score, 1)}</b> · ${cx.signs} emojis in learned patterns <span class="dim">(Σ log2(1 + different patterns per emoji); random spam adds nothing)</span></div>
      <div>most varied: ${topSigns || '–'}</div>
      <h4>look <span class="dim">(a blend of its strongest pattern emojis; after each sleep it moves ${Math.round(p.lookFollow * 100)}% of the way to the new blend)</span></h4>
      <div class="dim">blended from: ${m.lookMix.slice(0, 8).map(([e, q]) => `${e} ${Math.round(q * 100)}%`).join(' · ') || '–'}</div>
      <table class="rules">${look.join('')}</table>
      <div class="dim">voice: ${voiceText(voiceFor(m.look))}</div>
      ${lastTok ? `<div class="dim">melody of its last sign ${lastTok}: ${melodyText(lastTok)} (${KEY_NAMES[keyOf(lastTok)]} major)</div>` : ''}
    </section>`);

    // ── history ──
    const hist = s.save.history.slice(-160).map((e) => {
      if (e.tok === BIRTH) return `<span class="h-sys">birth</span>`;
      if (e.tok === SLEEP) return `<span class="h-sys">💤 ${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      if (e.tok === WAKE) return `<span class="h-sys">☀︎ ${e.m === 'manual' ? 'woken' : 'wakes'} ${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
      const cls = e.who === 'C' ? 'h-c' : 'h-p';
      const mark = e.m === 'answer' ? '›' : e.m === 'retry' ? '↺' : e.m === 'surprise' ? '✦' : '';
      return `<span class="${cls}" title="${e.who === 'C' ? 'creature' : 'you'}${e.m ? ' · ' + e.m : ''}">${e.tok}${mark}</span>`;
    });
    out.push(`<section><h3>history <span class="dim">(${s.save.history.length} entries · <span class="h-c">creature</span> <span class="h-p">you</span>)</span></h3>
      <div class="history">${hist.join('')}</div></section>`);

    info.innerHTML = out.join('');
  };
}
