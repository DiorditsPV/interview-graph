---
block: frameworks
difficulty: senior
id: dbt-03
kind: question
subblock: dbt
tags:
- dbt
- lineage
- snapshots
- ci
title: 'dbt на масштабе: lineage и SCD'
topic: transformations
weight: 6
---

## Вопрос
Как dbt помогает с lineage и тестируемостью на масштабе, и как организовать историчность (SCD) через snapshots? Где dbt НЕ заменяет оркестратор?

## Ответ
`ref()`/`source()` дают dbt полный DAG моделей → автоматический lineage, `dbt run --select state:modified+` для пересборки только затронутого подграфа (slim CI), документация и тесты как часть графа. На масштабе: разбиение на слои (staging→intermediate→marts), контракты моделей, `--defer` к проду в CI.

**Snapshots** реализуют SCD Type 2: dbt отслеживает изменения по `unique_key` + стратегии (`timestamp`/`check`) и ведёт `dbt_valid_from`/`dbt_valid_to`, сохраняя историю строк.

dbt — это слой **T (transform)** внутри ELT: он не забирает данные и не планирует запуски. Расписание, ретраи, зависимости от внешних задач и сенсоры остаются за оркестратором (Airflow вызывает `dbt run`/`dbt test` как шаги DAG).
