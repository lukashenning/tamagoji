#!/usr/bin/env python3
"""Cut a drawing sheet into vector part images (docs/09-creature-art.md).

A sheet holds rows of 6 red boxes; each row is one style of a part, each box one variant (1–6, left
to right). Red only marks the boxes (and the labels around them); the dark blue drawing inside a box
is the part. The box is the frame: what is drawn inside is placed the same way inside the frame.

For every box the drawing is traced into smooth vector outlines (scripts/vectorize.py) and written as
    art/parts/<part>/<NN>/<variant>.svg      (viewBox = the frame, one filled path)
continuing the style numbers already there. Empty boxes write nothing (that variant shows variant 1).
The sheet itself is kept in art/sheets/. A preview of what was extracted can be written (SVG).

Run:  python3 scripts/extract_parts.py <sheet image> <part> [--rows eyes,eyes,hat,…] [--preview out.svg]
      then python3 scripts/build_parts.py
"""

import argparse
import json
import os
import shutil
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pngio import read_rgba  # noqa: E402
from vectorize import trace, svg_file  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art', 'parts')
SHEETS = os.path.join(ROOT, 'art', 'sheets')
FRAME_FILE = os.path.join(ART, 'frame.json')
PARTS = ['eyes', 'hat', 'mouth', 'legs', 'arms', 'nose', 'object']
LONG_SIDE = 320  # frame size in units along its longer side (set once, kept in art/parts/frame.json);
# the art is vector, so this only sets the coordinate scale (0.1 unit precision)
BLOCK = 4  # px per cell when looking for the boxes


def is_red(r, g, b):
    return r > 150 and r - g > 70 and r - b > 60


def ink(r, g, b):
    """How much a pixel is dark-blue drawing: 0…1 (grid lines, paper, red and grey writing → 0)."""
    if b < r + 10 or is_red(r, g, b):
        return 0.0
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    # a soft ramp (smooth edges): full ink below 70, nothing above 160 (the grid lines are ~180)
    t = min(1.0, max(0.0, (160 - lum) / 90))
    return t * t * (3 - 2 * t)


