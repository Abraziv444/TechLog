#!/usr/bin/env python3
"""Встраивает режим чтения вслух (audio-mode.js) во все учебники dictionary/books/*.html и в шаблон
viewer.html. Идемпотентно: прежний блок заменяется. Запуск из любой папки:  python3 tools/inject-audio.py"""
import re, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
js = (here / 'audio-mode.js').read_text(encoding='utf8')
assert '</script' not in js.lower()
block = '<!-- tl-audio:start -->\n<script>\n' + js + '\n</script>\n<!-- tl-audio:end -->\n'
pat = re.compile(r'<!-- tl-audio:start -->.*?<!-- tl-audio:end -->\n?', re.S)
n = 0
for f in sorted(list(here.parent.glob('section-*.html')) + [here / 'viewer.html']):
    s = f.read_text(encoding='utf8')
    if 'id="pgin"' not in s or 'id="tb"' not in s: print('  пропуск (не просмотрщик):', f.name); continue
    s = pat.sub('', s)
    i = s.rfind('</body>')
    if i < 0: print('  пропуск (нет </body>):', f.name); continue
    f.write_text(s[:i] + block + s[i:], encoding='utf8'); n += 1; print('  ✓', f.name)
print('встроено в файлов:', n)
