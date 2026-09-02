---
block: frameworks
difficulty: middle
id: spark-batch-01
kind: question
subblock: pyspark
tags:
- distributed
- optimization
title: Shuffle в Spark
topic: distributed-batch
weight: 13
---

## Вопрос
Что в Spark вызывает shuffle и почему он дорогой? Назови способы уменьшить объём shuffle.

## Ответ
Shuffle — перераспределение данных между партициями по сети, возникает при wide-трансформациях: `groupBy`, `join` (не broadcast), `repartition`, `distinct`, оконных функциях. Дорог из-за сериализации, диска и сети, и часто порождает skew.

Сократить: broadcast join для малой стороны (`broadcast()`), включить AQE (`spark.sql.adaptive.enabled`) для авто-coalesce партиций и skew join, фильтровать/агрегировать до join (predicate/aggregation pushdown), подбирать `spark.sql.shuffle.partitions` под объём, использовать партиционирование/бакетирование источников, избегать лишних `repartition`.
