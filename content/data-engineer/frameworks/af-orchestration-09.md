---
block: frameworks
difficulty: junior
id: af-orchestration-09
kind: question
subblock: airflow
tags:
- orchestration
- deployment
title: Connections, Hooks и секреты
topic: orchestration
weight: 16
---

## Вопрос
Что такое Connection и Hook в Airflow, как они связаны и где правильно хранить секреты (secrets backend)?

## Ответ
**Connection** — именованная запись (под `conn_id`) с параметрами доступа к внешней системе: host, login, password, port, extra. **Hook** — клиент-обёртка над внешним сервисом (`PostgresHook`, `S3Hook`, `HttpHook`): берёт креды из Connection по `conn_id` и инкапсулирует работу с API/драйвером. Оператор обычно **тонкий** и внутри использует Hook — так логика доступа переиспользуется между операторами.

**Хранение секретов:**
- По умолчанию Connections/Variables лежат в **метабазе** (пароли шифруются Fernet-ключом).
- Прод-практика — **secrets backend**: Airflow читает Connections/Variables из внешнего хранилища (HashiCorp Vault, AWS/GCP Secrets Manager). Порядок поиска: secrets backend → переменные окружения (`AIRFLOW_CONN_*`) → метабаза. Плюсы: централизованная ротация, секреты не в БД и не в коде.

Главное правило — **никогда не хардкодить креды в DAG**; доступ только через Connection/Hook (или secrets backend).
