"""Draws IMC Sans, IMC Serif and IMC Dyslexia: three original stroke-built typefaces, 9 weights each, upright and italic.
Every letter is a skeleton (centre lines); a pen is dragged along it and the outline becomes the glyph. Run: python make_fonts.py
"""
import math, os, sys
from shapely.geometry import LineString, Point, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import affinity
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

OUT = os.path.join(os.path.dirname(__file__), '..', 'server', 'public', 'fonts')
WEIGHTS = [(100, 'Thin', 15), (200, 'ExtraLight', 22), (300, 'Light', 31), (400, 'Regular', 40), (500, 'Medium', 48), (600, 'SemiBold', 57), (700, 'Bold', 67), (800, 'ExtraBold', 79), (900, 'Black', 93)]


def arc(cx, cy, rx, ry, a0, a1):
    n = max(6, int(abs(a1 - a0) / 10))
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def ell(cx, cy, rx, ry):
    return arc(cx, cy, rx, ry, 90, 450)


def flip(strokes, w, h):
    return [[(w - x, h - y) for x, y in s] for s in strokes]


def skeleton(m):
    """character -> list of strokes (lists of points); a stroke of one point is a dot"""
    h, C, a, d = m['xh'], m['cap'], m['asc'], m['desc']
    wb = m.get('bowl', 460)
    G = {}
    r = wb / 2
    G['o'] = [ell(r, h / 2, r, h / 2)]
    G['c'] = [arc(r + 10, h / 2, r, h / 2, 42, 318)]
    G['e'] = [[(0, h / 2), (wb, h / 2)] + arc(r, h / 2, r, h / 2, 0, 322)]
    G['a'] = [ell(r, h / 2, r, h / 2), [(wb, h), (wb, 0)]]
    G['d'] = [ell(r, h / 2, r, h / 2), [(wb, a), (wb, 0)]]
    G['b'] = [ell(r, h / 2, r, h / 2), [(0, a), (0, 0)]]
    G['p'] = [ell(r, h / 2, r, h / 2), [(0, h), (0, d)]]
    G['q'] = [ell(r, h / 2, r, h / 2), [(wb, h), (wb, d)]]
    nw = wb - 20
    arch = arc(nw / 2, h * 0.5, nw / 2, h * 0.5, 180, 0) + [(nw, 0)]
    G['n'] = [[(0, 0), (0, h)], arch]
    G['h'] = [[(0, 0), (0, a)], arch]
    G['m'] = [[(0, 0), (0, h)], arc(nw / 2 - 10, h * 0.5, nw / 2 - 10, h * 0.5, 180, 0) + [(nw - 20, 0)],
              arc(nw - 20 + (nw / 2 - 10), h * 0.5, nw / 2 - 10, h * 0.5, 180, 0) + [(2 * nw - 40 + 0, 0)]]
    G['r'] = [[(0, 0), (0, h)], arc(nw / 2, h * 0.5, nw / 2, h * 0.5, 180, 55)]
    G['u'] = [[(0, h)] + arc(nw / 2, h * 0.5, nw / 2, h * 0.5, 180, 360), [(nw, h), (nw, 0)]]
    G['i'] = [[(0, 0), (0, h)], [(0, h + 150)]]
    G['ı'] = [[(0, 0), (0, h)]]
    G['j'] = [[(0, h), (0, -50)] + arc(-130, -50, 130, 150, 0, -90), [(0, h + 150)]]
    G['l'] = [[(0, a), (0, 0)]]
    G['t'] = [[(0, h + 170), (0, 110)] + arc(140, 110, 140, 110, 180, 270), [(-70, h), (230, h)]]
    G['f'] = [[(0, 0), (0, a - 160)] + arc(160, a - 160, 160, 160, 180, 55), [(-70, h), (250, h)]]
    G['k'] = [[(0, 0), (0, a)], [(380, h), (0, h * 0.38)], [(110, h * 0.5), (400, 0)]]
    G['v'] = [[(0, h), (215, 0), (430, h)]]
    G['w'] = [[(0, h), (170, 0), (340, h), (510, 0), (680, h)]]
    G['x'] = [[(0, h), (420, 0)], [(0, 0), (420, h)]]
    G['y'] = [[(0, h), (215, 0)], [(430, h), (120, d)]]
    G['z'] = [[(0, h), (410, h), (0, 0), (410, 0)]]
    G['s'] = [arc(215, h * 0.75, 195, h * 0.25, 25, 270) + arc(215, h * 0.25, 195, h * 0.25, 90, -155)[1:]]
    G['g'] = [ell(r, h / 2, r, h / 2), [(wb, h), (wb, -50)] + arc(r, -50, r, 150, 0, -150)]
    # capitals
    G['A'] = [[(0, 0), (260, C), (520, 0)], [(105, C * 0.33), (415, C * 0.33)]]
    G['B'] = [[(0, 0), (0, C)], [(0, C), (230, C)] + arc(230, 0.76 * C, 200, 0.24 * C, 90, -90) + [(0, 0.52 * C)], [(0, 0.52 * C), (240, 0.52 * C)] + arc(240, 0.26 * C, 220, 0.26 * C, 90, -90) + [(0, 0)]]
    G['C'] = [arc(265, C / 2, 265, C / 2, 42, 318)]
    G['D'] = [[(0, 0), (0, C), (170, C)] + arc(170, C / 2, 300, C / 2, 90, -90) + [(0, 0)]]
    G['E'] = [[(400, C), (0, C), (0, 0), (400, 0)], [(0, C / 2), (340, C / 2)]]
    G['F'] = [[(400, C), (0, C), (0, 0)], [(0, C / 2), (340, C / 2)]]
    G['G'] = [arc(265, C / 2, 265, C / 2, 42, 360) + [(280, C / 2)]]
    G['H'] = [[(0, 0), (0, C)], [(460, 0), (460, C)], [(0, C / 2), (460, C / 2)]]
    G['I'] = [[(0, 0), (0, C)]]
    G['J'] = [[(380, C), (380, 180)] + arc(190, 180, 190, 180, 0, -180)]
    G['K'] = [[(0, 0), (0, C)], [(400, C), (0, 0.4 * C)], [(120, 0.52 * C), (420, 0)]]
    G['L'] = [[(0, C), (0, 0), (360, 0)]]
    G['M'] = [[(0, 0), (0, C), (280, 0.2 * C), (560, C), (560, 0)]]
    G['N'] = [[(0, 0), (0, C), (460, 0), (460, C)]]
    G['O'] = [ell(275, C / 2, 275, C / 2)]
    G['P'] = [[(0, 0), (0, C), (230, C)] + arc(230, 0.74 * C, 210, 0.26 * C, 90, -90) + [(0, 0.48 * C)]]
    G['Q'] = [ell(275, C / 2, 275, C / 2), [(330, 0.2 * C), (520, -80)]]
    G['R'] = [G['P'][0], [(210, 0.48 * C), (450, 0)]]
    G['S'] = [arc(240, 0.75 * C, 215, 0.25 * C, 25, 270) + arc(240, 0.25 * C, 215, 0.25 * C, 90, -155)[1:]]
    G['T'] = [[(0, C), (480, C)], [(240, C), (240, 0)]]
    G['U'] = [[(0, C), (0, 230)] + arc(230, 230, 230, 230, 180, 360) + [(460, C)]]
    G['V'] = [[(0, C), (255, 0), (510, C)]]
    G['W'] = [[(0, C), (185, 0), (370, C), (555, 0), (740, C)]]
    G['X'] = [[(0, C), (480, 0)], [(0, 0), (480, C)]]
    G['Y'] = [[(0, C), (245, 0.5 * C), (490, C)], [(245, 0.5 * C), (245, 0)]]
    G['Z'] = [[(0, C), (440, C), (0, 0), (440, 0)]]
    # digits
    G['0'] = [ell(230, C / 2, 230, C / 2)]
    G['1'] = [[(-120, 0.8 * C), (0, C), (0, 0)]]
    G['2'] = [arc(225, 0.73 * C, 215, 0.27 * C, 160, -38) + [(0, 0), (440, 0)]]
    G['3'] = [arc(220, 0.75 * C, 200, 0.25 * C, 150, -90) + arc(220, 0.25 * C, 225, 0.25 * C, 90, -155)[0:]]
    G['4'] = [[(360, 0), (360, C), (0, 0.3 * C), (480, 0.3 * C)]]
    G['5'] = [[(400, C), (40, C), (25, 0.52 * C)] + arc(215, 0.3 * C, 220, 0.3 * C, 125, -155)]
    G['6'] = [ell(225, 0.3 * C, 225, 0.3 * C), [(0, 0.3 * C), (50, 0.75 * C), (220, C), (390, C)]]
    G['7'] = [[(0, C), (440, C), (170, 0)]]
    G['8'] = [ell(220, 0.76 * C, 190, 0.24 * C), ell(220, 0.26 * C, 225, 0.26 * C)]
    G['9'] = flip(G['6'], 450, C)
    # punctuation
    G['.'] = [[(0, 0)]]
    G[','] = [[(0, 0), (-40, -120)]]
    G[':'] = [[(0, 0)], [(0, h)]]
    G[';'] = [[(0, 0), (-40, -120)], [(0, h)]]
    G['!'] = [[(0, C), (0, 190)], [(0, 0)]]
    G['?'] = [arc(215, 0.73 * C, 200, 0.27 * C, 170, -60) + [(215, 0.3 * C), (215, 190)], [(215, 0)]]
    G['-'] = [[(0, h * 0.55), (300, h * 0.55)]]
    G['–'] = [[(0, h * 0.55), (460, h * 0.55)]]
    G['—'] = [[(0, h * 0.55), (800, h * 0.55)]]
    G['_'] = [[(0, -90), (520, -90)]]
    G['+'] = [[(0, h * 0.55), (400, h * 0.55)], [(200, h * 0.55 - 200), (200, h * 0.55 + 200)]]
    G['='] = [[(0, h * 0.55 - 90), (400, h * 0.55 - 90)], [(0, h * 0.55 + 90), (400, h * 0.55 + 90)]]
    G['/'] = [[(0, -80), (330, C + 40)]]
    G['\\'] = [[(0, C + 40), (330, -80)]]
    G['|'] = [[(0, -200), (0, C + 60)]]
    G['('] = [arc(230, C / 2 - 20, 230, C / 2 + 150, 120, 240)]
    G[')'] = [arc(-30, C / 2 - 20, 230, C / 2 + 150, 60, -60)]
    G['['] = [[(160, C + 60), (0, C + 60), (0, -140), (160, -140)]]
    G[']'] = [[(0, C + 60), (160, C + 60), (160, -140), (0, -140)]]
    G['{'] = [[(190, C + 60)] + arc(190, C * 0.78, 90, C * 0.22 + 60, 90, 180)[1:] + [(100, C * 0.55)] + [(10, C * 0.5), (100, C * 0.45)] + [(100, C * 0.2)] + arc(190, C * 0.1, 90, C * 0.1 + 60, 180, 270)[1:] + [(190, -140)]]
    G['}'] = [[(0, C + 60)] + arc(0, C * 0.78, 90, C * 0.22 + 60, 90, 0)[1:] + [(90, C * 0.55)] + [(180, C * 0.5), (90, C * 0.45)] + [(90, C * 0.2)] + arc(0, C * 0.1, 90, C * 0.1 + 60, 0, -90)[1:] + [(0, -140)]]
    G['<'] = [[(380, h * 0.55 + 190), (0, h * 0.55), (380, h * 0.55 - 190)]]
    G['>'] = [[(0, h * 0.55 + 190), (380, h * 0.55), (0, h * 0.55 - 190)]]
    G["'"] = [[(0, C), (0, C - 170)]]
    G['"'] = [[(0, C), (0, C - 170)], [(170, C), (170, C - 170)]]
    G['’'] = [[(0, C), (-30, C - 170)]]
    G['‘'] = [[(0, C - 170), (30, C)]]
    G['“'] = [[(0, C - 170), (30, C)], [(170, C - 170), (200, C)]]
    G['”'] = [[(0, C), (-30, C - 170)], [(170, C), (140, C - 170)]]
    G['`'] = [[(0, C), (80, C - 130)]]
    G['^'] = [[(0, C - 220), (170, C), (340, C - 220)]]
    G['~'] = [arc(80, h * 0.55, 80, 70, 180, 0)[0:] + arc(240, h * 0.55, 80, 70, 180, 360)[1:]]
    G['*'] = [[(0, C - 90), (0, C + 90)], [(-80, C - 45), (80, C + 45)], [(-80, C + 45), (80, C - 45)]]
    G['#'] = [[(90, -30), (150, C + 30)], [(300, -30), (360, C + 30)], [(10, C * 0.3), (430, C * 0.3)], [(10, C * 0.7), (430, C * 0.7)]]
    G['$'] = [G['S'][0], [(240, -60), (240, C + 60)]]
    G['%'] = [ell(90, C - 110, 90, 110), ell(400, 110, 90, 110), [(0, 0), (490, C)]]
    G['&'] = [[(520, 0), (120, C * 0.55)] + arc(200, 0.76 * C, 130, 0.24 * C, 190, -80)[0:] + [(70, 0.5 * C)] + arc(230, 0.25 * C, 230, 0.25 * C, 170, 270)[0:] + [(400, 0.15 * C), (500, 0.3 * C)]]
    G['@'] = [arc(350, C / 2, 350, C * 0.52, 20, 360)[:-1] + arc(350, C / 2, 350, C * 0.52, 0, 0)[:1] + [(700, 90)], ell(340, C * 0.45, 130, 130), [(470, C * 0.45 + 90), (470, C * 0.2)]]
    G['…'] = [[(0, 0)], [(220, 0)], [(440, 0)]]
    G['•'] = [[(0, h * 0.55)]]
    G['°'] = [ell(0, C - 60, 70, 70)]
    G['·'] = [[(0, h * 0.55)]]
    G['¡'] = [[(0, h * 0.7), (0, -200 + 20)], [(0, h * 0.7 + 190 + 20)]]
    G['¿'] = flip(G['?'], 430, C)
    # accented letters: a mark over the base, centred on it
    def marks(top):
        t = top
        return {'grave': [[(-45, t + 100), (40, t)]], 'acute': [[(-40, t), (45, t + 100)]], 'circ': [[(-65, t), (0, t + 80), (65, t)]],
                'diaer': [[(-55, t + 45)], [(55, t + 45)]], 'tilde': [[(-80 + i * 160 / 10, t + 50 + 38 * math.sin(i / 10 * math.pi * 2 + math.pi)) for i in range(11)]], 'ring': [ell(0, t + 50, 36, 36)]}
    def put(base, mark, top):
        pts = [p for s in G[base] for p in s]; cx = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
        return G[base] + [[(x + cx, y) for x, y in s] for s in marks(top)[mark]]
    low = {'a': 'àáâãäå', 'e': 'èéêë', 'i': 'ìíîï', 'o': 'òóôõö', 'u': 'ùúûü', 'y': 'ýÿ', 'n': 'ñ'}
    kinds = {'à': 'grave', 'á': 'acute', 'â': 'circ', 'ã': 'tilde', 'ä': 'diaer', 'å': 'ring', 'è': 'grave', 'é': 'acute', 'ê': 'circ', 'ë': 'diaer', 'ì': 'grave', 'í': 'acute', 'î': 'circ', 'ï': 'diaer',
             'ò': 'grave', 'ó': 'acute', 'ô': 'circ', 'õ': 'tilde', 'ö': 'diaer', 'ù': 'grave', 'ú': 'acute', 'û': 'circ', 'ü': 'diaer', 'ý': 'acute', 'ÿ': 'diaer', 'ñ': 'tilde'}
    for b, chars in low.items():
        for ch in chars:
            G[ch] = put('ı' if b == 'i' else b, kinds[ch], h + 40)
            G[ch.upper()] = put(b.upper() if b != 'i' else 'I', kinds[ch], C + 40)
    G['ç'] = G['c'] + [[(r + 10, 0), (r + 10, -50)] + arc(r - 20, -50, 30, 60, 0, -150)]
    G['Ç'] = G['C'] + [[(265, 0), (265, -50)] + arc(235, -50, 30, 60, 0, -150)]
    G['Ÿ'] = put('Y', 'diaer', C + 40)
    return G


