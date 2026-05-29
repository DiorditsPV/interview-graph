---
block: frameworks
difficulty: junior
id: spark-batch-07
kind: question
subblock: pyspark
tags:
- architecture
- optimization
title: RDD vs DataFrame vs Dataset
topic: distributed-batch
weight: 13
---

## Вопрос
Чем отличаются RDD, DataFrame и Dataset и почему DataFrame обычно быстрее RDD? Когда оправдан RDD?

## Ответ
- **RDD** — низкоуровневая распределённая коллекция объектов. Типобезопасна, но Spark **не знает структуру** данных и не может оптимизировать — выполняет «как написано», сериализует JVM-объекты.
- **DataFrame** — распределённая таблица со схемой (`Row` + типы). Операции проходят через оптимизатор **Catalyst** (predicate/projection pushdown, реордеринг join) и движок **Tungsten** (бинарное off-heap представление, codegen), поэтому быстрее и экономнее по памяти. В PySpark особенно важно: DataFrame-операции выполняются в JVM **без накладных расходов на python-сериализацию**.
- **Dataset** — типизированный DataFrame (JVM-объекты + оптимизатор); только Scala/Java. **В Python Dataset нет** — есть только DataFrame.

**RDD оправдан**, когда нужен низкоуровневый контроль над партиционированием/физикой, данные неструктурированы или логика не выражается в DataFrame API. По умолчанию выбирают **DataFrame**.
