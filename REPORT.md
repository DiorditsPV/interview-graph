# Сервис интервью «граф вопросов» — отчёт-исследование + план реализации

> Локальный веб-сервис для проведения технических интервью по стеку команды (X5, дата-инженерия: прогноз спроса / time-series).
> Источник анализа стека: `/Users/user/dev/projects/work`. Дата: 2026-05-29.

---

## Часть 0. Краткое резюме (TL;DR)

- **Библиотека графа:** **React Flow (`@xyflow/react`)** — MIT, ноды = обычные React-компоненты (карточка вопроса + виджет оценки), встроены drag/zoom/pan/select. Авто-раскладку делает **не сам React Flow**, а внешний **Dagre/ELK** (нужно подключить руками).
- **Архитектура (рекомендация):** **FastAPI + SQLite + React/Vite SPA**, запуск `uvicorn` локально, опционально упаковка в **pywebview** (десктоп-окно без браузера). Питон-бэкенд естественно читает `.md`/`.json` с диска и хранит оценки.
- **Импорт контента:** Markdown с **YAML-frontmatter** + JSON. На бэкенде — `python-frontmatter` (аналог JS `gray-matter`) + валидация схемы через **pydantic** (по образцу Astro Content Collections + Zod).
- **Раскрытие ноды:** **немодальный drawer** (боковая панель) — граф остаётся интерактивным; плюс режим full-screen. Код в ответах — подсветка (Shiki/rehype-highlight).
- **Два вида нод:** `kind: question` (теория) и `kind: task` (практическая задача с `starterCode`/`rubric`) — пользователь явно различает «вопросы по стеку» и «задачи разных уровней сложности».
- **Ветвление:** типизированные рёбра с условиями по оценке (`minScore`/`maxScore`) → адаптивная маршрутизация. Прообразы: **QST** (skip-logic), **CAT** (адаптивный подбор следующего вопроса). Формат **json-quiz отвергнут** — в нём нет ветвления.
- **Баланс тем** — из измеренного дисбаланса репозиториев (4 блока, веса ниже), сэмплирование пропорционально весам.

---

## Часть 1. Отчёт-исследование (с источниками)

Методология: 5 направлений → 24 источника → 113 утверждений → верификация топ-25 адверсариально (3 голоса, нужно 2/3 на опровержение) → 23 подтверждено, 2 убито.

### 1.1 Библиотека визуализации графа → **React Flow**

**Вывод:** React Flow (`@xyflow/react`) — рекомендованный выбор. *(confidence: high, 3-0)*
- MIT-лицензия, активно поддерживается с 2019, релизы вплоть до марта 2026, 36.8k★. — `reactflow.dev`, `github.com/xyflow/xyflow`
- Из коробки: drag, zoom, pan, multi-select, add/remove узлов/рёбер.
- **Ноды = стандартные React-компоненты** → можно встроить карточку вопроса с виджетом рейтинга/инпутами/чартами напрямую (закрывает требование «нода = вопрос+ответ+оценка»). — `reactflow.dev`
- ⚠️ **React Flow НЕ считает раскладку сам** — «we have not implemented our own layouting solution yet». Авто-раскладка дерева вопросов делается через **Dagre** (пример `getLayoutedElements`) или **ELK** для сложных случаев. Это реальная работа по интеграции. — `reactflow.dev/examples/layout/dagre`
- Альтернатива того же автора: **Svelte Flow** (MIT, тот же берлинский коллектив, релиз 2026-03-27) — если фронт на Svelte. По умолчанию берём React Flow (зрелее экосистема). — `xyflow.com`

**Прочие библиотеки:** Sigma.js — **плохо** для богатых кастомных карточек-нод: WebGL-рендерер ограничивает формы (круг/кастомный шейдер), раскладка/алгоритмы вынесены в отдельную `graphology`; сложнее Cytoscape.js/vis-network и куда сложнее React Flow. *(medium, 3-0)* — `pkgpulse.com`, `sigmajs.org`
- ⚠️ *Опровергнуто (1-2):* конкретные цифры «Canvas тянет 3-5k нод, WebGL 100k+». Для нашего масштаба (**сотни** нод) это неважно — любая из библиотек справится, выбор определяется удобством кастомных нод, где React Flow выигрывает.

