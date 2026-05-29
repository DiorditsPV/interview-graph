---
block: frameworks
difficulty: middle
id: streaming-04
kind: question
subblock: streaming
tags:
- kafka
- consumer-group
- rebalancing
title: Consumer groups и rebalancing
topic: streaming
weight: 6
---

## Вопрос
Как работают consumer groups и rebalancing в Kafka? Как партиции распределяются между консьюмерами и какие проблемы несёт ребаланс?

## Ответ
**Consumer group** — набор консьюмеров с общим `group.id`, между которыми делятся партиции топика: каждая партиция читается **ровно одним** консьюмером группы (масштабирование чтения). Консьюмеров больше, чем партиций — лишние простаивают. Разные группы читают независимо, каждая со своими оффсетами.

**Rebalancing** — перераспределение партиций при изменении состава группы (консьюмер зашёл/вышел/упал по таймауту) или числа партиций. Координирует group coordinator (брокер); стратегии назначения: range, round-robin, sticky, cooperative-sticky.

**Проблемы:** классический ребаланс — «stop-the-world»: на время ребаланса вся группа останавливает потребление (лаг). Частые ребалансы из-за долгой обработки (превышен `max.poll.interval.ms`) или нестабильных консьюмеров; потеря локального состояния и повторная обработка.

**Смягчение:** cooperative-sticky assignor (инкрементальный ребаланс без полной остановки), корректные `session.timeout.ms`/`heartbeat.interval.ms`/`max.poll.interval.ms`, static membership (`group.instance.id`), чтобы перезапуск консьюмера не вызывал ребаланс.
