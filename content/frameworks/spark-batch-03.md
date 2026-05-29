---
block: frameworks
difficulty: senior
id: spark-batch-03
kind: question
subblock: pyspark
tags:
- spark
- dynamic-allocation
- tuning
title: Dynamic allocation в Spark
topic: distributed-batch
weight: 13
---

## Вопрос
Что такое Dynamic Allocation в Spark и какими параметрами он конфигурируется? Какое обязательное требование к шафлу нужно выполнить, чтобы он работал корректно?

## Ответ
**Dynamic Allocation** позволяет приложению **добавлять и отдавать executor'ы в рантайме** в зависимости от нагрузки: при backlog задач executor'ы запрашиваются, при простое — отдаются обратно cluster manager'у. Это экономит ресурсы кластера на джобах с неравномерной нагрузкой (и в shared-окружениях вроде YARN/K8s).

Ключевые параметры:
- `spark.dynamicAllocation.enabled=true` — включение.
- `spark.dynamicAllocation.minExecutors` / `maxExecutors` / `initialExecutors` — границы и старт.
- `spark.dynamicAllocation.executorIdleTimeout` — через сколько простоя executor отдаётся.
- `spark.dynamicAllocation.schedulerBacklogTimeout` (+ `sustainedSchedulerBacklogTimeout`) — порог появления новых задач, после которого запрашиваются executor'ы.

**Главное требование — сохранность shuffle-файлов** при удалении executor'а. Иначе данные шафла, лежавшие на отданном executor'е, потеряются. Решается одним из двух:
- **External Shuffle Service** — `spark.shuffle.service.enabled=true` (демон на ноде хранит shuffle-блоки независимо от жизни executor'а);
- либо **shuffle tracking** — `spark.dynamicAllocation.shuffleTracking.enabled=true` (актуально для Kubernetes, где external shuffle service обычно не разворачивают): Spark не убивает executor'ы, пока на них нужны shuffle-данные.