def tweak_dyslexia(G, m):
    """letters that mirror each other get their own shapes: tails, feet and bars"""
    h, C, a, d = m['xh'], m['cap'], m['asc'], m['desc']
    wb = m.get('bowl', 460)
    G['l'] = [[(0, a), (0, 90)] + arc(120, 90, 120, 90, 180, 270)]
    G['I'] = [[(0, 0), (0, C)], [(-90, C), (90, C)], [(-90, 0), (90, 0)]]
    G['b'] = G['b'] + [[(0, a), (-90, a - 40)]]
    G['d'] = G['d'] + [[(wb, 0), (wb + 100, 20)]]
    G['p'] = G['p'] + [[(0, d), (-100, d)]]
    G['q'] = G['q'] + [[(wb, d), (wb + 100, d + 40)]]
    G['i'] = [[(0, 0), (0, h)], [(0, h + 160)]]
    G['j'] = G['j']
    G['J'] = [[(380, C), (380, 180)] + arc(190, 180, 190, 180, 0, -180), [(300, C), (460, C)]]
    G['1'] = [[(-120, 0.8 * C), (0, C), (0, 0)], [(-110, 0), (110, 0)]]
    G['y'] = [[(0, h), (215, 0)], [(430, h), (150, d), (40, d + 30)]]
    G['t'] = [[(0, h + 170), (0, 110)] + arc(140, 110, 140, 110, 180, 270) + [(220, 0)], [(-70, h), (230, h)]]
    return G


