#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-icons.py — иконка TechLog (v1.08.68): тёмный скруглённый квадрат в цветах
приложения, полное имя «Tech Log» (белый + синий, как в шапке) и зелёная
плашка с галочкой — «работа отмечена». Собирает icon-512, icon-192,
icon-maskable-512 (без скругления, всё важное в безопасной зоне 80 %),
favicon-64 и apple-touch-icon-180.

  python3 icons/make-icons.py          # из корня репозитория
Нужны: pillow, шрифт Poppins Bold (лежит в /usr/share/fonts/truetype/google-fonts
или укажите путь в FONT).
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.environ.get('FONT') or next((p for p in (
    '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf',
    os.path.join(HERE, 'Poppins-Bold.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if os.path.exists(p)), None)
if not FONT:
    sys.exit('нет шрифта: положите Poppins-Bold.ttf в icons/ или задайте FONT=…')

BG_TOP, BG_BOT = (28, 43, 51), (15, 23, 27)          # --panel-2 → --bg
GREEN, GREEN_DK = (88, 204, 2), (63, 154, 2)          # --green / --green-dk
BLUE, WHITE = (28, 176, 246), (241, 247, 251)         # --blue / --text


def gradient(size, top, bot):
    im = Image.new('RGB', (size, size))
    px = im.load()
    for y in range(size):
        k = y / (size - 1)
        px_row = tuple(round(top[i] + (bot[i] - top[i]) * k) for i in range(3))
        for x in range(size):
            px[x, y] = px_row
    return im


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def draw_icon(size=512, rounded=True, scale=1.0):
    """scale < 1 — сжимает содержимое к центру (для maskable: безопасная зона)."""
    im = gradient(size, BG_TOP, BG_BOT).convert('RGBA')
    S = size / 512.0
    d = ImageDraw.Draw(im)

    # мягкое зелёное свечение в правом верхнем углу — «живой» фон
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((size * .55, -size * .25, size * 1.25, size * .45), fill=GREEN + (70,))
    glow = glow.filter(ImageFilter.GaussianBlur(size * .16))
    im.alpha_composite(glow)

    # содержимое рисуем в слое и масштабируем к центру (maskable)
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)

    # зелёная плашка с галочкой — вверху справа
    bx0, by0 = 356 * S, 58 * S
    bw = 94 * S
    ld.rounded_rectangle((bx0 + 5 * S, by0 + 7 * S, bx0 + bw + 5 * S, by0 + bw + 7 * S),
                         radius=25 * S, fill=GREEN_DK + (255,))
    ld.rounded_rectangle((bx0, by0, bx0 + bw, by0 + bw), radius=25 * S, fill=GREEN + (255,))
    cx, cy = bx0 + bw / 2, by0 + bw / 2
    pts = [(cx - 24 * S, cy + 1 * S), (cx - 7 * S, cy + 18 * S), (cx + 27 * S, cy - 18 * S)]
    ld.line(pts, fill=(255, 255, 255, 255), width=round(13 * S), joint='curve')
    for px_, py_ in pts:
        r = 6.5 * S
        ld.ellipse((px_ - r, py_ - r, px_ + r, py_ + r), fill=(255, 255, 255, 255))

    # надпись: Tech (белый) / Log (синий) — по базовым линиям, чтобы строки
    # стояли ровно независимо от внутренних отступов шрифта
    f1 = ImageFont.truetype(FONT, round(142 * S))
    x = 58 * S
    ld.text((x, 292 * S), 'Tech', font=f1, fill=WHITE + (255,), anchor='ls')
    ld.text((x, 428 * S), 'Log', font=f1, fill=BLUE + (255,), anchor='ls')

    if scale != 1.0:
        ns = round(size * scale)
        small = layer.resize((ns, ns), Image.LANCZOS)
        layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        layer.paste(small, ((size - ns) // 2, (size - ns) // 2), small)
    im.alpha_composite(layer)

    if rounded:
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(im, (0, 0), rounded_mask(size, round(112 * S)))
        return out
    return im


def main():
    big = draw_icon(1024, rounded=True)                 # рисуем крупно, потом уменьшаем — ровнее края
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, 'icon-512.png'))
    big.resize((192, 192), Image.LANCZOS).save(os.path.join(HERE, 'icon-192.png'))
    big.resize((180, 180), Image.LANCZOS).save(os.path.join(HERE, 'apple-touch-icon-180.png'))
    big.resize((64, 64), Image.LANCZOS).save(os.path.join(HERE, 'favicon-64.png'))
    mask = draw_icon(1024, rounded=False, scale=0.78)  # maskable: фон на весь квадрат, контент в 80 %
    mask.resize((512, 512), Image.LANCZOS).convert('RGB').save(os.path.join(HERE, 'icon-maskable-512.png'))
    print('иконки собраны в', HERE)


if __name__ == '__main__':
    main()


# v1.09.38: значок уведомления (badge) — одноцветный силуэт на прозрачном фоне. Android показывает
# у badge только прозрачность: цветная квадратная иконка превращалась в белый квадрат.
def make_badge(size=96):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = size * 0.08
    d.rounded_rectangle((m, m, size - m, size - m), radius=size * 0.2, fill=(255, 255, 255, 255))
    w = max(3, round(size * 0.13))
    pts = [(size * 0.27, size * 0.52), (size * 0.44, size * 0.68), (size * 0.74, size * 0.34)]
    d.line(pts, fill=(0, 0, 0, 0), width=w, joint='curve')
    for x, y in (pts[0], pts[-1]):
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=(0, 0, 0, 0))
    return im


if __name__ == '__main__' and os.environ.get('BADGE_ONLY'):
    make_badge().save(os.path.join(HERE, 'badge-96.png'))
