"""Minimal PNG reading and writing with the Python standard library only (no Pillow).
Other formats (JPEG, HEIC, WebP, …) are converted to PNG with macOS's `sips` first."""

import os
import struct
import subprocess
import tempfile
import zlib


def to_png(path):
    """Path of a PNG version of `path` (converted with sips if it isn't a PNG)."""
    with open(path, 'rb') as f:
        if f.read(8) == b'\x89PNG\r\n\x1a\n':
            return path
    out = os.path.join(tempfile.mkdtemp(), 'converted.png')
    subprocess.run(['sips', '-s', 'format', 'png', path, '--out', out], check=True, capture_output=True)
    return out


def read_rgba(path):
    """-> (width, height, rows) with rows[y] = bytearray of RGBA (8 bits each)."""
    data = open(to_png(path), 'rb').read()
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
    if interlace or depth not in (8, 16) or (ctype == 3 and depth != 8):
        # let sips re-save it plainly (8 bits, not interlaced)
        tmp = os.path.join(tempfile.mkdtemp(), 'plain.png')
        subprocess.run(['sips', '-s', 'format', 'png', '-s', 'formatOptions', 'default', path, '--out', tmp], check=True, capture_output=True)
        if tmp != path and open(tmp, 'rb').read() != data:
            return read_rgba(tmp)
        raise ValueError(f'{path}: unsupported PNG (depth {depth}, interlace {interlace})')
    chans = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bpp = chans * depth // 8
    raw = zlib.decompress(idat)
    stride = w * bpp
    prev = bytearray(stride)
    rows, p = [], 0
    for _ in range(h):
        f = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                line[x] = (line[x] + ((line[x - bpp] if x >= bpp else 0) + prev[x]) // 2) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        if depth == 16:
            line8 = line[0::2]  # high bytes
        else:
            line8 = line
        out = bytearray(w * 4)
        for x in range(w):
            if ctype == 6:
                out[x * 4:x * 4 + 4] = line8[x * 4:x * 4 + 4]
            elif ctype == 2:
                out[x * 4:x * 4 + 3] = line8[x * 3:x * 3 + 3]
                out[x * 4 + 3] = 255
            elif ctype == 0:
                g = line8[x]
                out[x * 4:x * 4 + 4] = bytes((g, g, g, 255))
            elif ctype == 4:
                g = line8[x * 2]
                out[x * 4:x * 4 + 4] = bytes((g, g, g, line8[x * 2 + 1]))
            else:  # palette
                k = line8[x]
                r, g, b = palette[k]
                out[x * 4:x * 4 + 4] = bytes((r, g, b, trns[k] if trns and k < len(trns) else 255))
        rows.append(out)
    return w, h, rows


def _chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF)


def write_png(path, w, h, rows, ctype):
    """rows[y] = bytes for one row: ctype 4 = grey+alpha (2 bytes/px), 6 = RGBA, 2 = RGB."""
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    png = b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ctype, 0, 0, 0)) + _chunk(b'IDAT', zlib.compress(raw, 9)) + _chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


def write_mask(path, w, h, alpha_rows):
    """A monochrome image: white with the given transparency (alpha_rows[y][x] = 0…255)."""
    write_png(path, w, h, [bytes(v for a in row for v in (255, a)) for row in alpha_rows], 4)


def read_alpha(path):
    """-> (w, h, alpha rows) of an image (its transparency × darkness is NOT applied: plain alpha)."""
    w, h, rows = read_rgba(path)
    return w, h, [[row[x * 4 + 3] for x in range(w)] for row in rows]

