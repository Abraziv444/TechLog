#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf2book.py — собирает набор PDF одного раздела в ОДИН самодостаточный HTML-учебник
для экрана «Учёба» TechLog.

Что сохраняется точно: положение каждой строки и слова, абзацы, колонтитулы,
рамки и заливки, векторные схемы, фотографии, цветная закладка на поле страницы.
Что меняется осознанно: шрифт — единый для всех учебников (PT Serif / PT Sans,
OFL, кириллица + латиница). Ширина каждого фрагмента подгоняется к оригиналу
через SVG textLength, поэтому строки не разъезжаются.

Страница = <svg viewBox="0 0 612 792">: слой векторов, слой картинок (WebP,
data:), слой текста (<text>, выделяется и ищется). Всё вместе кладётся в один
JSON внутри HTML, страницы рисуются по мере прокрутки.

  python3 pdf2book.py --src ./RU --out ../section-1-ru.html --lang ru \
         --section 1 --title "Устранение последствий залива" --color "#1CB0F6"

Зависимости: pymupdf, pillow, fonttools, brotli
  pip install pymupdf pillow fonttools brotli --break-system-packages
"""

import argparse, base64, io, json, os, re, subprocess, sys

import pymupdf
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, 'fonts')

# --- единый шрифт всех учебников -------------------------------------------
FONT_FILES = {
    ('serif', 400, 'normal'): 'PTSerif-Regular.ttf',
    ('serif', 700, 'normal'): 'PTSerif-Bold.ttf',
    ('serif', 400, 'italic'): 'PTSerif-Italic.ttf',
    ('serif', 700, 'italic'): 'PTSerif-BoldItalic.ttf',
    ('sans', 400, 'normal'): 'PTSans-Regular.ttf',
    ('sans', 700, 'normal'): 'PTSans-Bold.ttf',
    ('sans', 400, 'italic'): 'PTSans-Italic.ttf',
    ('sans', 700, 'italic'): 'PTSans-BoldItalic.ttf',
}
FONT_URL = ('https://raw.githubusercontent.com/google/fonts/main/ofl/'
            '{fam}/PT_{Fam}-Web-{style}.ttf')
# класс в SVG -> (семейство, насыщенность, наклон)
CLS = {
    ('serif', 400, 'normal'): 'a', ('serif', 700, 'normal'): 'b',
    ('serif', 400, 'italic'): 'c', ('serif', 700, 'italic'): 'd',
    ('sans', 400, 'normal'): 'e', ('sans', 700, 'normal'): 'f',
    ('sans', 400, 'italic'): 'g', ('sans', 700, 'italic'): 'h',
}
FALLBACK = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'   # добивка редких знаков

PW, PH = 612.0, 792.0          # US Letter в пунктах — размер страницы книги


# ---------------------------------------------------------------- утилиты ---
def num(v):
    """Компактное число для SVG: 2 знака, без хвостовых нулей."""
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def rgb(c):
    if isinstance(c, (tuple, list)):
        r, g, b = [max(0, min(255, round(x * 255))) for x in (c[0], c[1], c[2])]
    else:
        r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
    return '#%02x%02x%02x' % (r, g, b)


def ensure_fonts():
    os.makedirs(FONT_DIR, exist_ok=True)
    for (fam, w, st), fn in FONT_FILES.items():
        p = os.path.join(FONT_DIR, fn)
        if os.path.exists(p):
            continue
        style = {(400, 'normal'): 'Regular', (700, 'normal'): 'Bold',
                 (400, 'italic'): 'Italic', (700, 'italic'): 'BoldItalic'}[(w, st)]
        url = FONT_URL.format(fam='pt' + fam, Fam='Serif' if fam == 'serif' else 'Sans',
                              style=style)
        sys.stderr.write('качаю шрифт %s\n' % fn)
        r = subprocess.run(['curl', '-sfL', '-o', p, url])
        if r.returncode or not os.path.exists(p):
            sys.exit('не удалось скачать %s — положите файл в %s вручную' % (fn, FONT_DIR))


# ------------------------------------------------------- шрифты: метрики ----
class Metrics:
    """Ширины символов выбранного шрифта — чтобы понять, насколько текст
    расходится с оригиналом и нужно ли сжимать его по ширине."""

    def __init__(self, path):
        f = TTFont(path, lazy=True)
        self.upem = f['head'].unitsPerEm
        cmap = f.getBestCmap()
        hmtx = f['hmtx']
        self.w = {}
        for cp, gname in cmap.items():
            try:
                self.w[cp] = hmtx[gname][0] / self.upem
            except KeyError:
                pass
        f.close()

    def width(self, s, size):
        t = 0.0
        for ch in s:
            w = self.w.get(ord(ch))
            if w is None:
                w = self.w.get(0x20, 0.3)
            t += w
        return t * size

    def has(self, ch):
        return ord(ch) in self.w


def subset_font(path, chars, name):
    """Вырезаем из шрифта только используемые символы и жмём в woff2."""
    opts = Options()
    opts.layout_features = ['kern', 'liga', 'locl', 'ccmp']
    opts.notdef_outline = True
    opts.recalc_bounds = False
    opts.drop_tables += ['DSIG']
    opts.name_IDs = ['*']
    opts.name_legacy = True
    opts.name_languages = ['*']
    f = TTFont(path)
    s = Subsetter(options=opts)
    s.populate(text=''.join(sorted(chars)))
    s.subset(f)
    f.flavor = 'woff2'
    buf = io.BytesIO()
    f.save(buf)
    f.close()
    return buf.getvalue()


# ------------------------------------------------------------- имена PDF ----
def unmangle(name):
    """'#U0440#U0430...' → кириллица (так распаковываются имена из архива)."""
    return re.sub(r'#U([0-9A-Fa-f]{4})', lambda m: chr(int(m.group(1), 16)), name)


ROMAN = [(1000, 'm'), (900, 'cm'), (500, 'd'), (400, 'cd'), (100, 'c'), (90, 'xc'),
         (50, 'l'), (40, 'xl'), (10, 'x'), (9, 'ix'), (5, 'v'), (4, 'iv'), (1, 'i')]


def to_roman(n):
    out = ''
    for v, r in ROMAN:
        while n >= v:
            out += r
            n -= v
    return out


def from_roman(s):
    vals = {'i': 1, 'v': 5, 'x': 10, 'l': 50, 'c': 100, 'd': 500, 'm': 1000}
    tot = 0
    for i, ch in enumerate(s.lower()):
        v = vals[ch]
        tot += -v if i + 1 < len(s) and vals[s[i + 1].lower()] > v else v
    return tot


def order_files(src):
    """Титульные листы первыми (без номера или с римскими i–iii), дальше по
    номеру первой страницы. Возвращает (ключ сортировки, путь, имя, функция подписи)."""
    out = []
    for fn in os.listdir(src):
        if not fn.lower().endswith('.pdf'):
            continue
        nice = unmangle(fn)
        m = re.search(r'page\s*(\d+)\s*[-–]\s*(\d+)', nice)
        mr = re.search(r'page\s*([ivxlc]+)\s*[-–]\s*([ivxlc]+)\b', nice, re.I)
        if m:
            start = int(m.group(1))
            lab = (lambda st: lambda i: str(st + i))(start)
        elif mr:
            start = -1000 + from_roman(mr.group(1))
            lab = (lambda st: lambda i: to_roman(st + i))(from_roman(mr.group(1)))
        else:
            start = -2000
            lab = lambda i: ''
        out.append((start, os.path.join(src, fn), nice, lab))
    out.sort(key=lambda x: (x[0], x[2]))
    if not out:
        sys.exit('в %s нет PDF-файлов' % src)
    return out


# --------------------------------------------------------- разбор шрифта ----
def style_of(fontname):
    """Имя шрифта из PDF → (семейство, насыщенность, наклон)."""
    n = re.sub(r'^[A-Z]{6}\+', '', fontname or '')
    low = n.lower().replace(' ', '')
    bold = 'bold' in low or 'black' in low or 'heavy' in low or 'semibold' in low
    ital = 'italic' in low or 'oblique' in low or low.endswith('-it')
    sans = ('sans' in low or 'arial' in low or 'helvetica' in low
            or 'verdana' in low or 'tahoma' in low or 'calibri' in low
            or 'roboto' in low or 'segoe' in low)
    if 'serif' in low and 'sans' not in low:
        sans = False
    return ('sans' if sans else 'serif', 700 if bold else 400,
            'italic' if ital else 'normal')


class FontResolver:
    """Type3-шрифты приходят как «Type3 (8 0 R)» — настоящее имя лежит
    в FontDescriptor/FontName, достаём его один раз на документ."""

    def __init__(self, doc):
        self.doc = doc
        self.cache = {}

    def name(self, span_font):
        m = re.match(r'Type3 \((\d+) 0 R\)', span_font or '')
        if not m:
            return span_font
        xref = int(m.group(1))
        if xref in self.cache:
            return self.cache[xref]
        nm = ''
        try:
            k, v = self.doc.xref_get_key(xref, 'FontDescriptor')
            if k == 'xref':
                fd = int(v.split()[0])
                k2, v2 = self.doc.xref_get_key(fd, 'FontName')
                if k2 in ('name', 'string'):
                    nm = v2.lstrip('/')
        except Exception:
            nm = ''
        self.cache[xref] = nm or span_font
        return self.cache[xref]


# ------------------------------------------------------------- картинки -----
def img_data(doc, xref, w_pt, h_pt, ppt, quality, cache):
    key = (xref, round(w_pt, 1), round(h_pt, 1))
    if key in cache:
        return cache[key]
    raw = doc.extract_image(xref)
    im = Image.open(io.BytesIO(raw['image']))
    if im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    tw = max(24, round(w_pt * ppt))
    th = max(24, round(h_pt * ppt))
    if tw < im.width:
        im = im.resize((tw, th), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=quality, method=6)
    best, mime = b.getvalue(), 'image/webp'
    # схемы и графики с плоскими заливками часто лучше сжимаются без потерь
    small = im if im.width * im.height <= 250000 else im.resize(
        (im.width // 2, im.height // 2), Image.NEAREST)
    try:
        colors = small.convert('RGB').getcolors(4096)
    except Exception:
        colors = None
    if colors is not None:
        b2 = io.BytesIO()
        im.save(b2, 'WEBP', lossless=True, method=6)
        if b2.tell() < len(best):
            best = b2.getvalue()
    uri = 'data:%s;base64,%s' % (mime, base64.b64encode(best).decode())
    cache[key] = (uri, len(best))
    return cache[key]


# ------------------------------------------------------------- векторы ------
def draw_path(dr):
    """Путь PDF → атрибут d для SVG."""
    d = []
    cur = None
    for it in dr['items']:
        op = it[0]
        if op == 'l':
            p1, p2 = it[1], it[2]
            if cur is None or abs(cur.x - p1.x) > 0.01 or abs(cur.y - p1.y) > 0.01:
                d.append('M%s %s' % (num(p1.x), num(p1.y)))
            d.append('L%s %s' % (num(p2.x), num(p2.y)))
            cur = p2
        elif op == 'c':
            p1, p2, p3, p4 = it[1], it[2], it[3], it[4]
            if cur is None or abs(cur.x - p1.x) > 0.01 or abs(cur.y - p1.y) > 0.01:
                d.append('M%s %s' % (num(p1.x), num(p1.y)))
            d.append('C%s %s %s %s %s %s' % (num(p2.x), num(p2.y), num(p3.x),
                                             num(p3.y), num(p4.x), num(p4.y)))
            cur = p4
        elif op == 're':
            r = it[1]
            o = it[2] if len(it) > 2 else 1
            x0, y0, x1, y1 = r.x0, r.y0, r.x1, r.y1
            w, h = num(x1 - x0), num(y1 - y0)
            if o == 1:
                d.append('M%s %sh%sv%sh-%sz' % (num(x0), num(y0), w, h, w))
            else:
                d.append('M%s %sv%sh%sv-%sz' % (num(x0), num(y0), h, w, h))
            cur = None
        elif op == 'qu':
            q = it[1]
            d.append('M%s %sL%s %sL%s %sL%s %sZ' % (
                num(q.ul.x), num(q.ul.y), num(q.ur.x), num(q.ur.y),
                num(q.lr.x), num(q.lr.y), num(q.ll.x), num(q.ll.y)))
            cur = None
    if dr.get('closePath'):
        d.append('Z')
    return ''.join(d)


def draw_attrs(dr):
    """Стилевые атрибуты пути — одинаковые склеиваем в один <path>."""
    a = []
    typ = dr.get('type', 'f')
    if typ in ('f', 'fs') and dr.get('fill') is not None:
        a.append(' fill="%s"' % rgb(dr['fill']))
        if dr.get('even_odd'):
            a.append(' fill-rule="evenodd"')
        fo = dr.get('fill_opacity', 1)
        if fo is not None and fo < 1:
            a.append(' fill-opacity="%s"' % num(fo))
    else:
        a.append(' fill="none"')
    if typ in ('s', 'fs') and dr.get('color') is not None:
        a.append(' stroke="%s"' % rgb(dr['color']))
        w = dr.get('width')
        if w is not None and abs(w - 1) > 0.01:
            a.append(' stroke-width="%s"' % num(w))
        so = dr.get('stroke_opacity', 1)
        if so is not None and so < 1:
            a.append(' stroke-opacity="%s"' % num(so))
        dash = (dr.get('dashes') or '').strip('[] ')
        if dash and dash != '0':
            a.append(' stroke-dasharray="%s"' % dash.replace(']', '').strip())
        lc = dr.get('lineCap')
        if lc:
            cap = max(lc) if isinstance(lc, (list, tuple)) else lc
            a.append(' stroke-linecap="%s"' % ('round' if cap == 1 else
                                               'square' if cap == 2 else 'butt'))
        lj = dr.get('lineJoin')
        if lj:
            a.append(' stroke-linejoin="%s"' % ('round' if lj == 1 else
                                                'bevel' if lj == 2 else 'miter'))
    return ''.join(a)


# ------------------------------------------------------------- страница -----
def build_page(doc, page, res, metrics, charsets, ppt, quality, icache, stats):
    parts = ['<path d="M0 0L612 0L612 792L0 792Z" fill="#fff"/>']

    # 1. векторы: заливки, рамки, схемы. Идущие подряд пути с одинаковым стилем
    #    склеиваем в один <path> — на страницах с отточиями это экономит сотни КБ
    cur_a, cur_d = None, []
    bands = []                        # полосы колонтитула — по ним строится оглавление

    def flush():
        if cur_d:
            parts.append('<path d="%s"%s/>' % (''.join(cur_d), cur_a))
            del cur_d[:]

    for dr in page.get_drawings():
        r = dr.get('rect')
        if r is not None and r.width >= PW - 0.5 and r.height >= PH - 0.5 \
                and dr.get('type') == 'f' and dr.get('fill') == (1.0, 1.0, 1.0):
            continue                      # белая подложка страницы — уже нарисована
        if r is not None and dr.get('type') == 'f' and r.y0 < 100 and 12 < r.height < 30 \
                and r.width > 400:
            bands.append(r)
        d = draw_path(dr)
        if not d:
            continue
        a = draw_attrs(dr)
        if a != cur_a:
            flush()
            cur_a = a
        cur_d.append(d)
    flush()

    # 2. картинки
    for info in page.get_image_info(xrefs=True):
        xref = info.get('xref') or 0
        if not xref:
            continue
        m = info['transform']
        bb = info['bbox']
        w_pt = max(abs(m[0]), abs(m[1]))
        h_pt = max(abs(m[3]), abs(m[2]))
        try:
            uri, nb = img_data(doc, xref, w_pt, h_pt, ppt, quality, icache)
        except Exception as e:
            sys.stderr.write('картинка xref=%s: %s\n' % (xref, e))
            continue
        stats['img'] += 1
        stats['imgb'] += nb
        if abs(m[1]) < 1e-6 and abs(m[2]) < 1e-6 and m[0] > 0 and m[3] > 0:
            parts.append('<image x="%s" y="%s" width="%s" height="%s" '
                         'preserveAspectRatio="none" href="%s"/>'
                         % (num(bb[0]), num(bb[1]), num(m[0]), num(m[3]), uri))
        else:
            parts.append('<g transform="matrix(%s,%s,%s,%s,%s,%s)">'
                         '<image width="1" height="1" preserveAspectRatio="none" '
                         'href="%s"/></g>'
                         % (num(m[0]), num(m[1]), num(m[2]), num(m[3]),
                            num(m[4]), num(m[5]), uri))

    # 3. текст
    head = []
    td = page.get_text('dict', flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
    for blk in td['blocks']:
        if blk.get('type') != 0:
            continue
        for line in blk['lines']:
            dx, dy = line['dir']
            first = True
            for sp in line['spans']:
                txt = sp['text']
                if not txt or not txt.strip():
                    continue
                name = res.name(sp['font'])
                fam, weight, style = style_of(name)
                if sp['flags'] & 16:
                    weight = 700
                if sp['flags'] & 2:
                    style = 'italic'
                key = (fam, weight, style)
                if key not in CLS:
                    key = (fam, 400, 'normal')
                charsets[key].update(txt)
                size = sp['size']
                ox, oy = sp['origin']
                bb = sp['bbox']
                target = abs((bb[2] - bb[0]) * dx) + abs((bb[3] - bb[1]) * dy)
                natural = metrics[key].width(txt, size)
                a = ['<text class="%s%s" ' % (CLS[key], ' n' if first else '')]
                first = False
                if abs(dx - 1) > 1e-6 or abs(dy) > 1e-6:
                    a.append('transform="matrix(%s,%s,%s,%s,%s,%s)" x="0" y="0" '
                             % (num(dx), num(dy), num(-dy), num(dx), num(ox), num(oy)))
                else:
                    a.append('x="%s" y="%s" ' % (num(ox), num(oy)))
                a.append('font-size="%s"' % num(size))
                col = rgb(sp['color'])
                stats['col'][col] = stats['col'].get(col, 0) + 1
                a.append('\x00%s\x00' % col)      # цвет проставим после подсчёта
                if natural > 0.1 and target > 0.1:
                    ratio = target / natural
                    if abs(ratio - 1) > 0.006:
                        a.append(' textLength="%s"' % num(target))
                        if ratio < 0.94 or ratio > 1.06:
                            a.append(' lengthAdjust="spacingAndGlyphs"')
                        stats['fit'] += 1
                if txt != txt.strip():
                    a.append(' xml:space="preserve"')
                a.append('>%s</text>' % esc(txt))
                parts.append(''.join(a))
                stats['span'] += 1
                if sp['color'] == 0xffffff and any(b.x0 <= ox <= b.x1 and b.y0 <= oy <= b.y1
                                                    for b in bands):
                    head.append((ox, txt.strip()))

    head.sort()
    title = head[0][1] if head else ''
    chap = ''
    if len(head) > 1:
        m = re.search(r'(\d+)', head[-1][1])
        chap = m.group(1) if m else ''
    return ''.join(parts), title, chap


# --------------------------------------------------------------- сборка -----
def fill_template(tpl, faces_css, title, lang, blob):
    return (tpl.replace('/*FONTS*/', faces_css)
               .replace('<!--TITLE-->', esc(title or 'Учебник'))
               .replace('"ru"<!--LANG-->', '"%s"' % lang)
               .replace('<!--DATA-->', blob))


def retemplate(path, tpl_path):
    """Готовый учебник → тот же учебник на свежем viewer.html (данные не трогаем)."""
    with open(path, encoding='utf-8') as f:
        old = f.read()
    with open(tpl_path, encoding='utf-8') as f:
        tpl = f.read()
    m_css = re.search(r'<style>\n(.*?)\n:root\{', old, re.S)
    m_data = re.search(r'<script id="bk" type="application/json">(.*?)</script>', old, re.S)
    m_title = re.search(r'<title>(.*?)</title>', old, re.S)
    m_lang = re.search(r'<html lang="(\w+)">', old)
    if not (m_css and m_data and m_title and m_lang):
        sys.exit('%s: не похоже на учебник, собранный pdf2book' % path)
    title = (m_title.group(1).replace('&amp;', '&').replace('&lt;', '<')
             .replace('&gt;', '>'))
    html = fill_template(tpl, m_css.group(1), title, m_lang.group(1), m_data.group(1))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    sys.stderr.write('обновлён просмотрщик: %s (%.2f МБ)\n' % (path, os.path.getsize(path) / 1e6))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', help='папка с PDF-файлами раздела')
    ap.add_argument('--out', help='итоговый .html')
    ap.add_argument('--lang', default='ru', choices=['ru', 'en'])
    ap.add_argument('--section', type=int, default=1)
    ap.add_argument('--title', default='')
    ap.add_argument('--color', default='#1CB0F6')
    ap.add_argument('--ppt', type=float, default=2.5, help='пикселей на пункт в картинках')
    ap.add_argument('--quality', type=int, default=72)
    ap.add_argument('--tpl', default=os.path.join(HERE, 'viewer.html'))
    ap.add_argument('--update', nargs='+', metavar='BOOK.html',
                    help='не конвертировать заново, а пересобрать готовые учебники '
                         'на новом шаблоне просмотрщика (viewer.html)')
    args = ap.parse_args()

    if args.update:
        for path in args.update:
            retemplate(path, args.tpl)
        return

    if not args.src or not args.out:
        ap.error('нужны --src и --out (или --update BOOK.html)')
    ensure_fonts()
    metrics = {k: Metrics(os.path.join(FONT_DIR, v)) for k, v in FONT_FILES.items()}
    charsets = {k: set() for k in FONT_FILES}
    icache = {}
    stats = {'img': 0, 'imgb': 0, 'span': 0, 'fit': 0, 'col': {}}

    files = order_files(args.src)
    pages, toc, labels = [], [], []
    for start, path, nice, lab in files:
        doc = pymupdf.open(path)
        res = FontResolver(doc)
        for i, page in enumerate(doc):
            svg, title, chap = build_page(doc, page, res, metrics, charsets,
                                          args.ppt, args.quality, icache, stats)
            label = lab(i)
            pages.append({'l': label, 's': svg})
            labels.append(label)
            key = (chap, title)
            if title and (not toc or toc[-1]['k'] != list(key)):
                toc.append({'k': list(key), 'n': chap, 't': title, 'p': len(pages) - 1})
            elif not title and not toc:
                toc.append({'k': ['', ''], 'n': '', 't': '', 'p': 0})
        n_pages = doc.page_count
        doc.close()
        sys.stderr.write('  %s — %d стр.\n' % (nice, n_pages))

    for e in toc:
        e.pop('k', None)

    # цвет текста: самый частый уходит в CSS, остальные — атрибутом
    main_col = max(stats['col'], key=stats['col'].get) if stats['col'] else '#000000'
    col_re = re.compile('\x00(#[0-9a-f]{6})\x00')
    for pg in pages:
        pg['s'] = col_re.sub(lambda m: '' if m.group(1) == main_col
                             else ' fill="%s"' % m.group(1), pg['s'])

    # шрифты: только использованные знаки
    faces = []
    fb_chars = set()
    for key, chars in charsets.items():
        if not chars:
            continue
        m = metrics[key]
        miss = {c for c in chars if not m.has(c)}
        fb_chars |= miss
        chars = (chars - miss) | set(' 0123456789')
        data = subset_font(os.path.join(FONT_DIR, FONT_FILES[key]), chars, key)
        fam, weight, style = key
        faces.append('@font-face{font-family:Bk%s;font-weight:%d;font-style:%s;'
                     'font-display:block;src:url(data:font/woff2;base64,%s) format("woff2")}'
                     % ('Se' if fam == 'serif' else 'Sa', weight, style,
                        base64.b64encode(data).decode()))
    if fb_chars and os.path.exists(FALLBACK):
        sys.stderr.write('добивка редких знаков: %s\n' % ''.join(sorted(fb_chars)))
        data = subset_font(FALLBACK, fb_chars | set(' '), 'fb')
        faces.append('@font-face{font-family:BkFb;font-display:block;'
                     'src:url(data:font/woff2;base64,%s) format("woff2")}'
                     % base64.b64encode(data).decode())

    with open(args.tpl, encoding='utf-8') as f:
        tpl = f.read()

    meta = {'lang': args.lang, 'section': args.section, 'title': args.title,
            'color': args.color, 'pages': len(pages), 'labels': labels, 'toc': toc}
    blob = json.dumps({'meta': meta, 'p': pages}, ensure_ascii=False,
                      separators=(',', ':')).replace('</', '<\\/')

    html = fill_template(tpl, ''.join(faces) + 'svg{fill:%s}' % main_col,
                         args.title, args.lang, blob)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(html)

    sz = os.path.getsize(args.out)
    sys.stderr.write(
        'готово: %s — %d стр., %d картинок (%.2f МБ), %d фрагментов текста '
        '(%d подогнано по ширине), файл %.2f МБ\n'
        % (args.out, len(pages), stats['img'], stats['imgb'] / 1e6,
           stats['span'], stats['fit'], sz / 1e6))


if __name__ == '__main__':
    main()
