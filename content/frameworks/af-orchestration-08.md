---
block: frameworks
difficulty: middle
id: af-orchestration-08
kind: question
subblock: airflow
tags:
- orchestration
title: Trigger rules и ветвление
topic: orchestration
weight: 16
---

## Вопрос
Что такое trigger rules в Airflow и как с их помощью (и с `BranchPythonOperator`) строить обработку ошибок и условные ветки?

## Ответ
`trigger_rule` определяет, при каком статусе апстримов запускается задача. По умолчанию `all_success`. Важные:
- `all_done` — запуститься, когда все апстримы завершились **любым** статусом (для финальной/cleanup-задачи);
- `all_failed`, `one_failed` — алерт/реакция, как только хоть один упал;
- `one_success`;
- `none_failed_min_one_success` — типично для задачи после слияния веток.

**Ветвление:** `BranchPythonOperator` (или `@task.branch`) возвращает `task_id`(ы) ветки, которую нужно исполнить; остальные ветки получают статус `skipped`. Чтобы задача после слияния веток не «засветилась» `skipped` по цепочке, ей ставят `trigger_rule=none_failed_min_one_success`.

**Обработка ошибок:** cleanup-задача с `all_done` (выполнится несмотря на сбои выше), алертовая задача с `one_failed`, либо `on_failure_callback`. Правило: «или-или по условию» → branching; «сделать несмотря на сбои выше» → `all_done`.
