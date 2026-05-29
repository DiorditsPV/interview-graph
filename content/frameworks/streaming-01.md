---
block: frameworks
difficulty: middle
id: streaming-01
kind: question
subblock: streaming
tags:
- kafka
- flink
- exactly-once
title: 'Exactly-once: Kafka → Flink'
topic: streaming
weight: 6
---

## Вопрос
Как добиться exactly-once при доставке из Kafka во Flink и далее в приёмник? Что для этого нужно от каждого звена?

## Ответ
Exactly-once в Flink опирается на распределённые чекпойнты (Chandy-Lamport): барьеры проходят по графу, состояние и оффсеты Kafka коммитятся атомарно вместе с чекпойнтом. Нужно: source хранит оффсеты в состоянии (Flink Kafka source), включён checkpointing, а **sink должен быть транзакционным или идемпотентным** — иначе получится at-least-once.

Для Kafka-sink — транзакции Kafka (two-phase commit, `EXACTLY_ONCE`). Для внешних БД — идемпотентная запись (upsert по ключу) или 2PC-sink. Цепочка exactly-once крепка ровно настолько, насколько слабейшее звено: неидемпотентный приёмник сводит гарантию к at-least-once.
