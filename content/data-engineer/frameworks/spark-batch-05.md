---
block: frameworks
difficulty: middle
id: spark-batch-05
kind: question
subblock: pyspark
tags:
- partitioning
title: repartition vs coalesce
topic: distributed-batch
weight: 13
---

## Вопрос
Чем отличаются `repartition` и `coalesce`, и зачем/как управлять `spark.sql.shuffle.partitions`?

## Ответ
- **`repartition(n[, cols])`** — полный **shuffle**: перераспределяет данные на ровно `n` партиций (можно по ключу), даёт равномерные партиции; умеет и увеличивать, и уменьшать число.
- **`coalesce(n)`** — уменьшает число партиций **без полного shuffle**, сливая существующие (narrow-трансформация). Дёшево, но может дать перекос (неравномерные партиции). Для **увеличения** числа партиций `coalesce` не годится.

Практика: убрать лишние мелкие выходные файлы перед записью — `coalesce` (дёшево); нужно равномерно перераспределить или сменить ключ партиционирования — `repartition`.

**`spark.sql.shuffle.partitions`** (по умолчанию 200) — число партиций после shuffle (join/aggregation в DataFrame/SQL). Слишком много на маленьких данных → куча мелких задач и мелких файлов; слишком мало на больших → огромные партиции, spill/OOM. Подбирают под объём данных; с включённым **AQE** Spark сам коалесит лишние партиции после shuffle. (RDD-аналог числа партиций по умолчанию — `spark.default.parallelism`.)
