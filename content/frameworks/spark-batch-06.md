---
block: frameworks
difficulty: middle
id: spark-batch-06
kind: question
subblock: pyspark
tags:
- spark
- structured-streaming
- watermark
title: Spark Structured Streaming
topic: stream-processing
weight: 13
---

## Вопрос
Как устроен Spark Structured Streaming: модель micro-batch, watermark, checkpoints — и какие гарантии доставки он даёт?

## Ответ
Structured Streaming трактует поток как **бесконечно растущую таблицу**; запрос на DataFrame инкрементально пересчитывается с приходом новых данных. По умолчанию исполнение — **micro-batch**: по триггеру движок забирает новые данные и обрабатывает их как маленький батч (есть и continuous-режим с более низкой латентностью, но ограниченный).

- **watermark** (`withWatermark`) — граница «насколько опоздавшие события ещё принимаем». Нужен для оконных агрегаций по event-time: ограничивает рост состояния и позволяет отбрасывать слишком поздние события.
- **checkpoint** — каталог, где хранятся оффсеты источника, прогресс и состояние (state store); обеспечивает восстановление после сбоя ровно с места остановки.

**Гарантии:** replayable-источник (например Kafka) хранит оффсеты в чекпойнте → минимум at-least-once. Для **exactly-once по результату** нужен идемпотентный/транзакционный sink (либо встроенная поддержка, как у file sink с commit-логом). Формула: replayable source + checkpoint + идемпотентный sink = exactly-once.