def find_boxes(w, h, rows):
    """Red boxes: [(left, top, right, bottom)] of each box's inside, in reading order (rows, then x)."""
    bw, bh = (w + BLOCK - 1) // BLOCK, (h + BLOCK - 1) // BLOCK
    red = [[False] * bw for _ in range(bh)]
    for y in range(h):
        row = rows[y]
        cy = y // BLOCK
        for x in range(w):
            if is_red(row[x * 4], row[x * 4 + 1], row[x * 4 + 2]) and row[x * 4 + 3] > 128:
                red[cy][x // BLOCK] = True
    # join stroke gaps at the corners: grow by 1 cell
    grown = [[False] * bw for _ in range(bh)]
    for y in range(bh):
        for x in range(bw):
            if red[y][x]:
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if 0 <= y + dy < bh and 0 <= x + dx < bw:
                            grown[y + dy][x + dx] = True
    # connected red shapes
    seen = [[False] * bw for _ in range(bh)]
    shapes = []
    for y in range(bh):
        for x in range(bw):
            if grown[y][x] and not seen[y][x]:
                stack, x0, y0, x1, y1 = [(x, y)], x, y, x, y
                seen[y][x] = True
                while stack:
                    cx, cy = stack.pop()
                    x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < bw and 0 <= ny < bh and grown[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                shapes.append((x0 * BLOCK, y0 * BLOCK, min(w - 1, (x1 + 1) * BLOCK), min(h - 1, (y1 + 1) * BLOCK)))
    # boxes are the big shapes (labels and numbers are small)
    big = [s for s in shapes if s[2] - s[0] > 60 and s[3] - s[1] > 60]
    if not big:
        return []
    mw = statistics.median(s[2] - s[0] for s in big)
    mh = statistics.median(s[3] - s[1] for s in big)
    big = [s for s in big if s[2] - s[0] > 0.5 * mw and s[3] - s[1] > 0.5 * mh]
    found = [b for b in (inside(rows, s) for s in big) if b]  # handwritten labels aren't boxes
    # all boxes on a sheet have about the same height: take the top line that gives that height
    usual = statistics.median(b[3] - b[1][-1] for b in found)
    boxes = [(L, min(tops, key=lambda t: abs(B - t - usual)), Rt, B) for L, tops, Rt, B in found]
    # reading order: rows by height, then left to right
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    lines, cur = [], []
    for b in boxes:
        if cur and (b[1] + b[3]) / 2 - (cur[-1][1] + cur[-1][3]) / 2 > 0.5 * mh:
            lines.append(cur)
            cur = []
        cur.append(b)
    if cur:
        lines.append(cur)
    return [sorted(line, key=lambda b: b[0]) for line in lines]


def runs(values, limit):
    """Index ranges [(a, b)] where values[i] >= limit."""
    out, start = [], None
    for i, v in enumerate(values + [-1]):
        if v >= limit and start is None:
            start = i
        elif v < limit and start is not None:
            out.append((start, i - 1))
            start = None
    return out


def inside(rows, s):
    """The inside of a hand-drawn box, or None if the shape isn't a box (e.g. a handwritten label).
    A box side is a long red line across (almost) the whole shape; labels next to a box (DEFAULT,
    numbers) never are. Lines may be slightly slanted or wavy: each is looked at through a band of
    ±R px, and the inside starts past the band."""
    R, M = 5, 3  # band half-height, extra margin inside the line
    x0, y0, x1, y1 = s
    W, H = x1 - x0, y1 - y0
    grid = [[is_red(rows[y][x * 4], rows[y][x * 4 + 1], rows[y][x * 4 + 2]) for x in range(x0, x1)] for y in range(y0, y1)]
    # horizontal lines: share of columns with red within ±R rows
    cum = [[0] * W]
    for y in range(H):
        cum.append([cum[-1][x] + grid[y][x] for x in range(W)])
    hcov = [sum(cum[min(H, y + R + 1)][x] - cum[max(0, y - R)][x] > 0 for x in range(W)) / W for y in range(H)]
    hr = runs(hcov, 0.7)
    if len(hr) < 2:
        return None
    B = hr[-1][0] + R - M
    tops = [r[1] - R + M for r in hr[:-1]]  # a wide label above can look like a line too: pick later
    T = tops[0]
    if B - T < 0.4 * H:
        return None
    # vertical lines, between the top and bottom lines
    rowcum = []
    for y in range(T, B):
        c = [0]
        for x in range(W):
            c.append(c[-1] + grid[y][x])
        rowcum.append(c)
    vcov = [sum(c[min(W, x + R + 1)] - c[max(0, x - R)] > 0 for c in rowcum) / max(1, len(rowcum)) for x in range(W)]
    vr = runs(vcov, 0.7)
    if len(vr) < 2:
        return None
    L, Rt = vr[0][1] - R + M, vr[-1][0] + R - M
    if Rt - L < 0.4 * W:
        return None
    return (x0 + L, [y0 + t for t in tops], x0 + Rt, y0 + B)


def ink_grid(rows, box):
    """Ink amount (0…1) of every pixel inside a box, at the sheet's own resolution. Where a red guide
    line covers the drawing, the ink is bridged across it if it continues on both sides."""
    L, T, R, B = box
    grid = [[ink(*rows[y][x * 4:x * 4 + 3]) if rows[y][x * 4 + 3] > 0 else 0.0 for x in range(L, R)] for y in range(T, B)]
    red = [[is_red(*rows[y][x * 4:x * 4 + 3]) for x in range(L, R)] for y in range(T, B)]
    h, w = len(grid), len(grid[0])

    def reach(y, x, dy, dx):
        for step in range(1, 6):
            yy, xx = y + dy * step, x + dx * step
            if not (0 <= yy < h and 0 <= xx < w):
                return 0.0
            if not red[yy][xx]:
                return grid[yy][xx]
        return 0.0

    fill = {}
    for y in range(h):
        for x in range(w):
            if red[y][x]:
                v = max(min(reach(y, x, dy, dx), reach(y, x, -dy, -dx)) for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)))
                if v > 0.2:
                    fill[(y, x)] = v
    for (y, x), v in fill.items():
        grid[y][x] = v
    return grid


