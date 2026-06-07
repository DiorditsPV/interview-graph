# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Подробный гид для агентов — `AGENTS.md` (карта репозитория, скиллы, конвенции контента,
> учёт фич в GitHub Issues). Здесь — выжимка для быстрого старта. При расхождении доверяй `AGENTS.md`.

## Что это
Локальный веб-сервис для технических интервью по дата-инженерному стеку. Ядро —
**swimlane-доска вопросов**: вертикальные колонки по направлениям (frameworks / databases /
python / platform), внутри карточки ранжированы по сложности (base → junior → middle → senior).
Карточка = вопрос/задача + ответ + оценка 1–5. Рёбер/ветвления между вопросами нет — это доска,
а не граф зависимостей. Контент импортируется из Markdown/JSON. Только локально.
Бэкенд **FastAPI + SQLite**, фронт **React + Vite + React Flow (@xyflow)**.

## Команды

```bash
./run.sh                 # prod-профиль: venv + сборка фронта (если нет dist) + uvicorn → :8000
./run.sh --build         # форс-пересборка фронта
./run.sh dev             # dev-профиль: порт 8001, своя БД interview-dev.db, --reload

# Бэкенд-тесты (из backend/, в активированном venv)
cd backend && . .venv/bin/activate && pytest -q
pytest tests/test_app.py -q                       # один файл
pytest tests/test_app.py::test_name -q            # один тест

# Фронт
cd frontend && npm run build     # tsc --noEmit + vite build (типы проверяются здесь)
npm run dev                      # Vite :5173, проксирует /api на :8000
npm run smoke                    # headless playwright-smoke реального рантайма; нужен сервер :8000
```

Dev hot-reload вручную: `uvicorn app.main:app --reload --port 8000` (из `backend/`) + `npm run dev`.

## Архитектура

**Бэкенд** (`backend/app/`) — поток данных «контент-файлы → импорт → in-memory граф → API → SQLite-сессии»:
- `importer.py` — парсит `content/<block>/*.md|*.json` через `python-frontmatter` в модели `Node`.
- `models.py` — pydantic `Node` с `extra="forbid"`: добавление поля ноды = правка `models.py`
  **И** `frontend/src/types.ts` **И** миграция всех контент-файлов, иначе импорт падает.
- `sampler.py` — собирает набор вопросов пропорционально весам блоков (`content/weights.yaml`).
- `db.py` — SQLite: сессии кандидатов и оценки. `tenancy.py` — изоляция тенантов. `hub.py` — SSE.
- `main.py` — FastAPI; полные схемы ручек в Swagger UI на `/docs`.

**Фронт** (`frontend/src/`) — данные грузятся из `/api/graph` в рантайме:
- `App.tsx` — состояние, `buildNodes`, панели/HUD, клавиатура, тема, реестр `nodeTypes`.
- `layout.ts` — `swimlaneLayout` + `PREFERRED_SUB` (порядок под-колонок) + `SUB_LABEL` + `DIFFS`.
- `types.ts` — `QNode`, перечисления `Block/Difficulty/Kind`, палитры `BLOCK_COLOR/LABEL`, `DIFF_COLOR`.
- `components/` — узлы канвы (QuestionNode, BlockGroupNode, SubHeadNode …) + DetailDrawer.
- `report.ts` — клиентская генерация самодостаточного HTML-отчёта по сессии («📥 Скачать»).

**Под-колонки** внутри блока задаются полем `subblock` во frontmatter, порядок — в `PREFERRED_SUB`:
frameworks → `airflow|pyspark|dbt|streaming`; databases → `sql|dbms|storage|formats`.

## Грабли (важно)
- **Ground truth контента — через `cat`/`grep`/`GET /api/graph`, НЕ через Read-инструмент.**
  Контент-файлы нормализуются скриптами; Read может вернуть устаревший кэш.
- **Правки контента — через `python-frontmatter`** (`f.write_text(frontmatter.dumps(post) + "\n")`),
  чтобы сохранить нормализованный формат, а не ручным редактированием frontmatter.
- **Изменения `content/` не требуют пересборки фронта** (грузится из API в рантайме).
  Изменения `frontend/src/` — требуют `npm run build`.
- **Новый тип ноды на канве** = регистрация в `nodeTypes` (App.tsx).
- **Теги — только из ~17 сквозных концептов** (architecture, orchestration, optimization, …),
  1–3 на ноду, без тех-имён (технология видна по колонке). Полный список — в `AGENTS.md`.
- В фиче-ветках **не пушить в `main`**: merge в `main` триггерит автодеплой на сервер (порт 8800,
  см. `DEPLOY.md`).

## Проверка изменений
Скилл **interview-verify** (или вручную): import 0 ошибок (`/api/graph`) → `pytest` →
при правке фронта `npm run build` + `npm run smoke` (нужен сервер) → рестарт uvicorn.
При переименовании нод/тегов/классов, на которые опирается smoke, обнови `frontend/smoke.mjs`.

## Скиллы проекта (`.claude/skills/`)
`interview-ideas` (работа с `Q_IDEAS.txt`), `interview-refactor` (ревизия вопросов),
`interview-balance` (покрытие/пробелы), `interview-verify` (полная проверка). Вызывать через Skill.
