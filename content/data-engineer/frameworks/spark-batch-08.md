---
block: frameworks
difficulty: middle
id: spark-batch-08
kind: question
subblock: pyspark
tags:
- memory
title: cache/persist и уровни хранения
topic: distributed-batch
weight: 13
---

## Вопрос
Как работают `cache`/`persist` в Spark, какие есть уровни хранения и когда кэширование вредит?

## Ответ
`cache()`/`persist()` помечают DataFrame/RDD для сохранения после первого вычисления, чтобы переиспользовать без пересчёта всей линии (lineage). `cache()` = `persist(MEMORY_AND_DISK)` для DataFrame (для RDD — `MEMORY_ONLY`). Кэш **ленивый**: материализуется при первом action.

**Уровни (`StorageLevel`):** `MEMORY_ONLY` (быстро, но при нехватке памяти партиции пересчитываются), `MEMORY_AND_DISK` (spill на диск), `DISK_ONLY`, варианты `_SER` (сериализованно — компактнее, дороже CPU), `_2` (реплика на 2 ноды).

**Полезно:** датасет переиспользуется несколько раз — итеративные алгоритмы, многократные action/join по одному промежуточному результату.

**Вредит/бесполезно:** датасет читается один раз (кэш только тратит память и время на запись); кэш вытесняет нужную execution-память → spill/OOM; «закэшировал на всякий случай». Не забывать `unpersist()`. Иногда дешевле перечитать из parquet с pushdown, чем держать в памяти.
