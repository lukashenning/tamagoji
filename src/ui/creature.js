// Draws the creature from its parts (docs/09-creature-art.md, D77).
//
// Art: assets/parts/manifest.json + one atlas per part, assets/parts/<part>.png: one row per style,
// 6 columns (variants 1–6), every cell the same frame size, grey shades + transparency. All parts are
// drawn on the same frame, already in place, so they simply stack. Each part is tinted with its sign's
// gbc1 colour: white → the colour, grey → darker shades of it, black stays black.
// Parts without art yet are drawn as simple placeholders, so the system can be tried before the art.
//
// Every part is its own layer (.part.part-<name>) with its own transform origin, ready for subtle
// "breathing" animations later. The object sits to the right of the creature, outside its layout.

import { PARTS, VARIANTS, lookOf, partsShown } from '../core/look.js';

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

  let art = null; // { frame: [w, h], parts: { eyes: { styles: [{ name, variants }], image } } }
  loadArt().then((a) => {
    art = a;
    for (const l of Object.values(layers)) l.key = ''; // redraw with the art
  });

  const tinted = new Map(); // "part|style|color" -> canvas with that style's 6 variants, tinted

  function styleCount(part) {
    return art?.parts[part]?.styles.length || 1;
  }

  function frameSize(part) {
    return art?.parts[part]?.styles.length ? art.frame : [PLACEHOLDER_FRAME, PLACEHOLDER_FRAME];
  }

  /** How many variants this part's style has (a move's digit beyond that shows variant 1). */
  function variantsOf(part, style) {
    return art?.parts[part]?.styles[style]?.variants ?? VARIANTS;
  }

  function strip(part, style, color) {
    const key = `${part}|${style}|${color}`;
    if (tinted.has(key)) return tinted.get(key);
    const [w, h] = art.frame;
    const c = document.createElement('canvas');
    c.width = w * VARIANTS;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(art.parts[part].image, 0, style * h, w * VARIANTS, h, 0, 0, w * VARIANTS, h);
    g.globalCompositeOperation = 'multiply'; // white → the colour, greys → darker shades, black stays
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; // keep the original transparency
    g.drawImage(art.parts[part].image, 0, style * h, w * VARIANTS, h, 0, 0, w * VARIANTS, h);
    tinted.set(key, c);
    return c;
  }

  /**
   * @param {{ seats: { seat: string, tok: string }[], pose: number[], level: number }} look
   */
  function render({ seats, pose, level }) {
    const shown = partsShown(level);
    root.style.setProperty('--frame-w', frameSize('eyes')[0]);
    PARTS.forEach((part, i) => {
      const l = layers[part];
      const seat = seats[i];
      const visible = i < shown && !!seat;
      l.wrap.hidden = !visible;
      if (!visible) return;
      const { style, color } = lookOf(seat.tok, styleCount(part));
      const variant = pose[i] <= variantsOf(part, style) ? pose[i] : 1;
      const key = `${!!art}|${seat.tok}|${style}|${color}|${variant}`;
      if (key === l.key) return;
      l.key = key;
      const [w, h] = frameSize(part);
      l.canvas.width = w;
      l.canvas.height = h;
      const g = l.canvas.getContext('2d');
      g.clearRect(0, 0, w, h);
      if (art?.parts[part]?.styles.length) {
        g.imageSmoothingEnabled = false;
        g.drawImage(strip(part, style, color), (variant - 1) * w, 0, w, h, 0, 0, w, h);
      } else drawPlaceholder(g, part, variant, color);
      l.wrap.title = `${part}: ${seat.tok} · style ${style + 1} · variant ${variant}`;
    });
  }

  return { render, styleCount };
}

async function loadArt() {
  try {
    const res = await fetch('assets/parts/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const m = await res.json();
    const parts = {};
    await Promise.all(
      Object.entries(m.parts || {}).map(async ([part, p]) => {
        if (!p.styles?.length) return;
        const image = new Image();
        image.src = `assets/parts/${part}.png?v=${m.version || 0}`;
        await image.decode();
        parts[part] = { ...p, image };
      }),
    );
    return { frame: m.frame, parts };
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
