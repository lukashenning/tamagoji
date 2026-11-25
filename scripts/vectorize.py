"""Turn a drawing (a grid of ink amounts 0…1) into smooth vector outlines (an SVG path).

0. Soften: a light blur, so the outline follows the stroke, not every pixel step of the scan.
1. Contours: marching squares on the ink grid at a threshold, with the crossing points interpolated
   between pixels, so the outline is sub-pixel accurate (each pen stroke becomes a thin closed shape).
2. Simplify: Ramer–Douglas–Peucker drops points that lie on (almost) straight stretches.
3. Smooth: the remaining points are joined by Catmull-Rom curves, written as cubic Béziers.
The path is filled with the even-odd rule, so loops inside loops become holes (e.g. an "o")."""

THRESHOLD = 0.3  # ink amount (after softening) where the outline runs
SIMPLIFY = 0.45  # max deviation in source pixels when dropping points
MIN_AREA = 1.5  # outlines smaller than this (source px²) are specks of noise


def contours(grid, t=THRESHOLD):
    """Closed outlines [[(x, y), …], …] in source pixel coordinates (pixel centres at x + 0.5)."""
    h, w = len(grid), len(grid[0])
    v = [[0.0] * (w + 2)] + [[0.0] + list(r) + [0.0] for r in grid] + [[0.0] * (w + 2)]
    H, W = h + 2, w + 2

    def point(key):
        kind, i, j = key
        if kind == 'h':
            a, b = v[i][j], v[i][j + 1]
            x, y = j + (t - a) / (b - a), i
        else:
            a, b = v[i][j], v[i + 1][j]
            x, y = j, i + (t - a) / (b - a)
        return (x - 0.5, y - 0.5)  # padded grid index → source pixel centre coordinates

    links = {}

    def seg(a, b):
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)

    for i in range(H - 1):
        row, nxt = v[i], v[i + 1]
        for j in range(W - 1):
            tl, tr, br, bl = row[j] >= t, row[j + 1] >= t, nxt[j + 1] >= t, nxt[j] >= t
            case = tl * 8 + tr * 4 + br * 2 + bl
            if case in (0, 15):
                continue
            T, B, L, R = ('h', i, j), ('h', i + 1, j), ('v', i, j), ('v', i, j + 1)
            if case in (1, 14):
                seg(L, B)
            elif case in (2, 13):
                seg(B, R)
            elif case in (3, 12):
                seg(L, R)
            elif case in (4, 11):
                seg(T, R)
            elif case in (6, 9):
                seg(T, B)
            elif case in (7, 8):
                seg(T, L)
            else:  # 5 or 10: two corners diagonally; the centre decides whether they connect
                centre = (row[j] + row[j + 1] + nxt[j + 1] + nxt[j]) / 4 >= t
                if (case == 5) == centre:
                    seg(T, L), seg(B, R)
                else:
                    seg(T, R), seg(L, B)

    loops, seen = [], set()
    for start in links:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while cur not in seen:
            seen.add(cur)
            loop.append(point(cur))
            nexts = [n for n in links[cur] if n != prev and n not in seen]
            if not nexts:
                break
            prev, cur = cur, nexts[0]
        if len(loop) >= 3:
            loops.append(loop)
    return loops


def area(loop):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(loop, loop[1:] + loop[:1]))) / 2


def simplify(points, eps=SIMPLIFY):
    """Ramer–Douglas–Peucker on a closed loop."""
    if len(points) < 4:
        return points
    pts = points + [points[0]]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    # split the loop at the point farthest from the start, so both halves are open polylines
    far = max(range(len(pts)), key=lambda k: (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2)
    keep[far] = True
    stack = [(0, far), (far, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        n = (dx * dx + dy * dy) ** 0.5 or 1e-9
        best, k = 0.0, None
        for m in range(a + 1, b):
            d = abs(dy * (pts[m][0] - ax) - dx * (pts[m][1] - ay)) / n
            if d > best:
                best, k = d, m
        if k is not None and best > eps:
            keep[k] = True
            stack += [(a, k), (k, b)]
    out = [p for p, kp in zip(pts[:-1], keep[:-1]) if kp]
    return out if len(out) >= 3 else points


def svg_path(loops, sx, sy):
    """Smooth closed curves through each loop's points, scaled by (sx, sy), as SVG path data."""
    f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
    parts = []
    for loop in loops:
        p = [(x * sx, y * sy) for x, y in loop]
        n = len(p)
        d = [f'M{f(p[0][0])} {f(p[0][1])}']
        for k in range(n):
            p0, p1, p2, p3 = p[k - 1], p[k], p[(k + 1) % n], p[(k + 2) % n]
            c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
            c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
            d.append(f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}')
        parts.append(''.join(d) + 'Z')
    return ''.join(parts)


def soften(grid):
    """Blur with the 5-tap kernel 1 4 6 4 1 (about one pixel), across and down."""
    k = (1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16)
    h, w = len(grid), len(grid[0])
    tmp = [[sum(k[d + 2] * row[min(w - 1, max(0, x + d))] for d in range(-2, 3)) for x in range(w)] for row in grid]
    return [[sum(k[d + 2] * tmp[min(h - 1, max(0, y + d))][x] for d in range(-2, 3)) for x in range(w)] for y in range(h)]


def trace(grid, sx, sy):
    """Ink grid → SVG path data in frame units (or '' if there's nothing)."""
    loops = [simplify(l) for l in contours(soften(grid)) if area(l) >= MIN_AREA]
    return svg_path(loops, sx, sy)


def svg_file(path_d, w, h, color='#1a0a6e'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'<path fill="{color}" fill-rule="evenodd" d="{path_d}"/></svg>\n')
