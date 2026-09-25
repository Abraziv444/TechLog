#!/usr/bin/env python3
"""Подключает режим чтения вслух (audio-mode.js) ко всем учебникам dictionary/books/*.html и к шаблону
viewer.html. Идемпотентно: прежний блок между метками tl-audio:start / tl-audio:end заменяется.

v1.09.55: учебник больше не несёт копию модуля внутри себя, а ссылается на общий файл
<script src="tools/audio-mode.js"> — правка чтения вслух теперь меняет один маленький файл, а не все
14 учебников (≈ 46 МБ). Учебник без этого файла (например, скачанный отдельно) остаётся обычной книгой.
Запуск из любой папки:  python3 tools/inject-audio.py"""
import re, pathlib
here = pathlib.Path(__file__).resolve().parent
js = (here / 'audio-mode.js').read_text(encoding='utf8')
assert '</script' not in js.lower()
block = '<!-- tl-audio:start -->\n<script src="tools/audio-mode.js"></script>\n<!-- tl-audio:end -->\n'
pat = re.compile(r'<!-- tl-audio:start -->.*?<!-- tl-audio:end -->\n?', re.S)
n = 0
for f in sorted(list(here.parent.glob('section-*.html')) + [here / 'viewer.html']):
    s = f.read_text(encoding='utf8')
    if 'id="pgin"' not in s or 'id="tb"' not in s: print('  пропуск (не просмотрщик):', f.name); continue
    s = pat.sub('', s)
    i = s.rfind('</body>')
    if i < 0: print('  пропуск (нет </body>):', f.name); continue
    f.write_text(s[:i] + block + s[i:], encoding='utf8'); n += 1; print('  ✓', f.name)
print('подключено к файлам:', n)
