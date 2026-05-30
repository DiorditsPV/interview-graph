---
slug: md-upload
title: Загрузка вопросов (.md/.json) через UI
status: done
created: 2026-05-30
branch: feature/md-upload
verify: pass
review: ok — temp-stem ловушка (id-less md) поймана advisor'ом и закрыта тестом; запись безопасна (block=Literal, id санитизирован)
---

## Проблема / цель
Сейчас вопросы добавляются только правкой файлов в `content/` вручную. Нужно загружать `.md`/`.json` прямо
из UI (drag-and-drop + выбор файла) с валидацией — нода парсится тем же импортёром, при успехе сохраняется
в `content/<block>/<id>.<ext>` и сразу появляется на доске; при ошибке — показывается, что не так.

## Поведение / UX
- В шапке кнопка `⬆ Загрузить` (`.uploadbtn`) открывает модалку `.upload-modal` с дроп-зоной
  (`.dropzone`) + скрытый `<input type=file accept=".md,.json" multiple>` (клик по зоне = выбор файла).
- Drag-and-drop файлов на зону или выбор → каждый файл читается как текст и POST-ится на бэкенд. Результат —
  сводка: «Добавлено: N» (список id) и «Ошибки: M» (файл → причина). При успешном добавлении — доска
  перезагружается (новые ноды видны).
- Крайние случаи: неверное расширение → ошибка; невалидная нода (нет/битое поле) → ошибка с описанием, файл
  НЕ сохраняется; дубль `id` существующей ноды → ошибка «duplicate id», не перезаписываем.

## Затрагиваемые слои и файлы
- backend: `main.py` (роут `POST /api/import`, переиспользует `importer` через временный файл),
  `importer.py` (вынести парсинг одного файла в переиспользуемый хелпер `parse_file(path)` — без дублирования
  логики `_node_from_markdown`/`_nodes_from_json`).
- frontend: `api.ts` (`importFile`), `App.tsx` (кнопка + state `uploadOpen`, `loadGraph` вынести в useCallback
  и вызывать после импорта), `components/UploadModal.tsx` (новый: дроп-зона + сводка), `styles.css`
  (`.upload-modal*`, `.dropzone`).
- content: запись новых файлов в `content/<block>/<id>.<ext>` (это и есть назначение фичи).
- tests: `backend/tests/test_app.py` (валид: добавлен + cleanup unlink в finally; невалид: ошибка, не записан;
  дубль: ошибка), `frontend/smoke.mjs` (загрузка НЕвалидного .md через `setInputFiles(buffer)` → ошибка в
  модалке; happy-path не гоняем в smoke — нельзя удалить файл из браузера, его покрывает pytest с cleanup).

## Модель данных
Без изменений схемы `Node`. Новый запрос/ответ:
```
POST /api/import   body: {"filename": "x.md", "content": "<текст файла>"}
→ {"added": [{"id","block","title","path"}], "errors": [{"file","error"}]}
```
- Парсинг: записать `content` во временный файл **с оригинальным именем** (КРИТИЧНО: id-less md берёт id из
  `path.stem` — `NamedTemporaryFile` дал бы id вроде `tmp8f3k2`; используем `TemporaryDirectory` + оригинальное
  `filename`). Затем распарсить существующими хелперами → валидация `Node`. Дедуп по id против текущего
  `load_content(CONTENT_DIR)`.
- Ответ содержит `path` каждой добавленной ноды (относительный) — чтобы тест мог точечно удалить файл в cleanup.
- При успехе: для каждой ноды записать в `content/<block>/<safe_id>.<ext>` (id санитизируем под имя файла:
  `[^A-Za-z0-9_-]→_`). `block`-папку создать при отсутствии. Дубль/невалид — НЕ писать.

## Решения (с обоснованием)
- **Переиспользуем `importer` через временный файл**, а не дублируем парсинг: `frontmatter.load`/JSON-логика
  завязаны на путь; временный файл — наименее инвазивно (выносим `parse_file(path)->List[Node]` в importer,
  им же пользуется `load_content`). Альтернатива (рефактор на текст) шире по диффу и рискованнее.
