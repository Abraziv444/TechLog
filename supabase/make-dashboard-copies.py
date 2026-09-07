#!/usr/bin/env python3
"""Генератор комплекта для Dashboard из канонических функций CLI.

Редактор Supabase Dashboard не видит соседние папки, поэтому в нём у каждой
функции должен быть СВОЙ файл google.ts, а импорт — './google.ts'. Каноничны
файлы в supabase/functions/ (комплект для CLI); эта команда пересобирает из
них supabase/functions-dashboard/. Запуск: python3 supabase/make-dashboard-copies.py
Проверка без записи: python3 supabase/make-dashboard-copies.py --check
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC, DST = ROOT / 'functions', ROOT / 'functions-dashboard'
SHARED = SRC / '_shared' / 'google.ts'
check = '--check' in sys.argv
diffs = []

for fn in sorted(p for p in SRC.iterdir() if p.is_dir() and p.name != '_shared'):
    body = (fn / 'index.ts').read_text(encoding='utf-8').replace('"../_shared/google.ts"', '"./google.ts"')
    out = DST / fn.name
    for name, text in (('index.ts', body), ('google.ts', SHARED.read_text(encoding='utf-8'))):
        target = out / name
        if check:
            if not target.exists() or target.read_text(encoding='utf-8') != text:
                diffs.append(str(target.relative_to(ROOT)))
        else:
            out.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding='utf-8')

if check:
    print('РАСХОЖДЕНИЯ:', ', '.join(diffs) if diffs else 'нет — комплекты совпадают')
    sys.exit(1 if diffs else 0)
print('Комплект для Dashboard пересобран:', DST)
