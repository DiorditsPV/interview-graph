---
block: frameworks
difficulty: middle
id: spark-joins-01
kind: question
subblock: pyspark
tags:
- optimization
- distributed
title: 'Spark: типы и стратегии джойнов'
topic: distributed-batch
weight: 13
---

## Вопрос
Какие логические типы джойнов и физические стратегии есть в Spark? Как Spark выбирает стратегию и как на неё повлиять?

## Ответ
**Логические типы:** inner, left/right/full outer, **left semi** (только строки левой, у которых есть пара), **left anti** (только без пары), cross.

**Физические стратегии:**
- **Broadcast hash join** — маленькая сторона рассылается на все executor'ы, джойн без shuffle большой таблицы (самый быстрый, если одна сторона мала).
- **Sort-merge join** — обе стороны шафлятся по ключу, сортируются и сливаются (дефолт для больших↔больших equi-join).
- **Shuffle hash join** — шафл по ключу + хеш-таблица на партицию (без сортировки), при определённых размерах.
- broadcast nested loop / cartesian — для не-equi и cross.

**Выбор:** Spark сравнивает оценку размера сторон с `spark.sql.autoBroadcastJoinThreshold` (по умолчанию 10 МБ) → broadcast, иначе sort-merge. **Влиять:** хинт `broadcast(df)` (или `/*+ BROADCAST */`), настройка порога; включённый **AQE** на лету переключает на broadcast по фактическим размерам и разбивает перекошенные партиции (skew join). Главная боль sort-merge — перекос по ключу (см. вопрос про shuffle/skew).
