---
block: frameworks
difficulty: senior
id: spark-batch-09
kind: question
subblock: pyspark
tags:
- optimization
title: Adaptive Query Execution (AQE)
topic: distributed-batch
weight: 13
---

## Вопрос
Что такое Adaptive Query Execution (AQE) в Spark и что именно он адаптирует в рантайме?

## Ответ
**AQE** (`spark.sql.adaptive.enabled`, включён по умолчанию в Spark 3+) перепланирует запрос на основе **реальной статистики**, собранной после завершения shuffle-стадий, а не только по оценкам оптимизатора. Три основные оптимизации:

1. **Coalesce shuffle partitions** — после shuffle сливает мелкие партиции, чтобы не плодить крошечные задачи; снимает необходимость вручную тюнить `spark.sql.shuffle.partitions`.
2. **Skew join handling** — обнаруживает перекошенные партиции по фактическим размерам и разбивает их на под-партиции, устраняя «хвост» из одной долгой задачи.
3. **Switch join strategy** — если фактический размер одной стороны оказался мал, на лету переключает sort-merge join на broadcast hash join.

Зачем: статические оценки часто врут — после фильтров и join'ов кардинальность непредсказуема. Подводные камни: AQE помогает только там, где есть shuffle; в стриминге не применяется; стоит понимать пороги (`skewedPartitionThresholdInBytes`, `advisoryPartitionSizeInBytes`).
