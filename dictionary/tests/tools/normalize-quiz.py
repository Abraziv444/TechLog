#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TechLog · приведение файла теста к единому формату «techlog-quiz v1».

Зачем: тесты по разделам журнала делались в разное время и разными
структурами (correctOption / correct / correct внутри варианта, media /
assets / mediaRef, option_explanations / explanation внутри варианта).
Приложение умеет читать их все, но хранить лучше в одном формате —
этот скрипт его и делает.

    python3 normalize-quiz.py вход.json выход.json [--section N] [--id section-3]
    python3 normalize-quiz.py --check выход.json      # только проверка

Схемы, лежащие отдельными файлами (media: {"type":"svg","file":"media/x.svg"}),
по умолчанию ВСТРАИВАЮТСЯ в выходной JSON (один файл — работает офлайн);
служебная <metadata> (c2pa) при этом вырезается. --keep-files — оставить
ссылки на файлы как есть (тогда папку media/ надо положить в dictionary/tests/).

Схема описана в dictionary/tests/SCHEMA.md.
"""
import json, sys, os, re

LANGS = ('ru', 'en')
MEDIA_DIR = ''          # каталог, от которого считаются пути media.file (по умолчанию — папка входного файла)
KEEP_FILES = False      # True — не встраивать файлы, оставить src
_inline_stats = {'ok': 0, 'miss': []}


def load_svg_file(rel):
    """Читает SVG-файл и вырезает служебные метаданные (c2pa и т.п.)."""
    path = os.path.join(MEDIA_DIR, rel) if MEDIA_DIR else rel
    if not os.path.isfile(path):
        return None
    body = open(path, encoding='utf-8').read()
    body = re.sub(r'<\?xml[^>]*\?>\s*', '', body)
    body = re.sub(r'<!DOCTYPE[^>]*>\s*', '', body)
    body = re.sub(r'<metadata>.*?</metadata>', '', body, flags=re.S)
    body = re.sub(r'\s+xmlns:c2pa="[^"]*"', '', body)
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S | re.I)
    return body.strip()


def loc(v, fallback=None):
    """Любое поле -> {"ru": …, "en": …}."""
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        return {'ru': s, 'en': s}
    if isinstance(v, dict):
        out = {}
        for k in LANGS:
            x = v.get(k)
            if isinstance(x, str) and x.strip():
                out[k] = x.strip()
        if not out:
            return None
        if len(out) == 1:                       # один язык — дублируем во второй
            only = list(out.values())[0]
            for k in LANGS:
                out.setdefault(k, only)
        return {k: out[k] for k in LANGS}
    return loc(str(v), fallback)


def pages_of(v):
    """'1-2' | [1,2] | 'iv' | 14 -> список строк/чисел как есть."""
    if v is None:
        return None
    if isinstance(v, list):
        return [p for p in v if p not in (None, '')]
    if isinstance(v, (int, float)):
        return [v]
    s = str(v).strip()
    return [s] if s else None


def norm_asset(key, a):
    if isinstance(a, str):
        return {'type': 'svg', 'svg': a}
    out = {'type': (a.get('type') or 'svg')}
    ttl = loc(a.get('title'))
    cap = loc(a.get('caption'))
    if ttl:
        out['title'] = ttl
    if cap:
        out['caption'] = cap
    alt = loc(a.get('alt'))
    if alt:
        out['alt'] = alt
    body = a.get('svg') or a.get('content') or a.get('code') or a.get('markup')
    src = a.get('src') or a.get('url') or a.get('file')
    if not body and src and not KEEP_FILES and str(src).lower().endswith('.svg'):
        body = load_svg_file(src)
        if body:
            _inline_stats['ok'] += 1
        else:
            _inline_stats['miss'].append(src)
    if body:
        out['type'] = 'svg'
        out['svg'] = body
    elif src:
        out['type'] = 'image'
        out['src'] = src
    return out


def norm_ref(q):
    ref = {}
    src = q.get('ref') or q.get('source_ref') or q.get('reference') or {}
    if isinstance(src, dict):
        sec = src.get('section') or src.get('journalSection') or src.get('manualSection')
        if sec is not None:
            ref['section'] = sec
        raw_ch = src.get('chapterTitle') or src.get('chapter_title') or src.get('sectionTitle') or src.get('chapter')
        if isinstance(raw_ch, (int, float)) or (isinstance(raw_ch, str) and raw_ch.strip().isdigit()):
            raw_ch = None                      # это НОМЕР главы, а не название
        ch = loc(raw_ch)
        if ch:
            ref['chapter'] = ch
        pg = pages_of(src.get('pages'))
        if pg:
            ref['pages'] = pg
        txt = loc(src.get('label') or src.get('text') or src.get('citation'))
        if not txt and not ref:
            txt = loc(src)
        if txt:
            ref['text'] = txt
    elif isinstance(src, str):
        ref['text'] = loc(src)
    book = q.get('book') if isinstance(q.get('book'), dict) else None
    if book:
        ref.setdefault('section', book.get('journalSection') or book.get('section'))
        ch = loc(book.get('chapterTitle') or book.get('sectionTitle'))
        if ch:
            ref.setdefault('chapter', ch)
        pg = pages_of(book.get('pages'))
        if pg:
            ref.setdefault('pages', pg)
    for k_sec in ('journalSection', 'manualSection', 'section'):
        if ref.get('section') is None and q.get(k_sec) is not None:
            ref['section'] = q.get(k_sec)
    if not ref.get('pages'):
        pg = pages_of(q.get('pages'))
        if pg:
            ref['pages'] = pg
    if not ref.get('chapter'):
        ch = loc(q.get('sectionTitle') or q.get('bookUnitTitle') or q.get('chapterTitle'))
        if ch:
            ref['chapter'] = ch
    return {k: v for k, v in ref.items() if v not in (None, {}, [])} or None


def norm_question(q, i, sec, assets=None, chapters=None):
    out = {}
    out['id'] = str(q.get('id') or ('q%03d' % (i + 1)))
    assets = assets if assets is not None else {}
    chapters = chapters or {}
    # раздел 2: q.section — это ГЛАВА книги (есть список sections/chapters), а не раздел журнала
    chap_from_section = None
    if q.get('section') is not None and sec and (
            (chapters and ('c%s' % q.get('section')) in chapters)
            or q.get('sectionTitle') or q.get('chapterTitle') or q.get('bookUnitTitle')):
        # раздел 2 / раздел 4: q.section — глава книги (есть список глав или название главы прямо в вопросе)
        q = dict(q)
        chap_from_section = q.pop('section')
        ref0 = q.get('reference')
        if isinstance(ref0, dict) and ref0.get('section') is not None:      # раздел 4: reference.section — тоже глава
            q['reference'] = {k: v for k, v in ref0.items() if k != 'section'}

    opts, correct = [], []
    raw_opts = q.get('options') or q.get('answers') or []
    if isinstance(raw_opts, dict):                       # {"1": "текст", …}
        raw_opts = [{'id': k, 'text': v} for k, v in raw_opts.items()]
    expl_map = q.get('option_explanations') or q.get('optionExplanations') or {}
    # раздел 4: id вариантов a…f, а комбинированные варианты говорят «верны 1 и 3» — перенумеровываем по позиции
    id_map = {}
    raw_ids = [str(o.get('id')) for o in raw_opts if isinstance(o, dict) and o.get('id') is not None]
    if raw_opts and len(raw_ids) == len(raw_opts) and all(re.match(r'^[A-Za-z]$', x) for x in raw_ids) \
            and [x.lower() for x in raw_ids] == [chr(ord('a') + k) for k in range(len(raw_ids))]:
        id_map = {x: str(k + 1) for k, x in enumerate(raw_ids)}
    for j, o in enumerate(raw_opts):
        if isinstance(o, str):
            o = {'id': str(j + 1), 'text': o}
        oid = str(o.get('id') if o.get('id') is not None else (o.get('n') if o.get('n') is not None else (j + 1)))
        oid = id_map.get(oid, oid)
        item = {'id': oid, 'text': loc(o.get('text') or o.get('label') or o)}
        ex = loc(o.get('explanation'))
        exref = None
        if not ex and expl_map.get(oid):
            em = expl_map.get(oid)
            ex = loc(em)
            if isinstance(em, dict):
                r = em.get('ref') or {}
                exref = pages_of(r.get('pages')) if isinstance(r, dict) else None
        if ex:
            item['explanation'] = ex
        oref = o.get('reference') or o.get('ref') or {}
        pg = exref or pages_of(o.get('pages')) or (pages_of(oref.get('pages')) if isinstance(oref, dict) else None)
        if pg:
            item['pages'] = pg
        if o.get('correct') is True or o.get('isCorrect') is True:
            correct.append(oid)
        opts.append(item)

    raw_c = q.get('correct')
    if raw_c is None:
        raw_c = q.get('correctOption', q.get('correct_option', q.get('correctOptionId', q.get('correctOptionIds', q.get('answer')))))
    if raw_c is not None:
        if not isinstance(raw_c, list):
            raw_c = [raw_c]
        correct = [id_map.get(str(x), str(x)) for x in raw_c]
    correct = [c for c in dict.fromkeys(correct)]

    typ = q.get('type')
    if typ not in ('single', 'multi'):
        typ = 'multi' if (q.get('multiSelect') is True or len(correct) > 1) else 'single'

    out['type'] = typ
    if q.get('difficulty'):
        out['difficulty'] = q['difficulty']
    topic = q.get('topic')
    if isinstance(topic, str) and re.match(r'^t\d+$', topic):
        out['topic'] = topic
    elif isinstance(topic, str):
        pass                                   # разделы 4/6: одноязычная строка вида "ppe" / "seven keys" — не показываем
    else:
        tl = loc(topic)
        if tl:
            out['topic'] = tl
    asset = q.get('asset') or q.get('media') or q.get('mediaRef') or q.get('assetRef')
    if isinstance(asset, list):                          # раздел 2: список ключей схем — берём первую
        if len(asset) > 1:
            print('   · %s: схем %d, показывается первая (%s)' % (out['id'], len(asset), asset[0]))
        asset = asset[0] if asset else None
    if isinstance(asset, dict):                          # схема прямо в вопросе (раздел 1 / раздел 4)
        fname = asset.get('file') or asset.get('src') or asset.get('url') or ''
        key = asset.get('id') or asset.get('assetId') or asset.get('asset_id') or asset.get('ref') \
            or (re.sub(r'\.[a-z0-9]+$', '', os.path.basename(fname)) if fname else out['id'] + '-media')
        key = re.sub(r'[^A-Za-z0-9_-]', '_', key)
        if key not in assets:
            assets[key] = norm_asset(key, asset)
        else:                                            # раздел 4: схема в библиотеке, подпись — в вопросе
            for f in ('caption', 'alt', 'title'):
                if not assets[key].get(f) and loc(asset.get(f)):
                    assets[key][f] = loc(asset.get(f))
        asset = key
    if isinstance(asset, str) and asset.strip():
        out['asset'] = asset.strip()
    if not out.get('topic'):
        cn = (q.get('source_ref') or {}).get('chapter_no') if isinstance(q.get('source_ref'), dict) else None
        if cn is None:
            cn = q.get('chapter_no') or q.get('bookUnit') or q.get('bookSection') or chap_from_section
        if cn is not None:
            out['topic'] = 'c%s' % cn
    ref = norm_ref(q) or {}
    if chap_from_section is not None:
        ref['section'] = sec
        if not ref.get('chapter') and chapters.get('c%s' % chap_from_section):
            ref['chapter'] = chapters['c%s' % chap_from_section]
    if ref:
        out['ref'] = ref
    out['question'] = loc(q.get('question') or q.get('prompt') or q.get('text'))
    hint = loc(q.get('hint'))
    if hint:
        out['hint'] = hint
    out['options'] = opts
    out['correct'] = correct
    ex = loc(q.get('explanation'))
    if ex:
        out['explanation'] = ex
    return out


def normalize(raw, section=None, quiz_id=None, title=None):
    m = raw.get('meta') or {}
    if not m and (raw.get('title') or raw.get('source')):     # раздел 2: сведения лежат на верхнем уровне
        m = raw
    src = m.get('source') or {}
    st = m.get('settings') if isinstance(m.get('settings'), dict) else {}
    sec = section or m.get('section') or src.get('manualSection') or src.get('journalSection') \
        or src.get('journal_section') or src.get('section') \
        or (raw.get('questions') or [{}])[0].get('journalSection') \
        or (raw.get('questions') or [{}])[0].get('manualSection')
    try:
        sec = int(sec)
    except Exception:
        sec = None

    meta = {
        'schema': 'techlog-quiz',
        'schema_version': 1,
        'id': quiz_id or m.get('id') or m.get('quiz_id') or ('section-%s' % sec),
        'section': sec,
        'title': loc(title) or loc(m.get('title')) or loc(src.get('title')) or loc(src.get('book')),
        'languages': ['ru', 'en'],
        'default_language': m.get('defaultLanguage') or m.get('default_language') or 'ru',
    }
    desc = loc(m.get('description'))
    if desc:
        meta['description'] = desc
    s = {}
    for k_from, k_to in (('book', 'book'), ('title', 'book'), ('publisher', 'publisher'),
                         ('version', 'edition'), ('edition', 'edition'),
                         ('pagesCovered', 'pages'), ('pages', 'pages'),
                         ('copyright_year', 'year')):
        v = src.get(k_from)
        if isinstance(v, dict):
            v = v.get('en') or v.get('ru')
        if v and k_to not in s:
            s[k_to] = v
    cov = m.get('covers') or {}
    if isinstance(cov, dict) and cov.get('pages') and 'pages' not in s:
        s['pages'] = cov['pages']
    lbl = loc(src.get('manualSectionLabel') or src.get('journalSectionName') or src.get('sectionLabel'))
    if lbl:
        s['label'] = lbl
    if s:
        meta['source'] = s
    sc = m.get('scoring') or {}
    pp = m.get('pass_percent') or m.get('passScorePercent') or m.get('pass_score_percent') \
        or (sc.get('passPercent') if isinstance(sc, dict) else None) \
        or (sc.get('pass_percent') if isinstance(sc, dict) else None) \
        or st.get('pass_score_percent') or st.get('pass_percent')
    meta['pass_percent'] = int(pp or 70)
    meta['shuffle_questions'] = bool(m.get('shuffle_questions', st.get('shuffle_questions', True)))
    meta['shuffle_options'] = bool(m.get('shuffle_options', st.get('shuffle_options_default', False)))

    assets = {}
    for holder in (raw.get('assets'), raw.get('media'), raw.get('mediaLibrary'), raw.get('media_library'), raw.get('figures')):
        if isinstance(holder, dict):
            for k, v in holder.items():
                if isinstance(v, (dict, str)):
                    assets[k] = norm_asset(k, v)

    topics = []
    for tp in (raw.get('topics') or []):
        if not isinstance(tp, dict):
            continue
        item = {'id': str(tp.get('id'))}
        ttl = loc(tp.get('title'))
        if ttl:
            item['title'] = ttl
        if tp.get('pages'):
            item['pages'] = tp['pages']
        topics.append(item)
    sec_lists = (raw.get('chapters') or []) + (raw.get('sections') if isinstance(raw.get('sections'), list) else []) \
        + (m.get('sections') if isinstance(m.get('sections'), list) and m is not raw else [])
    for ch in sec_lists:
        # главы книги (раздел 1: chapters[no]; раздел 2: sections[id]; раздел 6: meta.sections[number]) → темы c<no>
        if not isinstance(ch, dict):
            continue
        no = ch.get('no') if ch.get('no') is not None else (ch.get('id') if ch.get('id') is not None else ch.get('number'))
        if no is None:
            continue
        item = {'id': 'c%s' % no}
        ttl = loc(ch.get('title'))
        if ttl:
            item['title'] = ttl
        if ch.get('pages'):
            item['pages'] = ch['pages']
        topics.append(item)

    chap_map = {tp['id']: tp.get('title') for tp in topics if tp['id'].startswith('c')}
    if not chap_map:                                     # раздел 4: главы описаны прямо в вопросах (section + sectionTitle)
        seen = {}
        for q in (raw.get('questions') or []):
            no = q.get('section') if isinstance(q, dict) else None
            ttl = loc(q.get('sectionTitle') or q.get('chapterTitle') or q.get('bookUnitTitle')) if isinstance(q, dict) else None
            if no is not None and ttl and ('c%s' % no) not in seen:
                seen['c%s' % no] = ttl
        for k in sorted(seen, key=lambda x: int(re.sub(r'\D', '', x) or 0)):
            topics.append({'id': k, 'title': seen[k]})
        chap_map = dict(seen)
    qs = [norm_question(q, i, sec, assets, chap_map) for i, q in enumerate(raw.get('questions') or [])]
    meta['question_count'] = len(qs)
    if assets:
        meta['asset_count'] = len(assets)

    out = {'meta': meta}
    if topics:
        out['topics'] = topics
    if assets:
        out['assets'] = assets
    out['questions'] = qs
    return out


def check(doc):
    """Проверка готового файла. Возвращает список проблем."""
    bad = []
    m = doc.get('meta') or {}
    if m.get('schema') != 'techlog-quiz':
        bad.append('meta.schema != techlog-quiz')
    if not m.get('title'):
        bad.append('нет meta.title')
    if m.get('section') in (None, ''):
        bad.append('нет meta.section')
    assets = doc.get('assets') or {}
    ids = set()
    for i, q in enumerate(doc.get('questions') or []):
        w = 'вопрос %d (%s)' % (i + 1, q.get('id'))
        if not q.get('id'):
            bad.append('%s: нет id' % w)
        if q.get('id') in ids:
            bad.append('%s: id повторяется' % w)
        ids.add(q.get('id'))
        for f in ('question', 'options', 'correct'):
            if not q.get(f):
                bad.append('%s: нет %s' % (w, f))
        for lang in LANGS:
            if not (q.get('question') or {}).get(lang):
                bad.append('%s: нет текста вопроса (%s)' % (w, lang))
        oids = [o.get('id') for o in (q.get('options') or [])]
        if len(oids) < 2:
            bad.append('%s: меньше двух вариантов' % w)
        if len(set(oids)) != len(oids):
            bad.append('%s: id вариантов повторяются' % w)
        for c in (q.get('correct') or []):
            if c not in oids:
                bad.append('%s: correct="%s" — такого варианта нет' % (w, c))
        if q.get('type') == 'single' and len(q.get('correct') or []) != 1:
            bad.append('%s: type=single, а верных ответов %d' % (w, len(q.get('correct') or [])))
        if q.get('asset') and q['asset'] not in assets:
            bad.append('%s: asset="%s" — нет в assets' % (w, q['asset']))
    return bad


def main():
    args = [a for a in sys.argv[1:]]
    if '--check' in args:
        args.remove('--check')
        for p in args:
            doc = json.load(open(p, encoding='utf-8'))
            bad = check(doc)
            print('%s: %s' % (os.path.basename(p),
                              'ОК · %d вопросов' % len(doc.get('questions') or [])
                              if not bad else 'ПРОБЛЕМЫ (%d)' % len(bad)))
            for b in bad[:40]:
                print('   ·', b)
        return
    section = quiz_id = title = None
    if '--section' in args:
        i = args.index('--section'); section = int(args[i + 1]); del args[i:i + 2]
    if '--id' in args:
        i = args.index('--id'); quiz_id = args[i + 1]; del args[i:i + 2]
    if '--title' in args:
        i = args.index('--title'); title = args[i + 1]; del args[i:i + 2]
    global KEEP_FILES, MEDIA_DIR
    if '--keep-files' in args:
        args.remove('--keep-files'); KEEP_FILES = True
    if '--media-dir' in args:
        i = args.index('--media-dir'); MEDIA_DIR = args[i + 1]; del args[i:i + 2]
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    if not MEDIA_DIR:
        MEDIA_DIR = os.path.dirname(os.path.abspath(args[0]))
    raw = json.load(open(args[0], encoding='utf-8'))
    doc = normalize(raw, section, quiz_id, title)
    bad = check(doc)
    json.dump(doc, open(args[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%s -> %s · вопросов %d · схем %d%s%s' % (
        os.path.basename(args[0]), os.path.basename(args[1]),
        len(doc['questions']), len(doc.get('assets') or {}),
        (' · встроено файлов %d' % _inline_stats['ok']) if _inline_stats['ok'] else '',
        '' if not bad else ' · ПРОБЛЕМ: %d' % len(bad)))
    for f in _inline_stats['miss']:
        print('   · файл схемы не найден, оставлена ссылка:', f)
    for b in bad[:20]:
        print('   ·', b)


if __name__ == '__main__':
    main()
