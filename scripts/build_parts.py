#!/usr/bin/env python3
"""Build the creature's part art for the game (docs/09-creature-art.md).

Source (made by scripts/extract_parts.py from the drawing sheets, kept in the repo):
    art/parts/<part>/<NN>/<variant>.png     monochrome: white + transparency, all the frame size
    part    = eyes | hat | mouth | legs | arms | nose | object
    NN      = style number (01, 02, …), used in that order
    variant = 1.png … 6.png (1 = default; eyes 2 = closed, mouth 2 = ✓, mouth 3 = ✗, arms 2 = ?).
              A missing variant (an empty box) shows variant 1 in the game.

Output (what the game loads):
    assets/parts/<part>.png       one atlas per part: a row per style, 6 columns (variants 1–6),
                                  white + transparency (the game colours it with the sign's colour)
    assets/parts/manifest.json    frame size, styles (name, which variants exist) per part, version

Run:  python3 scripts/build_parts.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pngio import read_rgba, write_mask  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'parts')
OUT = os.path.join(ROOT, 'assets', 'parts')
PARTS = ['eyes', 'hat', 'mouth', 'legs', 'arms', 'nose', 'object']
VARIANTS = 6


def main():
    os.makedirs(OUT, exist_ok=True)
    frame = None
    manifest = {'frame': None, 'parts': {}}
    path = os.path.join(OUT, 'manifest.json')
    version = (json.load(open(path)).get('version', 0) if os.path.exists(path) else 0) + 1
    for part in PARTS:
        folder = os.path.join(SRC, part)
        styles = sorted(d for d in os.listdir(folder) if os.path.isdir(os.path.join(folder, d))) if os.path.isdir(folder) else []
        cells, info = [], []
        for style in styles:
            imgs = {}
            for v in range(1, VARIANTS + 1):
                f = os.path.join(folder, style, f'{v}.png')
                if not os.path.exists(f):
                    continue
                w, h, rows = read_rgba(f)
                frame = frame or (w, h)
                if (w, h) != frame:
                    sys.exit(f'{f}: {w}×{h}, but the frame is {frame[0]}×{frame[1]} (all part images must be the same size)')
                imgs[v] = [[row[x * 4 + 3] for x in range(w)] for row in rows]  # keep the transparency only
            if 1 not in imgs:
                print(f'skipped {part}/{style}: no 1.png (the default)')
                continue
            cells.append(imgs)
            info.append({'name': style, 'variants': sorted(imgs)})
        manifest['parts'][part] = {'styles': info}
        atlas = os.path.join(OUT, f'{part}.png')
        if not cells:
            if os.path.exists(atlas):
                os.remove(atlas)
            continue
        fw, fh = frame
        blank = [[0] * fw for _ in range(fh)]
        rows = []
        for imgs in cells:
            for y in range(fh):
                rows.append([a for v in range(1, VARIANTS + 1) for a in imgs.get(v, blank)[y]])
        write_mask(atlas, fw * VARIANTS, fh * len(cells), rows)
        print(f'{part}: {len(cells)} styles → {os.path.relpath(atlas, ROOT)} ({os.path.getsize(atlas) // 1024 + 1} KB)')
    manifest['frame'] = list(frame) if frame else [48, 48]
    manifest['version'] = version
    json.dump(manifest, open(path, 'w'), indent=1, ensure_ascii=False)
    print(f'manifest version {version}, frame {manifest["frame"][0]}×{manifest["frame"][1]}')


if __name__ == '__main__':
    main()