def serif_up(G, m):
    """small slab feet and flags where a stem ends on the baseline, x-height, cap height or ascender"""
    levels = {0: 'b', m['xh']: 't', m['cap']: 'b2', m['asc']: 't'}
    out = {}
    for ch, strokes in G.items():
        add = []
        if ch in '.,:;!?-_+=/\\|()[]{}<>\'"^~*#$%&@`' or not ch.isalnum():
            out[ch] = strokes; continue
        for s in strokes:
            if len(s) < 2: continue
            for end, prev in ((s[0], s[1]), (s[-1], s[-2])):
                dx, dy = abs(end[0] - prev[0]), abs(end[1] - prev[1])
                if dy < 1 or dx > 0.35 * dy or abs(end[0] - s[0][0]) + abs(end[1] - s[0][1]) < 0.1 and s[0] == s[-1]: continue
                for lv, kind in levels.items():
                    if abs(end[1] - lv) < 2:
                        x, y = end
                        if ch.isdigit() and lv == 0 and ch not in '1': continue
                        add.append([(x - 95, y), (x + 95, y)] if (kind != 't' or lv == m['asc']) and kind != 't' else [(x - 105, y), (x + (0 if lv == m['xh'] else 95), y)])
                        break
        out[ch] = strokes + add
    return out


