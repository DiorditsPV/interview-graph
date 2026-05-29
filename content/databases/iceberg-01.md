---
block: databases
difficulty: senior
id: iceberg-01
kind: question
subblock: formats
tags:
- file-formats
- storage
- architecture
title: 'Apache Iceberg: снапшоты и метаданные'
topic: storage-formats
weight: 5
---

## Вопрос
Как устроен Apache Iceberg: метаданные, снапшоты, манифесты, hidden partitioning? Почему движкам (Trino/Spark) с ним удобно?

## Ответ
Iceberg хранит таблицу как **дерево метаданных** поверх data-файлов (обычно parquet):
- **metadata file** — текущая схема, спецификация партиционирования, список снапшотов;
- каждый commit создаёт новый **snapshot**, ссылающийся на **manifest list**;
- manifest list → **manifest files** → списки data-файлов со статистикой (min/max по колонкам, число строк, partition values).

**Чтение:** движок берёт текущий снапшот и по статистике в манифестах отсекает ненужные файлы (file pruning) — **без дорогого LIST** на S3. **Запись:** атомарный commit нового снапшота (optimistic concurrency) → ACID и snapshot-изоляция; старые снапшоты дают **time travel** и rollback.

**Hidden partitioning:** партиционирование задаётся трансформацией над колонкой (`day(ts)`, `bucket(id)`), и Iceberg сам хранит соответствие. Пользователю не нужно фильтровать по «синтетической» колонке партиции, а pruning не ломается при смене схемы партиционирования (**partition evolution**).

Движкам удобно: единый стандарт метаданных (Trino/Spark/Flink читают одинаково), pruning по статистике, эволюция схемы/партиций без переписывания, нет зависимости от листинга Hive-metastore.