### 1.2 Архитектура локального сервиса

**Что верифицировано:** только **pywebview** независимо подтверждён. *(high, 3-0)*
- BSD-лицензия, кросс-платформенная обёртка вокруг нативного webview (**без отдельного браузера**), **прямая двусторонняя связь JS↔Python без HTTP/REST** (`js_api`, `expose`, `evaluate_js`). — `pywebview.flowrl.com`, `github.com/r0x0r/pywebview`

> ⚠️ **Честный пробел исследования:** варианты «static SPA + IndexedDB», «SPA + FastAPI/SQLite», «Tauri/Electron» не получили независимо подтверждённых утверждений (источники были, но не прошли верификацию/бюджет). Рекомендация ниже — инженерное суждение под ваш контекст (Python-команда, single-user, импорт файлов с диска), а не верифицированный факт.

**Рекомендация — FastAPI + SQLite + React/Vite SPA (+ опц. pywebview):**
| Вариант                    | Плюсы                                                                                                            | Минусы                                                                               | Вердикт                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Static SPA + IndexedDB     | нет бэкенда                                                                                                      | импорт файлов с диска неудобен (только через file-picker), персист только в браузере | ❌ для «импорт .md/.json из директории» слабо   |
| **SPA + FastAPI + SQLite** | **Python (родной стек), чтение `.md`/`.json` с диска тривиально, SQLite-персист оценок/сессий, REST для фронта** | нужен запуск `uvicorn`                                                               | ✅ **рекомендуется**                            |
| Tauri / Electron           | десктоп-дистрибутив                                                                                              | Rust/JS, тяжелее, не нужно для single-user                                           | ⚪ избыточно                                    |
| pywebview-обёртка          | десктоп-окно без браузера, остаёшься в Python                                                                    | бандлинг фронта                                                                      | ✅ **как опциональная упаковка** поверх FastAPI |

Команда — Python-heavy (Airflow/Spark/Django), поэтому бэкенд на Python снимает порог входа и делает импорт банка вопросов из директории нативным.

### 1.3 Импорт из Markdown / JSON

- **gray-matter** — де-факто парсер frontmatter (используется в Eleventy): YAML по умолчанию (+ JSON/TOML/кастом), разделяет `data` (метаданные) и `content` (тело). — `github.com/jonschlinkert/gray-matter`, `11ty.dev`. *(high, 3-0)*
  - 👉 На **Python-бэкенде** прямой аналог — **`python-frontmatter`** (+ `markdown-it-py`/`markdown` для рендера). Это и берём.
- **Astro Content Collections + Zod** — паттерн «схема валидирует каждую запись» (`id, topic, difficulty, question, answer, edges, score`), а `glob()`-лоадер тянет Markdown/MDX/JSON/YAML/TOML. — `docs.astro.build`. *(high, 3-0)*
  - 👉 Переносим паттерн на Python: **pydantic-модель** = схема ноды, валидируем каждый импортируемый файл (битый frontmatter → понятная ошибка).
- **mdbook-quiz** — минимальная схема банка: `Quiz` требует только массив `questions`; вопрос требует `answer` + `prompt`, опц. `context`/`id`. Хороший «скелет» полей. — `github.com/cognitive-engineering-lab/mdbook-quiz`. *(high, 3-0)*
- **json-quiz — ОТВЕРГНУТ:** плоский массив `steps`, поля только `id/items/meta/parameters`, **никакого механизма ветвления**; проект заброшен. Ветвление кладём поверх — через рёбра графа. — `json-quiz.github.io`. *(high, 3-0)*

### 1.4 UX раскрытия ноды

