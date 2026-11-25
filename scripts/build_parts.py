#!/usr/bin/env python3
"""Build the creature's part art (docs/09-creature-art.md).

Source (kept in the repo, as delivered and sorted):
    art/parts/<part>/<style>/<variant>.png      e.g. art/parts/eyes/03-round/2.png
    part     = eyes | hat | mouth | legs | arms | nose | object
    style    = a folder per style; styles are used in name order (prefix them 01-, 02-, … to fix it)
    variant  = 1.png … 6.png (1 = default; eyes 2 = closed, mouth 2 = ✓, mouth 3 = ✗, arms 2 = ?).
               Missing variants after the last one simply don't exist for that style.

Output (what the game loads):
    assets/parts/<part>.png       one atlas per part: a row per style, 6 columns (variants 1–6),
                                  grey + transparency (the game tints it with the sign's colour)
    assets/parts/manifest.json    frame size, styles (name, variants) per part, a version number

Every source image must have the same size (the frame). Colours are turned into grey shades
(brightness), transparency is kept. Only the Python standard library is used.

Run:  python3 scripts/build_parts.py
"""

import json
import os
import struct
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'parts')
OUT = os.path.join(ROOT, 'assets', 'parts')
PARTS = ['eyes', 'hat', 'mouth', 'legs', 'arms', 'nose', 'object']
VARIANTS = 6


def read_png(path):
    """-> (width, height, rows of (grey, alpha) pairs). 8-bit grey, grey+alpha, RGB, RGBA, palette."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'{path}: not a PNG')
    i, idat, palette, trns = 8, b'', None, None
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        kind, body = data[i + 4:i + 8], data[i + 8:i + 8 + n]
        if kind == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif kind == b'PLTE':
            palette = [tuple(body[j:j + 3]) for j in range(0, len(body), 3)]
        elif kind == b'tRNS':
            trns = body
        elif kind == b'IDAT':
            idat += body
        i += 12 + n
    if depth != 8 or interlace:
        raise ValueError(f'{path}: needs 8 bits per channel, not interlaced (re-save it, e.g. with sips)')
    bpp = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = w * bpp
    prev = bytearray(stride)
    rows, p = [], 0
    for _ in range(h):
        f = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        row = []
        for x in range(w):
            px = line[x * bpp:(x + 1) * bpp]
            if ctype == 0:
                g, al = px[0], 255
            elif ctype == 4:
                g, al = px[0], px[1]
            elif ctype == 3:
                r, gg, bb = palette[px[0]]
                g, al = grey(r, gg, bb), (trns[px[0]] if trns and px[0] < len(trns) else 255)
            else:
                g, al = grey(px[0], px[1], px[2]), (px[3] if ctype == 6 else 255)
            row.append((g, al) if al else (0, 0))
        rows.append(row)
    return w, h, rows


def grey(r, g, b):
    return round(0.299 * r + 0.587 * g + 0.114 * b)


def write_png(path, w, h, rows):
    """Grey + alpha PNG."""
    raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in rows)
    chunk = lambda kind, body: struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 4, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    frame = None
    manifest = {'frame': None, 'parts': {}}
    old = os.path.join(OUT, 'manifest.json')
    version = (json.load(open(old)).get('version', 0) if os.path.exists(old) else 0) + 1
    for part in PARTS:
        folder = os.path.join(SRC, part)
        styles = sorted(d for d in os.listdir(folder) if os.path.isdir(os.path.join(folder, d))) if os.path.isdir(folder) else []
        cells = []  # per style: list of images (variants 1…n)
        info = []
        for style in styles:
            imgs = []
            for v in range(1, VARIANTS + 1):
                f = os.path.join(folder, style, f'{v}.png')
                if not os.path.exists(f):
                    break
                w, h, rows = read_png(f)
                if frame is None:
                    frame = (w, h)
                if (w, h) != frame:
                    sys.exit(f'{f}: {w}×{h}, but the frame is {frame[0]}×{frame[1]} (all part images must be the same size)')
                imgs.append(rows)
            if not imgs:
                print(f'skipped {part}/{style}: no 1.png')
                continue
            cells.append(imgs)
            info.append({'name': style, 'variants': len(imgs)})
        manifest['parts'][part] = {'styles': info}
        atlas = os.path.join(OUT, f'{part}.png')
        if not cells:
            if os.path.exists(atlas):
                os.remove(atlas)
            continue
        fw, fh = frame
        blank = [[(0, 0)] * fw for _ in range(fh)]
        rows = []
        for imgs in cells:
            for y in range(fh):
                rows.append([px for v in range(VARIANTS) for px in (imgs[v] if v < len(imgs) else blank)[y]])
        write_png(atlas, fw * VARIANTS, fh * len(cells), rows)
        print(f'{part}: {len(cells)} styles → {os.path.relpath(atlas, ROOT)} ({os.path.getsize(atlas) // 1024 + 1} KB)')
    manifest['frame'] = list(frame) if frame else [48, 48]
    manifest['version'] = version
    json.dump(manifest, open(old, 'w'), indent=1, ensure_ascii=False)
    print(f'manifest version {version}, frame {manifest["frame"][0]}×{manifest["frame"][1]}')


if __name__ == '__main__':
    main()