FAMILIES = {
    'IMC Sans': dict(file='imc-sans', metrics=dict(xh=520, cap=720, asc=770, desc=-210), pen=1.0, contrast=1.0, sb=48, spacing=1.0),
    'IMC Serif': dict(file='imc-serif', metrics=dict(xh=500, cap=700, asc=760, desc=-210), pen=1.12, contrast=0.42, sb=52, serif=True, spacing=1.0),
    'IMC Dyslexia': dict(file='imc-dyslexia', metrics=dict(xh=580, cap=740, asc=800, desc=-250, bowl=500), pen=1.08, contrast=1.0, sb=84, dys=True, spacing=1.12),
}


def outline(G, ch, R, fam, italic, m):
    strokes = G[ch]
    geoms = []
    c = fam['contrast']
    for s in strokes:
        shape = Point(s[0]) if len(s) == 1 else LineString(s)
        if c != 1.0:
            shape = affinity.scale(shape, 1, 1 / c, origin=(0, 0))
            shape = shape.buffer(R, quad_segs=6)
            shape = affinity.scale(shape, 1, c, origin=(0, 0))
        else:
            shape = shape.buffer(R, quad_segs=6)
        geoms.append(shape)
    g = unary_union(geoms)
    if fam.get('dys'):   # a heavier base, so the letters sit on the line
        pts = [p for s in strokes for p in s]
        low = [LineString(s).intersection(box(-2000, -400, 3000, m['xh'] * 0.2)) if len(s) > 1 else Point(s[0]) for s in strokes]
        low = [x for x in low if not x.is_empty]
        if low:
            heavy = unary_union([x.buffer(R * 1.5, quad_segs=6) for x in low]).intersection(box(-2000, -400, 3000, m['xh'] * 0.22))
            g = unary_union([g, heavy])
    if italic:
        g = affinity.skew(g, xs=12.0, origin=(0, 0))
    return g.simplify(1.0)


