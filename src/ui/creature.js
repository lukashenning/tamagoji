// Draws the creature from its parts (docs/09-creature-art.md, D77).
//
// Art: assets/parts/parts.json, vector outlines traced from the user's drawing sheets: per part a list
// of styles, each with variants 1–6 as SVG path data on one shared frame (viewBox = frame). All parts
// are drawn in place on that frame, so they simply stack. Each part is filled (even-odd) with its
// sign's gbc1 colour (darkened if too light), sharp at any size and screen density. A variant that
// doesn't exist (an empty box) shows variant 1. Parts without art are drawn as simple placeholders.
//
// Every part is its own layer (.part.part-<name>) with its own transform origin, ready for subtle
// The object stands somewhere around the creature (OBJECT_SPOTS), outside its layout; it moves to
// another spot whenever the creature says something.

import { PARTS, VARIANTS, OBJECT_SPOTS, lookOf, partsShown, inkColor } from '../core/look.js';

// back to front (the object is drawn separately, to the right)
const LAYERS = ['legs', 'arms', 'eyes', 'nose', 'mouth', 'hat'];
const PLACEHOLDER_FRAME = 48;

export function buildCreature(root) {
  root.replaceChildren();
  const body = document.createElement('div');
  body.className = 'parts';
  root.append(body);
  const layers = {};
  for (const part of [...LAYERS, 'object']) {
    const wrap = document.createElement('div');
    wrap.className = `part part-${part}`;
    const canvas = document.createElement('canvas');
    wrap.append(canvas);
    (part === 'object' ? root : body).append(wrap);
    layers[part] = { wrap, canvas, key: '' };
  }

  let art = null; // { frame: [w, h], parts: { eyes: { styles: [{ name, variants: { "1": "M…" } }] } } }
  let loaded = false; // nothing is shown until the art has loaded (no placeholder flash)
  loadArt().then((a) => {
    art = a;
    loaded = true;
  });

  const paths = new Map(); // "part|style|variant" -> Path2D

  function styleCount(part) {
    return art?.parts[part]?.styles.length || 1;
  }

  /** Does this part's style have this variant? (If not, variant 1 is shown.) */
  function hasVariant(part, style, v) {
    const vs = art?.parts[part]?.styles[style]?.variants;
    return vs ? !!vs[v] : v <= VARIANTS;
  }

  function pathOf(part, style, v) {
    const key = `${part}|${style}|${v}`;
    if (!paths.has(key)) paths.set(key, new Path2D(art.parts[part].styles[style].variants[v]));
    return paths.get(key);
  }

  /**
   * @param {{ seats: { seat: string, tok: string }[], pose: number[], level: number }} look
   */
  function render({ seats, pose, level, spot = 0 }) {
    const shown = loaded ? partsShown(level) : 0;
    // the object's place around the creature (it glides there: CSS transition)
    const [sx, sy] = OBJECT_SPOTS[spot].at;
    layers.object.wrap.style.left = `${(sx * 100 - 25).toFixed(1)}%`;
    layers.object.wrap.style.top = `${(sy * 100 - 25).toFixed(1)}%`;
    const [fw, fh] = art?.frame || [PLACEHOLDER_FRAME, PLACEHOLDER_FRAME];
    root.style.aspectRatio = `${fw} / ${fh}`; // the creature's box has the frame's shape
    const dpr = window.devicePixelRatio || 1;
    PARTS.forEach((part, i) => {
      const l = layers[part];
      const seat = seats[i];
      const visible = i < shown && !!seat;
      l.wrap.hidden = !visible;
      if (!visible) return;
      const { style, color: gbc } = lookOf(seat.tok, styleCount(part));
      const color = inkColor(gbc); // too light colours are darkened for the thin lines
      const variant = hasVariant(part, style, pose[i]) ? pose[i] : 1;
      const drawn = !!art?.parts[part]?.styles.length;
      // the canvas has as many pixels as the screen shows there (sharp on any display)
      const pw = Math.max(1, Math.round(l.wrap.clientWidth * dpr));
      const ph = Math.max(1, Math.round(l.wrap.clientHeight * dpr));
      const key = `${drawn}|${seat.tok}|${style}|${color}|${variant}|${pw}x${ph}`;
      if (key === l.key) return;
      l.key = key;
      l.canvas.width = drawn ? pw : PLACEHOLDER_FRAME;
      l.canvas.height = drawn ? ph : PLACEHOLDER_FRAME;
      l.canvas.classList.toggle('pixel', !drawn); // placeholders are pixel shapes
      const g = l.canvas.getContext('2d');
      g.clearRect(0, 0, l.canvas.width, l.canvas.height);
      if (drawn) {
        g.setTransform(pw / fw, 0, 0, ph / fh, 0, 0);
        g.fillStyle = color;
        g.fill(pathOf(part, style, variant), 'evenodd');
        g.setTransform(1, 0, 0, 1, 0, 0);
      } else drawPlaceholder(g, part, variant, color);
      l.wrap.title = `${part}: ${seat.tok} · style ${style + 1} · variant ${variant}`;
    });
  }

  // ── motion ──
  // All parts (the object too) breathe together (one slow, shared swell) and each also wobbles a tiny
  // bit on its own (a mix of slow waves with its own speeds, so they never move in lockstep).
  // Asleep, everything slows down.
  const wave = () => ({ f: 0.6 + Math.random() * 0.8, p: Math.random() * 2 * Math.PI });
  const motion = Object.fromEntries([...LAYERS, 'object'].map((part) => [part, { x: [wave(), wave()], y: [wave(), wave()], s: [wave(), wave()] }]));
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let clock = 0;
  let last = performance.now();

  /** Call every animation frame. */
  function animate(now, asleep) {
    if (still) return;
    clock += (Math.min(100, now - last) / 1000) * (asleep ? 0.55 : 1); // seconds, slower while asleep
    last = now;
    const t = clock;
    // a mix of two waves of a part's own speeds: smooth, irregular, between −1 and 1
    const mix = ([a, b], speed) => 0.6 * Math.sin(2 * Math.PI * a.f * speed * t + a.p) + 0.4 * Math.sin(2 * Math.PI * b.f * speed * 1.7 * t + b.p);
    const breath = Math.sin((2 * Math.PI * t) / 3.6); // one breath every 3.6 s
    const unit = root.clientWidth / 252; // movements are given for a 252 px wide creature
    for (const part of [...LAYERS, 'object']) {
      const m = motion[part];
      const scale = 1 + 0.012 * breath + 0.006 * mix(m.s, 0.25);
      const dx = 0.8 * unit * mix(m.x, 0.2);
      const dy = (0.8 * mix(m.y, 0.2) - 0.6 * breath) * unit; // rises a little when breathing in
      layers[part].wrap.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    }
  }

  return { render, styleCount, animate };
}

