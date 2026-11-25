#!/usr/bin/env python3
"""Build the creature's part art for the game (docs/09-creature-art.md).

Source (made by scripts/extract_parts.py from the drawing sheets, kept in the repo):
    art/parts/<part>/<NN>/<variant>.svg      vector outlines, viewBox = the frame (art/parts/frame.json)
    part    = eyes | hat | mouth | legs | arms | nose | object
    NN      = style number (01, 02, …), used in that order
    variant = 1.svg … 6.svg (1 = default; eyes 2 = closed, mouth 2 = ✓, mouth 3 = ✗, arms 2 = ?).
              A missing variant (an empty box) shows variant 1 in the game.

Output (what the game loads): assets/parts/parts.json
    { version, frame: [w, h], parts: { eyes: { styles: [ { name, variants: { "1": "<path data>", … } } ] } } }
The game fills each path (even-odd) in the sign's colour, sharp at any size.

Run:  python3 scripts/build_parts.py
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'parts')
OUT = os.path.join(ROOT, 'assets', 'parts')
PARTS = ['eyes', 'hat', 'mouth', 'legs', 'arms', 'nose', 'object']


def main():
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'parts.json')
    version = (json.load(open(path)).get('version', 0) if os.path.exists(path) else 0) + 1
    frame_file = os.path.join(SRC, 'frame.json')
    frame = json.load(open(frame_file)) if os.path.exists(frame_file) else {'w': 320, 'h': 267}
    out = {'version': version, 'frame': [frame['w'], frame['h']], 'parts': {}}
    for part in PARTS:
        folder = os.path.join(SRC, part)
        styles = sorted(d for d in os.listdir(folder) if os.path.isdir(os.path.join(folder, d))) if os.path.isdir(folder) else []
        info = []
        for style in styles:
            variants = {}
            for v in range(1, 7):
                f = os.path.join(folder, style, f'{v}.svg')
                if os.path.exists(f):
                    d = ' '.join(re.findall(r'\sd="([^"]*)"', open(f).read()))
                    if d:
                        variants[str(v)] = d
            if '1' not in variants:
                print(f'skipped {part}/{style}: no 1.svg (the default)')
                continue
            info.append({'name': style, 'variants': variants})
        out['parts'][part] = {'styles': info}
        if info:
            print(f'{part}: {len(info)} styles')
    json.dump(out, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f'→ {os.path.relpath(path, ROOT)} ({os.path.getsize(path) // 1024 + 1} KB), version {version}, frame {out["frame"][0]}×{out["frame"][1]}')
    # the raster files of the earlier format are no longer used
    for f in os.listdir(OUT):
        if f.endswith('.png') or f == 'manifest.json':
            os.remove(os.path.join(OUT, f))


if __name__ == '__main__':
    main()