def to_glyph(g, lsb_shift):
    pen = TTGlyphPen(None)
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    for p in polys:
        p = orient(p, sign=-1.0)
        for ring in [p.exterior] + list(p.interiors):
            pts = []
            for x, y in list(ring.coords)[:-1]:
                q = (int(round(x + lsb_shift)), int(round(y)))
                if not pts or pts[-1] != q: pts.append(q)
            if len(pts) < 3: continue
            pen.moveTo(pts[0])
            for q in pts[1:]: pen.lineTo(q)
            pen.closePath()
    return pen.glyph()


def build(name, fam, wght, wname, R0, italic):
    m = fam['metrics']; G = skeleton(m)
    if fam.get('dys'): G = tweak_dyslexia(G, m)
    if fam.get('serif'): G = serif_up(G, m)
    R = R0 * fam['pen']
    order = ['.notdef', 'space'] + [('uni%04X' % ord(c)) for c in sorted(G)]
    glyphs, metrics, cmap = {'.notdef': None}, {}, {32: 'space'}
    empty = TTGlyphPen(None).glyph()
    # .notdef: a box
    pen = TTGlyphPen(None); pen.moveTo((60, 0)); pen.lineTo((60, 700)); pen.lineTo((440, 700)); pen.lineTo((440, 0)); pen.closePath()
    pen.moveTo((120, 60)); pen.lineTo((380, 60)); pen.lineTo((380, 640)); pen.lineTo((120, 640)); pen.closePath()
    glyphs['.notdef'] = pen.glyph(); metrics['.notdef'] = (500, 60)
    glyphs['space'] = empty; metrics['space'] = (int(260 * fam['spacing']), 0)
    for c in sorted(G):
        gname = 'uni%04X' % ord(c); g = outline(G, c, R, fam, italic, m)
        minx, miny, maxx, maxy = g.bounds
        sb = fam['sb'] * fam['spacing']
        if c in '.,:;!\'"’‘“”`•·¡': sb *= 1.1
        shift = sb - minx
        glyphs[gname] = to_glyph(g, shift); metrics[gname] = (int(round(maxx - minx + 2 * sb)), int(round(sb)))
        cmap[ord(c)] = gname
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order); fb.setupCharacterMap(cmap)
    fb.setupGlyf({n: glyphs[n] for n in order}); fb.setupHorizontalMetrics({n: metrics[n] for n in order})
    fb.setupHorizontalHeader(ascent=920, descent=-280, lineGap=0)
    style = wname + (' Italic' if italic and wname != 'Regular' else ' Italic' if italic else '')
    style = 'Italic' if (italic and wname == 'Regular') else style
    ps = (name + '-' + style).replace(' ', '')
    fb.setupNameTable({'familyName': name + ('' if wght == 400 and not italic else ' ' + wname) if False else name, 'styleName': style, 'uniqueFontIdentifier': ps, 'fullName': name + ' ' + style, 'psName': ps, 'version': 'Version 1.0'})
    fb.setupOS2(version=4, usWeightClass=wght, sTypoAscender=920, sTypoDescender=-280, sTypoLineGap=0, usWinAscent=1000, usWinDescent=330, sxHeight=m['xh'], sCapHeight=m['cap'],
                fsSelection=(0x01 if italic else 0) | (0x40 if (wght == 400 and not italic) else 0) | 0x80, achVendID='IMCC')
    fb.setupPost(italicAngle=-12.0 if italic else 0.0, underlinePosition=-100, underlineThickness=60)
    fb.font['head'].macStyle = (2 if italic else 0) | (1 if wght >= 700 else 0)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, '%s-%d%s.ttf' % (fam['file'], wght, '-italic' if italic else ''))
    fb.save(path); return path


if __name__ == '__main__':
    only = sys.argv[1:]
    css = ['/* IMC fonts: three families, nine weights, upright and italic (made by _build/make_fonts.py) */']
    for name, fam in FAMILIES.items():
        for wght, wname, R0 in WEIGHTS:
            for italic in (False, True):
                if only and fam['file'] not in only: pass
                else: build(name, fam, wght, wname, R0, italic)
                css.append('@font-face { font-family: "%s"; font-weight: %d; font-style: %s; font-display: swap; src: url("%s-%d%s.ttf") format("truetype"); }' % (name, wght, 'italic' if italic else 'normal', fam['file'], wght, '-italic' if italic else ''))
        print('built', name)
    open(os.path.join(OUT, 'fonts.css'), 'w').write('\n'.join(css) + '\n')