async function loadArt() {
  try {
    const res = await fetch('assets/parts/parts.json', { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // no art yet: placeholders
  }
}

// ── placeholders: simple shapes on a 48 × 48 frame, one look per variant ──
// eyes 2 = closed · mouth 2 = ✓, 3 = ✗ · arms 2 = holding a "?"
function drawPlaceholder(g, part, v, color) {
  const ink = '#3b3a40';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2;
  g.strokeStyle = ink;
  g.fillStyle = color;
  const dot = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
  };
  const line = (...pts) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  switch (part) {
    case 'eyes': {
      if (v === 2) return line(12, 19, 19, 19), line(29, 19, 36, 19); // closed
      const r = [5, 0, 4, 6, 5, 3][v - 1];
      const dy = [0, 0, -2, 0, 2, 0][v - 1];
      dot(16, 19 + dy, r);
      dot(32, 19 + dy, r);
      g.fillStyle = ink;
      g.fillRect(15 + (v === 5 ? 2 : 0), 18 + dy, 2, 2);
      g.fillRect(31 + (v === 5 ? 2 : 0), 18 + dy, 2, 2);
      return;
    }
    case 'hat': {
      const tall = [8, 12, 5, 10, 7, 14][v - 1];
      const tilt = [0, 0, 3, -3, 0, 2][v - 1];
      g.beginPath();
      g.moveTo(14, 11);
      g.lineTo(34, 11);
      g.lineTo(31 + tilt, 11 - tall);
      g.lineTo(17 + tilt, 11 - tall);
      g.closePath();
      g.fill();
      g.stroke();
      return line(10, 11, 38, 11);
    }
    case 'mouth':
      if (v === 2) return line(19, 30, 23, 34, 30, 26); // ✓
      if (v === 3) return line(20, 26, 28, 34), line(28, 26, 20, 34); // ✗
      if (v === 1) return line(18, 30, 24, 33, 30, 30);
      if (v === 4) return dot(24, 31, 3);
      if (v === 5) return line(18, 32, 24, 29, 30, 32);
      return line(17, 30, 31, 30);
    case 'legs': {
      const spread = [0, 4, -2, 6, 2, 0][v - 1];
      const lift = [0, 0, 0, 0, 0, 4][v - 1];
      g.lineWidth = 3;
      g.strokeStyle = color;
      line(19, 38, 18 - spread, 46);
      line(29, 38, 30 + spread, 46 - lift);
      g.lineWidth = 1;
      g.strokeStyle = ink;
      line(19, 38, 18 - spread, 46);
      return line(29, 38, 30 + spread, 46 - lift);
    }
    case 'arms': {
      g.lineWidth = 3;
      g.strokeStyle = color;
      const ends = [
        [6, 30, 42, 30],
        [6, 30, 42, 16],
        [6, 18, 42, 18],
        [6, 36, 42, 36],
        [6, 18, 42, 36],
        [8, 26, 40, 26],
      ][v - 1];
      line(12, 27, ends[0], ends[1]);
      line(36, 27, ends[2], ends[3]);
      if (v === 2) {
        g.fillStyle = ink;
        g.font = 'bold 11px system-ui';
        g.fillText('?', 40, 13); // holds a "?"
      }
      return;
    }
    case 'nose':
      return dot(24, 25, [2.5, 2, 3.5, 2.5, 4, 3][v - 1]);
    case 'object': {
      const y = [26, 22, 30, 24, 28, 26][v - 1];
      g.beginPath();
      g.moveTo(10, y);
      for (let k = 1; k <= 10; k++) {
        const a = (k / 10) * 2 * Math.PI - Math.PI / 2;
        const r = k % 2 ? 4 : 9;
        g.lineTo(10 + r * Math.cos(a) + 4, y + r * Math.sin(a));
      }
      g.closePath();
      g.fill();
      return g.stroke();
    }
  }
}
