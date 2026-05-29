---
block: frameworks
difficulty: base
id: dbt-architecture-01
kind: question
subblock: dbt
tags:
- architecture
- data-modeling
title: Как устроен dbt
topic: architecture
weight: 6
---

## Вопрос
Как работает dbt: что такое модель, как строится граф зависимостей, что происходит при `dbt run` и где в ELT находится dbt?

## Ответ
dbt — инструмент **трансформаций (T в ELT)**: данные уже загружены в склад (ClickHouse/Postgres/Snowflake/Trino), dbt превращает их в витрины **средствами SQL**. Своего движка исполнения у dbt нет — он генерирует SQL и отдаёт его складу.

- **Модель** — это файл с `SELECT`; dbt оборачивает его в `CREATE TABLE/VIEW` согласно материализации.
- **Граф зависимостей (DAG)** строится автоматически из функций `ref('other_model')` и `source(...)` в шаблонах Jinja: dbt понимает порядок и параллелизм по ссылкам, без ручного описания зависимостей.
- **`dbt run`**: компиляция (Jinja → чистый SQL, раскрытие `ref`/macros) → топологический порядок по DAG → исполнение SQL на складе в зависимости от **материализации** (`view`, `table`, `incremental`, `ephemeral`).
- Рядом: `dbt test` (проверки данных: not_null/unique/relationships), снапшоты (SCD2), документация и lineage из того же графа.

Важно: dbt **не оркестратор** (его запускают по расписанию из Airflow/cron) и **не хранилище** — только слой трансформаций и контроля качества поверх склада.
