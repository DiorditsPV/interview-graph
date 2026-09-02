---
block: frameworks
difficulty: senior
id: spark-batch-02
kind: task
rubric:
- распознал перекос (skew) и малый размер справочника
- broadcast join для stores (broadcast(stores))
- включил AQE skew join или применил соль (salting) при необходимости
- проверил число партиций результата / мелкие файлы на записи
starterCode: '# PySpark: join большой таблицы продаж с маленьким справочником магазинов.

  # Джоба тормозит из-за skew по store_id (несколько гипермаркетов = 80% строк).

  sales = spark.read.parquet("s3a://dlh/sales")        # ~5 млрд строк

  stores = spark.read.parquet("s3a://dlh/dim_store")   # ~3 тыс строк

  result = sales.join(stores, on="store_id", how="left")

  result.write.parquet("s3a://dlh/sales_enriched")

  # Задача: ускорить. Что меняешь и почему?

  '
subblock: pyspark
tags:
- optimization
title: Оптимизация skew-join
topic: distributed-batch
weight: 13
---

## Задача
Ускорь PySpark-джобу из `starterCode`: left join 5 млрд строк продаж с 3 тыс магазинов тормозит из-за skew по `store_id`. Опиши изменения и обоснуй.

## Эталон
1. **Broadcast** малого справочника: `sales.join(broadcast(stores), "store_id", "left")` — убирает shuffle большой таблицы целиком.
2. Если skew всё равно бьёт (например, не broadcast, а большой-большой join) — включить AQE skew join (`spark.sql.adaptive.enabled`, `spark.sql.adaptive.skewJoin.enabled`) или **salting**: добавить случайный суффикс к перекошенным ключам и размножить строки справочника.
3. На записи — контролировать число выходных партиций (`coalesce`/`repartition`) чтобы не плодить мелкие parquet-файлы; партиционировать по дате.