- **Немодальный диалог/drawer** перекрывает часть страницы, **не блокируя доступ к остальному** — граф остаётся интерактивным (в отличие от модалки). Требование доступности: фокусируемость с клавиатуры и закрытие с клавиатуры. — `accessuse.eu` (вторичный), подтверждено первичными W3C ARIA / MDN / NN/g. *(high, 3-0 / один пункт 2-1)*
- 👉 Реализация: боковой **drawer** для выбранной ноды (полный текст вопроса/ответа) + кнопка **«на весь экран»**. Markdown с подсветкой кода (важно для дата-инженерных листингов: SQL/PySpark/YAML).

### 1.5 Аналоги / prior art ветвления

- **QST** (GPL-2.0, self-hosted) — «Branching Questions / Skip Logic» (v3.12.09, 2025). — `github.com/bobb34/QST`
- **Interact** — визуальный canvas: вопросы/результаты перетаскиваются и соединяются от фиксированного Start-блока. ⚠️ *Опровергнуто (0-3):* что ветвление управляется **только** ответом — оно ещё и маршрутизирует на результаты. — `tryinteract.com`
- **Computerized Adaptive Testing (CAT)** — адаптивно выбирает следующий **самый информативный** вопрос по предыдущим ответам. — `arxiv.org/2108.07386`. *(high, 3-0)*
  - 👉 Заимствуем идею: после оценки ноды граф ведёт к более сложному (высокая оценка) или ремедиальному/боковому (низкая) вопросу.

### Открытые вопросы и ограничения (честно)

- Статусы актуальны на 2024-2026 — версии стоит перепроверить перед стартом.
- Сравнение Sigma/Cytoscape/vis-network опирается в основном на один блог (medium confidence) — но для нас не критично (масштаб «сотни нод»).
- Производительность React Flow на сотнях **богатых** HTML-нод не измерена → митигируем компактными нодами + рендером полного текста только в drawer (см. план).
- Схема рёбер для всех трёх измерений ветвления одновременно — спроектирована ниже (прямого верифицированного prior art для score-conditional рёбер не нашлось; берём CAT как идейную основу).

---

## Часть 2. План реализации

### 2.1 Архитектура

```
┌─────────────────────────────────────────────────────────┐
│  Frontend: React + Vite + React Flow (@xyflow/react)      │
│   ├─ GraphCanvas      — directed graph, Dagre/ELK layout  │
│   ├─ QuestionNode     — кастомная нода: title+badges+score │
│   ├─ DetailDrawer     — немодальный, full-screen toggle    │
│   └─ react-markdown + Shiki (подсветка SQL/PySpark/YAML)  │
└───────────────▲───────────────────────────┬──────────────┘
                │ REST (JSON)                │
┌───────────────┴───────────────────────────▼──────────────┐
│  Backend: FastAPI (Python)                                │
│   ├─ importer  — python-frontmatter + pydantic-валидация   │
│   ├─ graph     — сборка нод/рёбер, топологии, веса         │
│   ├─ sampler   — выбор вопросов пропорц. весам тем         │
│   └─ sessions  — оценки/прохождения → SQLite               │
└───────────────────────────┬──────────────────────────────┘
                            ▼
              content/  *.md / *.json   +   interview.db (SQLite)
       (опц.) всё это в окне pywebview — десктоп без браузера
```

### 2.2 Модель данных

**Нода (узел графа):**
```jsonc
{
  "id": "spark-shuffle-01",
  "kind": "question",             // question (теория) | task (практ. задача с кодом)
  "block": "frameworks",          // frameworks | databases | python | platform
  "topic": "distributed-batch",   // подтема внутри блока
  "difficulty": "middle",         // junior | middle | senior
  "weight": 13,                   // вес темы (для сэмплирования)
  "question": "Как выбрать join-стратегию в Spark при сильном skew?",
  "answer": "Broadcast для малой стороны; AQE skew join; соль...",
  // только для kind=task:
  "starterCode": "df = spark.read.parquet(...)\n# оптимизируй join ниже\n...",
  "rubric": ["распознал skew", "broadcast/AQE", "корректная партиционность"],
  "tags": ["spark", "optimization"],
  "edges": [ /* см. ниже */ ]
}
```

