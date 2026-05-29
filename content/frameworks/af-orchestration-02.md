---
block: frameworks
difficulty: middle
id: af-orchestration-02
kind: question
subblock: airflow
tags:
- airflow
- backfill
- scheduling
title: Backfill и catchup
topic: orchestration
weight: 16
---

## Вопрос
Как устроен backfill в Airflow и какие проблемы возникают при `catchup=True` на тяжёлых пайплайнах? Как их смягчить?

## Ответ
`catchup=True` заставляет планировщик создать запуски за все пропущенные интервалы от `start_date`. На тяжёлых DAG это вызывает лавину одновременных запусков и перегрузку кластера/источников.

Смягчение: `max_active_runs` на DAG, `max_active_tasks`/пулы (Pools) для ограничения параллелизма по ресурсу, `depends_on_past`/`wait_for_downstream` где нужна последовательность, разумный `start_date` и `catchup=False` с явным backfill через CLI по диапазону. Для идемпотентности — запись по партициям интервала.
