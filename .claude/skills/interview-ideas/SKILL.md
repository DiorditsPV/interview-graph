---
name: interview-ideas
description: >-
  Работа с идеями вопросов интервью в Q_IDEAS.txt: добавить новые идеи, развернуть
  (доформулировать) существующие или РЕАЛИЗОВАТЬ их — превратить `[ ]`-идеи в готовые
  ноды-вопросы в content/ и пометить `[x]`. Используй, когда просят «добавь идею»,
  «допиши идеи», «сгенерируй/реализуй вопросы из идей», «оформи идею N как вопрос».
---

# Скилл: идеи вопросов (добавить / развернуть / реализовать)

Проект: локальный сервис интервью «граф вопросов». Идеи живут в `Q_IDEAS.txt` (реестр-леджер),
готовые вопросы — в `content/<block>/*.md|*.json`. Сервер обычно поднят на `http://localhost:8000`.

## Критично (грабли проекта)
- **НЕ доверяй Read-инструменту для файлов `content/` и `Q_IDEAS.txt`** — он отдаёт устаревший кэш
  (файлы нормализуются внешним скриптом). Бери ground truth через `cat`/`grep`/`/api/graph`.
- **Редактируй контент через `python-frontmatter`** (есть в `backend/.venv`), сохраняя нормализованный
  формат: алфавитные ключи, block-style `tags`, кириллица не эскейпится. Запись:
  `f.write_text(frontmatter.dumps(post) + "\n", encoding="utf-8")`.
- **Рёбер/ветвления НЕТ** — поле `edges` удалено из модели. Не добавляй его.
- После изменений — прогони скилл **interview-verify**.

## Модель ноды (frontmatter)
Обязательные: `id`, `block`, `topic`, `question` (или тело `## Вопрос`). Прочее:
`kind` (question|task), `subblock`, `title` (короткий заголовок для карточки), `difficulty`
(base|junior|middle|senior), `weight`, `tags` (1–3 шт.), для task — `starterCode`, `rubric`.

Тело Markdown: `## Вопрос` / `## Ответ`; для задач — `## Задача` / `## Эталон` (+ `starterCode`/`rubric`).
Не начинай строки тела с `#` вне блоков кода (это маркеры разбиения).

## Таксономия размещения
- `block` ∈ frameworks | databases | python | platform.
- `subblock`: frameworks → `airflow|pyspark|dbt|streaming`; databases → `sql|dbms|storage|formats`;
  python и platform — без subblock (одна колонка). Порядок задаётся в `frontend/src/layout.ts` (`PREFERRED_SUB`).
- `difficulty`: **base** = «как устроено X / обзор» (идёт над junior), далее junior → middle → senior.
- `tags`: только из 17 сквозных концептов — architecture, orchestration, optimization, partitioning,
  deployment, storage, streaming, consistency, data-modeling, quality, distributed, sql, monitoring,
  memory, file-formats, domain, concurrency. **Не вводи теги-названия технологий** (их и так видно по колонке).
  1–3 тега на ноду.
- `weight`: бери как у соседей в той же колонке (примеры: airflow 16, pyspark/dbt 13/6, sql 10, dbms/storage/formats 5).

## Режимы

### 1. Добавить идеи
Допиши строки `- [ ] <формулировка>` в `Q_IDEAS.txt` в подходящую группу (по `block/subblock`,
заголовки групп уже есть). Формулировки — **широкие, не узкие**, без раздувания списка. Если группы
нет — создай заголовок вида `Название (block/subblock) — идеи:`.

### 2. Развернуть идею
Возьми `[ ]`-идею и доформулируй: уточни охват, разнеси на под-пункты, привяжи к стеку команды
(Airflow/Spark/Trino/ClickHouse/Postgres/Kafka/HDFS/S3). Контент-ноды НЕ создавай.

### 3. Реализовать идеи (главное)
Для каждой выбранной `[ ]`-идеи:
1. Подбери `id` (kebab, по схеме соседей: `af-orchestration-NN`, `spark-batch-NN`, `oltp-pg-NN`, …),
   `block`/`subblock`/`topic`/`difficulty`/`weight`/`title`/`tags` (≤3 из 17).
2. Напиши `question` и **содержательный** `answer` (как у существующих нод — конкретно, по делу,
   с примерами на стеке команды). Для задач — `starterCode` + `rubric` + `## Эталон`.
3. Создай файл `content/<block>/<id>.md` (через `python-frontmatter`, нормализованный формат) или
   добавь объект в существующий `.json`.
4. В `Q_IDEAS.txt` помени идею: `- [x] <title> — <difficulty> (<id>)` (id в скобках обязателен — по нему дедуп).
5. Прогони **interview-verify**.

## Регенерация леджера (по запросу «пересобери Q_IDEAS / сведи реестр»)
```bash
python3 .claude/skills/interview-ideas/regen_ledger.py
```
Скрипт (stdlib, нужен сервер на :8000) пересобирает `[x]`-реестр из `/api/graph` (ground truth),
группирует по block/subblock, сортирует base<junior<middle<senior и **сохраняет** текущие `[ ]`-идеи.
Env `API_URL` переопределяет адрес. Пиши `Q_IDEAS.txt` в корне проекта.
Пул задаётся `POOL=<id>` (по умолчанию `data-engineer`); контент — `content/<pool>/<block>/`.

## Подсказка по содержанию
Стек команды (X5, дата-инженерия): Python, Airflow, Spark/PySpark, Flink, Trino, ClickHouse, Kafka,
PostgreSQL, HDFS/S3, Docker/K8s, GitLab CI; домен — прогноз спроса (time-series). Привязывай примеры к нему.
