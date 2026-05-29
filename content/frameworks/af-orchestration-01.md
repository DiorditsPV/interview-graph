---
block: frameworks
difficulty: junior
id: af-orchestration-01
kind: question
subblock: airflow
tags:
- airflow
- dag
title: DAG и идемпотентность
topic: orchestration
weight: 16
---

## Вопрос
Что такое DAG в Airflow и почему задачи должны быть идемпотентными? Приведи пример, где нарушение идемпотентности ломает backfill.

## Ответ
DAG — направленный ациклический граф задач с зависимостями; Airflow планирует запуски по расписанию (`schedule_interval`) и интервалам данных (`data_interval`).

Идемпотентность = повторный запуск задачи за тот же интервал даёт тот же результат. Это критично, потому что Airflow может перезапускать задачи (retries, backfill, ручной clear). Пример нарушения: задача делает `INSERT` в таблицу без удаления старых данных за интервал — при backfill/повторе получаем дубли. Правильно: `DELETE WHERE dt = {{ ds }}` + `INSERT`, либо `INSERT OVERWRITE`/`MERGE`, либо запись в партицию по дате.
