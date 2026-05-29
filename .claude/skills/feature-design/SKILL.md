---
name: feature-design
description: >-
  Спроектировать новую фичу сервиса интервью «граф вопросов» (НЕ писать код):
  уточнить требования, определить затрагиваемые слои (модель/импортёр/API, фронт
  layout/components/App, контент, тесты), модель данных, UX, риски и пошаговый план;
  записать спеку в .claude/features/<slug>.md для последующей реализации скиллом
  feature-build. Используй, когда просят «добавь фичу», «спроектируй фичу»,
  «хочу новую возможность», «как лучше сделать X».
---

# Скилл: проектирование фичи (design → спека, без кода)

Результат — **спека** в `.claude/features/<slug>.md`, которую затем реализует **feature-build**.
Код здесь НЕ пишем. Цель — продумать фичу так, чтобы реализация была механической.

## 0. Карта проекта (где что лежит)
- **Backend** (`backend/app/`): `models.py` — pydantic `Node` (`extra="forbid"`! новое поле ноды = правка модели;
  поля: id, kind, block, subblock, topic, title, difficulty, weight, question, answer, starter_code, rubric, tags),
  `importer.py` (.md+.json, python-frontmatter, тело `## Вопрос`/`## Ответ`), `sampler.py` (веса),
  `db.py` (SQLite сессии/оценки), `main.py` (FastAPI: `/api/graph|weights|interview|sessions...`).
- **Frontend** (`frontend/src/`): `App.tsx` (состояние, `buildNodes`, панели/HUD, клавиатура, тема, реестр `nodeTypes`),
  `layout.ts` (`swimlaneLayout`, `PREFERRED_SUB`, `SUB_LABEL`, `DIFFS`, константы раскладки),
  `types.ts` (`QNode`, `Block/Difficulty/Kind`, `BLOCK_COLOR/LABEL`, `DIFF_COLOR`),
  `components/` (QuestionNode, BlockGroupNode, SubHeadNode, BandsNode, GuidesNode, DetailDrawer),
  `report.ts` (HTML-отчёт), `styles.css` (CSS-переменные тем), `main.tsx` (hljs-тема).
- **Контент**: `content/<block>/*.md|*.json` + `content/weights.yaml`.
- **Тесты/прогон**: `backend/tests/test_app.py`, `frontend/smoke.mjs`, `frontend/screenshot.mjs`, `./run.sh`, uvicorn :8000.

## 1. Взять идею + контекст
- **Интерактивно** (просьба пользователя): прочти запрос; при неоднозначности, меняющей реализацию
  (формат/место/поведение/объём) — задай 2–4 уточняющих вопроса (AskUserQuestion, по возможности с превью).
  Не уточняй то, что выбирается разумным дефолтом — выбери и зафиксируй в спеке.
- **Автономно** (из лупа, см. `.claude/AUTODEV.md`): возьми следующую `[ ]`-идею из `FEATURE_IDEAS.md`;
  если бэклог пуст — придумай 1 новую (из пробелов/UX) и допиши её в `FEATURE_IDEAS.md`. Вопросы не задавай.
- **Контекст обязателен:** прочти `FEATURE_IDEAS.md` (что хотим), `FEATURES.md` (что уже реализовано) и
  существующие `.claude/features/*.md` — чтобы НЕ дублировать сделанное/спроектированное и учесть его.

## 2. Сориентироваться (ground truth, НЕ Read — кэш устаревает)
- Контекст фич: `cat FEATURE_IDEAS.md FEATURES.md`, `ls .claude/features/`.
- Состояние банка: `python3 .claude/skills/interview-refactor/inventory.py`, баланс: `.../interview-balance/coverage.py`.
- Реальный код смотри через `cat`/`grep` по файлам из карты. Не выдумывай API — сверяйся с `main.py`/`types.ts`.

## 3. Решения по дизайну
- **Слои**: какие из backend/frontend/content/tests затронуты и какие конкретно файлы.
- **Модель данных**: новые поля ноды? тогда правка `models.py` (+ `types.ts`), миграция контента
  через python-frontmatter, и осознать `extra="forbid"`. Новые сущности (не ноды)? где живут.
- **UX/поведение**: как выглядит и управляется; вписать в существующее (swimlane-канва, drawer, HUD,
  панель фильтров, шапка, тема). Соблюдать конвенции: рёбер НЕ добавлять; теги только из 17; difficulty
  base/junior/middle/senior; под-колонки через `subblock`.
- **Совместимость**: не ломать smoke/типы/импорт; что добавить в `smoke.mjs`/`test_app.py`.
- Спорные решения — зафиксируй с обоснованием (вариант + почему).

## 4. Записать спеку
Создай `.claude/features/<slug>.md` (slug — kebab-case фичи) строго по шаблону:

```markdown
---
slug: <kebab-slug>
title: <короткое название фичи>
status: designed        # designed -> building -> done
created: <YYYY-MM-DD>
branch: feature/<kebab-slug>
verify: —               # заполняет feature-build: pass | fail
review: —               # заполняет feature-build: ok | <кратко замечания>
---

## Проблема / цель
<что и зачем; критерий пользы>

## Поведение / UX
<как работает с точки зрения ведущего интервью; крайние случаи>

## Затрагиваемые слои и файлы
- backend: <файлы или «нет»>
- frontend: <файлы или «нет»>
- content: <да/нет, что>
- tests: <что добавить в smoke.mjs / test_app.py>

## Модель данных
<новые поля/сущности, изменения схемы, миграция контента; либо «без изменений»>

## Решения (с обоснованием)
- <решение> — <почему; отвергнутые альтернативы>

## План реализации (чеклист для feature-build)
1. [ ] <шаг>
2. [ ] <шаг>
...

## Тесты / приёмка
- [ ] <как проверить: smoke-чек, pytest, ручной сценарий, скриншот>

## Риски / открытые вопросы
- <риск или вопрос к пользователю>
```

## 5. Отдать
Кратко перескажи спеку пользователю (1–2 абзаца) и укажи путь файла. Предложи запустить **feature-build**
для реализации. Код не пиши.
