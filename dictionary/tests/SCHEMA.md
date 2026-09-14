# Единый формат файла теста — `techlog-quiz` v1

Один файл = один раздел учебника = один тест. Имя файла: `section-N.json`
(N = 1…8), лежит в `dictionary/tests/`. Приложение берёт список файлов из
`dictionary/index.json`.

Кодировка UTF-8, без BOM. Все тексты — объект `{ "ru": "…", "en": "…" }`:
язык переключается кнопкой прямо в тесте.

```jsonc
{
  "meta": {
    "schema": "techlog-quiz",        // обязательно ровно так
    "schema_version": 1,
    "id": "section-3",               // совпадает с именем файла
    "section": 3,                    // номер раздела журнала, 1…8
    "title":  { "ru": "…", "en": "…" },
    "description": { "ru": "…", "en": "…" },      // необязательно
    "source": {                                    // необязательно, для шапки
      "book": "Odor Removal and Control",
      "publisher": "Legend Brands",
      "edition": "V. 2022.1",
      "pages": "i–iv, 1–50"
    },
    "languages": ["ru", "en"],
    "default_language": "ru",
    "pass_percent": 70,              // порог зачёта, %
    "shuffle_questions": true,       // перемешивать вопросы
    "shuffle_options": false,        // (с v1.08.70 не используется: перемешивание —
                                     //   галочка админа; пункты вида «верны 1 и 3»,
                                     //   «все», «ни один» приложение убирает и переводит
                                     //   вопрос в «отметьте все верные»)
    "question_count": 185            // справочно, приложение считает само
  },

  "topics": [                        // необязательно: оглавление раздела
    { "id": "t01", "pages": "1-10", "title": { "ru": "…", "en": "…" } }
  ],

  "assets": {                        // схемы и картинки, общие для вопросов
    "svg_odor_pathway": {
      "type": "svg",                 // "svg" | "image"
      "title":   { "ru": "…", "en": "…" },
      "caption": { "ru": "…", "en": "…" },
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 720 210\">…</svg>"
      // для "image": "src": "assets/psychrometry.png" (путь от dictionary/tests/)
    }
  },

  "questions": [
    {
      "id": "s3-q001",               // уникальный в пределах файла
      "type": "single",              // "single" (один ответ) | "multi" (несколько)
      "difficulty": "medium",        // "easy" | "medium" | "hard", необязательно
      "topic": "t01",                // id из topics ИЛИ объект { "ru": …, "en": … }
      "asset": "svg_odor_pathway",   // ключ из assets, необязательно
      "ref": {                       // откуда вопрос — показывается в разборе
        "section": 3,
        "chapter": { "ru": "Введение", "en": "Introduction" },
        "pages": [1, 2]
      },
      "question": { "ru": "…", "en": "…" },
      "hint":     { "ru": "…", "en": "…" },       // подсказка до ответа
      "options": [
        {
          "id": "1",
          "text": { "ru": "…", "en": "…" },
          "explanation": { "ru": "…", "en": "…" },  // почему верно/неверно
          "pages": [14]                             // страницы именно этого варианта
        }
        // … минимум 2, обычно 6: 4 содержательных + «все верны» / «1 и 3 верны»
      ],
      "correct": ["2"],              // массив id верных вариантов
      "explanation": { "ru": "…", "en": "…" }       // общий разбор вопроса
    }
  ]
}
```

## Правила, которые проверяет приложение

* `meta.schema` = `techlog-quiz`, `meta.section` — число.
* У вопроса обязательны `id`, `question`, `options` (≥ 2), `correct` (≥ 1).
* Каждый `correct` должен совпадать с `id` существующего варианта.
* `type: "single"` — ровно один верный ответ; несколько — только `"multi"`.
* `asset` должен быть ключом из `assets`.
* Нет русского или английского текста — подставляется тот, что есть.

Проверить файл:

```bash
python3 dictionary/tests/tools/normalize-quiz.py --check dictionary/tests/section-3.json
```

## Старые файлы

Приложение читает и прежние варианты структуры (`correctOption`,
`correct` внутри варианта, `option_explanations`, `media`/`mediaRef`,
`assets` со `content`, схема-объект прямо в вопросе
`media: {"type":"svg","file":"media/x.svg","caption":…,"alt":…}`,
`chapters` вместо `topics`, а также файл без `meta` — сведения на верхнем
уровне, `settings.pass_score_percent`, `sections` как главы книги,
`options[].n` вместо `id`, `correct` числом, `media` списком ключей;
библиотека схем `mediaLibrary`, `correctOptionIds` / `isCorrect`,
буквенные id вариантов a–f — они перенумеровываются в 1–6, чтобы
«верны варианты 1 и 3» совпадали с бейджами; главы из `sectionTitle`;
`meta.sections[number]`, `correctOptionId`, `media.assetId`, страницы
варианта в его `reference`, `type: single_choice`)
— но хранить лучше в едином виде. Привести:

```bash
python3 dictionary/tests/tools/normalize-quiz.py старый.json section-4.json --section 4 --id section-4
```

Схемы, лежащие отдельными файлами (`media/*.svg` рядом с JSON), конвертер
**встраивает** в выходной файл — так тест целиком работает офлайн; служебные
`<metadata>` (c2pa) из SVG вырезаются. Ключ `--keep-files` оставляет ссылки
на файлы (тогда папку `media/` нужно положить в `dictionary/tests/`),
`--media-dir путь` — если файлы лежат не рядом с исходным JSON.

## Как добавить раздел

1. Положить `section-N.json` в `dictionary/tests/`.
2. Проверить `--check`.
3. Убедиться, что в `dictionary/index.json` у раздела N стоит
   `"test": "tests/section-N.json"` (там уже прописаны все восемь).
4. Опубликовать сборку. Приложение подхватит файл само — код менять не нужно.
