---
block: frameworks
difficulty: senior
id: af-orchestration-03
kind: question
subblock: airflow
tags:
- deployment
- orchestration
title: KubernetesExecutor vs CeleryExecutor
topic: orchestration
weight: 16
---

## Вопрос
Сравни KubernetesExecutor и CeleryExecutor. Когда какой выбрать и какие подводные камни у KubernetesExecutor в проде?

## Ответ
**CeleryExecutor**: пул заранее поднятых воркеров, низкая латентность старта задачи, но фиксированные ресурсы и общая среда (конфликты зависимостей).

**KubernetesExecutor**: каждая задача — отдельный pod с собственными ресурсами/образом, идеальная изоляция и эластичность, но выше латентность старта (pull образа, планирование pod) и нагрузка на API-сервер.

Подводные камни K8s: холодный старт и большие образы, корректные requests/limits (иначе OOMKilled или недоутилизация), монтирование секретов (Kerberos/Vault), очистка завершённых pod, лимиты namespace. На гибридах часто KubernetesExecutor для тяжёлых/изолированных задач + Celery для лёгких частых.
