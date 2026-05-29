---
block: frameworks
difficulty: base
id: af-architecture-01
kind: question
subblock: airflow
tags:
- airflow
- architecture
title: Архитектура Airflow
topic: architecture
weight: 16
---

## Вопрос
Из каких компонентов состоит Apache Airflow и как они взаимодействуют? Проследи путь DAG от файла до выполнения задачи.

## Ответ
Основные компоненты:
- **Scheduler** — сердце Airflow: периодически парсит DAG-файлы, создаёт DAG-раны и task-инстансы по расписанию/интервалам данных, ставит готовые задачи (с учётом зависимостей) в очередь.
- **DAG processor / dag parsing** — парсинг python-файлов из `dags/` в объекты DAG (в новых версиях вынесен в отдельный процесс).
- **Executor** — решает, где исполнять задачи (Local/Celery/Kubernetes); см. отдельный вопрос про executor'ы.
- **Workers** — процессы/поды, которые реально выполняют код задач.
- **Metadata DB** (Postgres/MySQL) — состояние всего: DAG-раны, статусы задач, Connections/Variables, XCom. Источник правды.
- **Webserver** (Flask/FastAPI) — UI и REST API поверх метабазы.
- **Triggerer** — асинхронное ожидание для deferrable-операторов.

**Путь DAG:** файл в `dags/` → scheduler парсит его и видит расписание → создаёт DAG-ран на интервал → формирует task-инстансы и проверяет зависимости/trigger rules → готовые задачи уходят executor'у → worker выполняет `execute()` → статус и XCom пишутся в метабазу → UI читает метабазу. Код DAG исполняется и при парсинге (на каждом цикле scheduler'а), и в worker'е — поэтому top-level код должен быть лёгким и без тяжёлых запросов.