**Ребро (3 измерения ветвления в одной схеме):**
```jsonc
{
  "to": "spark-aqe-02",
  "type": "conditional",          // default | difficulty-up | difficulty-down | topic-jump | conditional
  "condition": { "minScore": 4 }  // оценка 1-5; >=4 → углубляемся
}
```
- **Ветвление по стеку/теме:** `type: "topic-jump"` + поле `topic`/`block` целевой ноды.
- **Ветвление по сложности:** `difficulty` + рёбра `difficulty-up`/`difficulty-down`.
- **Условное ветвление:** `type: "conditional"` + `condition.minScore/maxScore` → адаптивный маршрут по оценке (идея из CAT).

**pydantic-схема** валидирует каждый импортируемый файл (битый frontmatter → внятная ошибка), по образцу Astro+Zod.

### 2.3 Формат импорта

**Markdown (`content/frameworks/spark-shuffle-01.md`):**
```markdown
---
id: spark-shuffle-01
block: frameworks
topic: distributed-batch
difficulty: middle
weight: 13
edges:
  - { to: spark-aqe-02,    type: conditional,      condition: { minScore: 4 } }
  - { to: spark-basics-00, type: difficulty-down,  condition: { maxScore: 2 } }
---
## Вопрос
Как выбрать стратегию join в Spark при сильном data skew?

## Ответ
Broadcast join для малой стороны; AQE skew join (`spark.sql.adaptive.skewJoin`);
техника «соли» для перекошенных ключей; ...
```
**JSON** — тот же объект ноды; массив `nodes[]` + `edges[]`. Оба формата проходят через одну pydantic-схему.

### 2.4 Балансировка тем (из измеренного дисбаланса репо)

**Эмпирика (замер по `/Users/user/dev/projects/work`, 3355 `.py`-файлов без venv/кэшей):** число файлов с реальным импортом / интенсивность.

| Технология            | Файлов с импортом | Строк | Решение                        |
| --------------------- | ----------------: | ----: | ------------------------------ |
| Airflow               |               864 |  3086 | → Фреймворки (доминирует)      |
| Spark/PySpark         |               392 |  7452 | → Фреймворки (доминирует)      |
| Django/DRF            |               890 |  2465 | **исключён** (веб-слой, не DE) |
| pandas                |               326 |   352 | → Python                       |
| Hive/HDFS             |              694* |  5791 | → Базы данных                  |
| PostgreSQL            |       38** (503*) |  8161 | → Базы данных (занижен ORM)    |
| ClickHouse            |                88 |  2708 | → Базы данных                  |
| numpy / pydantic      |          102 / 65 |     — | → Python                       |
| Kafka / Trino / Flink |       18 / 2 / ~0 |     — | → пол (архитектурно важны)     |

\* широкий grep (вкл. SQL/конфиги). \*\* прямой `psycopg`; реально шире через ORM.

**Как веса получены:** прямое проецирование долей даёт перекос (Airflow+Spark+Django ≈ 75%), поэтому применены **полы и потолки** — доминирующие темы не вытесняют всё, а «тонкие, но архитектурно важные» (Trino/Kafka/Flink) получают гарантированный минимум. Веб-слой (Django/Celery/Redis/Oracle) исключён по решению «только дата-инженерия».

**Правило абстракции:** вопросы **пишутся конкретно** (про Spark, ClickHouse, Airflow), но **категоризируются по `block`/`topic`** — отдельной верхнеуровневой темы «ClickHouse» или «pandas» нет, они живут как примеры внутри «Базы данных»/«Python». Это и есть «поднятый уровень абстракции».

Веса = % банка на 100 вопросов (зафиксировано в memory):

