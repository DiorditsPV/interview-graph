---
block: frameworks
difficulty: middle
id: dbt-02
kind: question
subblock: dbt
tags:
- data-modeling
- quality
title: Incremental-модели и тесты
topic: transformations
weight: 6
---

## Вопрос
Как работает incremental-модель в dbt и как избежать дублей/пропусков при догрузке? Зачем нужны schema- и data-тесты?

## Ответ
Incremental: при первом запуске строится полностью, далее `dbt run` обрабатывает только новые строки, отобранные предикатом внутри `{% if is_incremental() %}` (обычно `where event_ts > (select max(event_ts) from {{ this }})`). Чтобы не было дублей — задают `unique_key` (dbt сделает merge/delete+insert), а чтобы не было пропусков на границе — берут перекрытие по времени (lookback) и полагаются на дедуп по ключу.

Тесты: **schema-тесты** (`not_null`, `unique`, `accepted_values`, `relationships`) описываются в YAML и проверяют контракт модели; **data-тесты** — произвольные SQL, возвращающие «плохие» строки. Тесты гоняются в CI (`dbt test`) как гейт качества витрин.