def frame_size(lines, save=True):
    if os.path.exists(FRAME_FILE):
        f = json.load(open(FRAME_FILE))
        return f['w'], f['h']
    ratio = statistics.median((b[2] - b[0]) / (b[3] - b[1]) for line in lines for b in line)
    fw, fh = (LONG_SIDE, round(LONG_SIDE / ratio)) if ratio >= 1 else (round(LONG_SIDE * ratio), LONG_SIDE)
    if not save:
        return fw, fh
    os.makedirs(ART, exist_ok=True)
    json.dump({'w': fw, 'h': fh, 'note': 'all part images are this size (set by the first sheet)'}, open(FRAME_FILE, 'w'), indent=1)
    return fw, fh


def preview(path, cells, fw, fh):
    """An SVG contact sheet of what was extracted: one row per style, 6 frames."""
    pad = 8
    W, H = 6 * (fw + pad) + pad, len(cells) * (fh + pad) + pad
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
           f'<rect width="{W}" height="{H}" fill="#ececec"/>']
    for r, variants in enumerate(cells):
        for v, d in enumerate(variants):
            x, y = pad + v * (fw + pad), pad + r * (fh + pad)
            out.append(f'<rect x="{x}" y="{y}" width="{fw}" height="{fh}" fill="{"#fff" if d else "#d7cdcd"}"/>')
            if d:
                out.append(f'<path transform="translate({x} {y})" fill="#1a0a6e" fill-rule="evenodd" d="{d}"/>')
    out.append('</svg>')
    open(path, 'w').write('\n'.join(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('part', choices=PARTS, help='the part of every row (or use --rows)')
    ap.add_argument('--rows', help='comma-separated part per row, if a sheet mixes parts')
    ap.add_argument('--preview', help='write a preview (SVG) of what was extracted here')
    ap.add_argument('--dry', action='store_true', help='only find the boxes and write the preview')
    a = ap.parse_args()

    w, h, rows = read_rgba(a.sheet)
    lines = find_boxes(w, h, rows)
    if not lines:
        sys.exit('no red boxes found')
    parts = a.rows.split(',') if a.rows else [a.part] * len(lines)
    if len(parts) != len(lines):
        sys.exit(f'{len(lines)} rows of boxes found, but {len(parts)} parts given')
    print(f'{len(lines)} rows: ' + ' · '.join(f'{p} {len(l)} boxes' for p, l in zip(parts, lines)))
    for p, line in zip(parts, lines):
        if len(line) != 6:
            print(f'  note: a {p} row has {len(line)} boxes, not 6')
    fw, fh = frame_size(lines, save=not a.dry)

    cells = []
    for line in lines:
        variants = []
        for box in line[:6]:
            grid = ink_grid(rows, box)
            inked = max(max(r) for r in grid) > 0.3 and sum(map(sum, grid)) > 5  # tiny dots count too
            d = trace(grid, fw / (box[2] - box[0]), fh / (box[3] - box[1])) if inked else ''
            variants.append(d or None)
        cells.append(variants)
    if a.preview:
        preview(a.preview, cells, fw, fh)
        print(f'preview: {a.preview}')
    if a.dry:
        return

    for part, variants in zip(parts, cells):
        folder = os.path.join(ART, part)
        os.makedirs(folder, exist_ok=True)
        nums = [int(d) for d in os.listdir(folder) if d.isdigit()]
        style = f'{(max(nums) if nums else 0) + 1:02d}'
        if variants[0] is None:
            print(f'  {part} {style}: variant 1 (default) is empty, skipped the row')
            continue
        os.makedirs(os.path.join(folder, style), exist_ok=True)
        for v, d in enumerate(variants, 1):
            if d:
                open(os.path.join(folder, style, f'{v}.svg'), 'w').write(svg_file(d, fw, fh))
        print(f'  {part}/{style}: variants {", ".join(str(v) for v, x in enumerate(variants, 1) if x)}')
    if os.path.abspath(a.sheet).startswith(SHEETS + os.sep):
        return  # re-extracting a kept sheet: it's already there
    os.makedirs(SHEETS, exist_ok=True)
    n = sum(f.startswith(parts[0] + '-') for f in os.listdir(SHEETS)) + 1
    keep = os.path.join(SHEETS, f'{parts[0]}-{n}{os.path.splitext(a.sheet)[1]}')  # e.g. eyes-1.webp, eyes-2.png
    shutil.copy(a.sheet, keep)
    print(f'sheet kept as {os.path.relpath(keep, ROOT)} · frame {fw}×{fh}')


if __name__ == '__main__':
    main()
