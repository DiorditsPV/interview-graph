---
block: frameworks
difficulty: middle
id: streaming-06
kind: question
subblock: streaming
tags:
- streaming
- partitioning
title: Producer-тюнинг и партиционирование
topic: streaming
weight: 6
---

## Вопрос
Как продюсер Kafka выбирает партицию и какими параметрами тюнят throughput (`batch.size`, `linger.ms`, `compression`)? Как это влияет на порядок?

## Ответ
**Выбор партиции:** если задан ключ — `partition = hash(key) % partitions` (одинаковый ключ → одна партиция → сохраняется порядок по ключу). Без ключа — sticky partitioning (батчит в одну партицию, периодически меняя) для эффективности.

**Throughput-тюнинг:**
- `batch.size` — макс. размер батча на партицию; больше батч → выше throughput, ниже накладные.
- `linger.ms` — сколько ждать, добивая батч перед отправкой; небольшой `linger` (5–50 мс) заметно улучшает батчинг ценой латентности.
- `compression.type` (snappy/lz4/zstd) — сжатие батча: меньше сети/диска, выше throughput за счёт CPU.
- плюс `buffer.memory`, `max.in.flight.requests.per.connection`.

**Порядок:** при ретраях и `max.in.flight > 1` без идемпотентности сообщения могут переупорядочиться в партиции. `enable.idempotence=true` сохраняет порядок и убирает дубли даже при ретраях (рекомендуется), `acks=all` — для надёжности.