- **Тело запроса JSON `{filename, content}`**, не multipart — фронт читает файл через `FileReader.text()`,
  проще и без зависимости на python-multipart. Расширение берём из `filename`.
- **Пишем в `content/<block>/`** — папка соответствует `block` (как в проекте: `content/databases/sql-01.md`).
  id санитизируем для безопасного имени файла.
- **Дедуп против реального контента** (`load_content`) — не даём перезаписать существующую ноду.
- **Тестируемость без засорения**: pytest happy-path создаёт уникальную ноду, проверяет добавление и
  `unlink` файла в `finally`; невалид/дубль ничего не пишут. smoke гоняет ТОЛЬКО ошибочный кейс (в браузере
  нельзя убрать файл с диска) — happy-path остаётся за pytest. Так после гейта `content/` не изменён.
- **`POST /api/import`** — отдельный путь, без конфликтов маршрутизации.

## План реализации (чеклист для feature-build)
1. [ ] **importer.parse_file**: вынести `parse_file(path)->List[Node]` (md→[1], json→[...]) и переиспользовать
   в `load_content`. Коммит `refactor(importer): extract parse_file helper`.
2. [ ] **backend import**: `POST /api/import` в `main.py` (temp-файл → parse_file → dedup vs load_content →
   запись валидных в `content/<block>/<id>.ext`, сводка added/errors). + тесты (valid+cleanup / invalid / dup).
   Коммит `feat(md-upload): POST /api/import endpoint`.
3. [ ] **api+graph reload**: `api.ts importFile(filename, content)`; в `App.tsx` вынести `loadGraph` в
   useCallback, вызвать после импорта. Коммит `feat(md-upload): api + graph reload`.
4. [ ] **upload modal**: `components/UploadModal.tsx` (дроп-зона + file input + сводка added/errors), кнопка
   `.uploadbtn` + `uploadOpen` в `App.tsx`. Esc/фон закрывают. **Оба обработчика**: `onChange` на `<input>`
   (его дёргает `setInputFiles`) И `onDrop`; `preventDefault()` на `dragover`+`drop` (иначе браузер откроет
   файл). Коммит `feat(md-upload): upload modal + dropzone`.
5. [ ] **styles**: `.upload-modal`, `.dropzone` (пунктир, hover), список результатов. Коммит `feat(md-upload): styles`.
6. [ ] **smoke**: `setInputFiles` с buffer невалидного .md → в модалке видна ошибка. Коммит `test(md-upload): smoke`.

## Тесты / приёмка
- [ ] pytest: POST валидной новой ноды (с явным id) → `added` содержит id → `unlink` файла из ответа (finally);
  POST **md БЕЗ `id`** (filename `zzz-smoke-01.md`) → id ноды == stem `zzz-smoke-01` (ловит баг temp-stem) →
  cleanup; POST невалидной (битый block) → `errors` непуст, `added` пуст, файл не создан;
  POST дубля (`id: sql-01`) → ошибка «duplicate».
- [ ] smoke: открыть `⬆ Загрузить`, `setInputFiles` невалидным .md (buffer) → `.upload-modal` показывает ошибку.
- [ ] interview-verify зелёный; после прогона `git status` чист (happy-path-файл удалён, smoke писал невалид).

## Риски / открытые вопросы
- Запись в `content/` из UI мутирует репозиторий — это назначение фичи (локальный инструмент). Загруженные
  файлы появляются как untracked; коммитит их человек осознанно. В автономном гейте ничего не остаётся
  (cleanup + только-ошибочный smoke).
- JSON с нодами из разных блоков: пишем каждую в её `content/<block>/` отдельным файлом по id.
- Санитизация id для имени файла — чтобы не выйти за `content/<block>/` (без `/`, `..`).
