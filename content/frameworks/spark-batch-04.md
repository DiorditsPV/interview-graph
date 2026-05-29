---
block: frameworks
difficulty: base
id: spark-batch-04
kind: question
subblock: pyspark
tags:
- spark
- architecture
- driver-executor
title: Архитектура PySpark
topic: architecture
weight: 13
---

## Вопрос
Расскажи принцип работы (Py)Spark: что делают драйвер, executor'ы, cluster manager и SparkSession? Как PySpark-код доезжает до JVM и как задание разбивается на единицы исполнения?

## Ответ
**Driver** — процесс, где живёт твоя программа и `SparkContext`/`SparkSession`. Он строит логический и физический план, разбивает работу и через DAG Scheduler / Task Scheduler раздаёт задачи; собирает результаты (`collect`), хранит метаданные. Падение драйвера = падение приложения.

**Executor'ы** — рабочие процессы на нодах кластера: исполняют **таски**, держат данные в памяти/на диске (кэш, shuffle-блоки), отчитываются драйверу. У каждого свои cores и память.

**Cluster manager** — выделяет ресурсы под executor'ы: YARN, Kubernetes, Spark Standalone (или local-режим). Spark от него абстрагирован.

**SparkSession** — единая точка входа (обёртка над `SparkContext`, SQL/Hive-контекстами); через неё читаешь данные, делаешь DataFrame-операции, конфигурируешь приложение.

**PySpark → JVM:** Python-драйвер общается с JVM через **Py4J**; DataFrame/SQL-операции выполняются в JVM (Catalyst), поэтому работают на скорости Scala. «Питон» доезжает до executor'ов только для UDF/RDD-логики — тогда на воркерах поднимаются Python-процессы (накладные расходы на сериализацию; pandas/vectorized UDF их снижают).

**Единицы исполнения:** action запускает **job** → план делится на **stage**'ы по границам shuffle → каждый stage = набор **task**'ов, по одной на **партицию**. Трансформации ленивые, реально считаются при action'е.