| Блок                  |    % | Подтемы (вес)                                                                                                                            |
| --------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Фреймворки**        |   35 | оркестрация/Airflow 16 · распред. батч/Spark 13 · стриминг+messaging/Kafka,Flink 6                                                       |
| **Базы данных**       |   30 | аналитический SQL 10 · OLAP/ClickHouse 5 · OLTP/Postgres 5 · движки запросов+metastore/Trino,Hive 5 · хранение+форматы/HDFS,S3,parquet 5 |
| **Python**            |   23 | язык/идиомы 8 · данные в Python/pandas,numpy 8 · валидация+тесты+качество 7                                                              |
| **Платформа/DataOps** |   12 | контейнеры/Docker,K8s 4 · CI/CD/GitLab 3 · домен/прогноз спроса,time-series 3 · мониторинг+lineage+DQ 2                                  |

**Sampler** выбирает стартовые вопросы пропорционально весам тем → баланс задаётся данными, не хардкодом. Веса можно переопределять в конфиге.

### 2.5 Этапы

1. **MVP-граф (каркас).** Vite+React+React Flow; кастомная `QuestionNode` (заголовок + бейдж блока/сложности + звёзды-оценка); статический JSON-фикстур. Dagre-раскладка.
2. **Импорт контента.** FastAPI `/api/graph`; `python-frontmatter` + pydantic; чтение `content/**/*.md|*.json`; внятные ошибки валидации.
3. **Раскрытие ноды.** Немодальный `DetailDrawer` + full-screen; `react-markdown` + Shiki (SQL/PySpark/YAML); a11y (фокус/Esc).
4. **Оценка и сессии.** Виджет оценки 1-5 → POST в SQLite; история прохождений.
5. **Ветвление.** Типизированные рёбра + условная маршрутизация по оценке; подсветка «следующего рекомендованного» вопроса (логика CAT-lite).
6. **Балансировка.** Sampler по весам тем; конфиг весов; режим «собрать интервью на N вопросов с заданным профилем junior/middle/senior».
7. **Упаковка (опц.).** Обёртка pywebview → десктоп-окно без браузера.

### 2.6 Конкретный стек реализации

- **Frontend:** Vite, React 18, `@xyflow/react` (React Flow), `dagre` (или `elkjs`), `react-markdown` + `shiki`/`rehype-highlight`, drawer (Radix UI / собственный).
- **Backend:** Python 3.11+, FastAPI, uvicorn, `python-frontmatter`, `markdown-it-py`, pydantic v2, SQLite (sqlite3/SQLModel).
- **Опц. упаковка:** pywebview.
- **Качество (как в ваших репо):** ruff, mypy, pytest, pre-commit.

### 2.7 Структура проекта

```
interview/
├─ backend/
│  ├─ app/ (main.py, importer.py, models.py, sampler.py, db.py)
│  └─ pyproject.toml
├─ frontend/
│  └─ src/ (GraphCanvas, QuestionNode, DetailDrawer, api.ts)
├─ content/
│  ├─ frameworks/  databases/  python/  platform/   # *.md / *.json
│  └─ weights.yaml        # переопределение весов тем
└─ REPORT.md (этот файл)
```

### 2.8 Риски / открытые вопросы к решению

1. **Архитектура** — подтверждаете FastAPI+SQLite (+опц. pywebview)? Или хотите чисто статический SPA / Tauri?
2. **Производительность React Flow** на сотнях богатых нод — план: компактная нода + полный текст только в drawer; при необходимости `onlyRenderVisibleElements` и мемоизация.
3. **Прохождение vs редактирование** — нужен ли визуальный редактор графа (как Interact), или контент правится только в `.md`/`.json`?
4. **Сессии/кандидаты** — хранить результаты по кандидатам? (влияет на схему SQLite)

---

### Источники (ключевые, verified)
React Flow: `reactflow.dev`, `github.com/xyflow/xyflow`, `reactflow.dev/examples/layout/dagre` · pywebview: `pywebview.flowrl.com`, `github.com/r0x0r/pywebview` · импорт: `github.com/jonschlinkert/gray-matter`, `docs.astro.build/en/guides/content-collections`, `11ty.dev`, `github.com/cognitive-engineering-lab/mdbook-quiz`, `json-quiz.github.io` · UX: `accessuse.eu` (+ W3C ARIA/MDN/NN/g) · prior art: `github.com/bobb34/QST`, `tryinteract.com`, `arxiv.org/2108.07386`
