---
block: frameworks
difficulty: senior
id: streaming-03
kind: question
subblock: streaming
tags:
- kafka
- delivery-semantics
- exactly-once
title: Гарантии доставки Kafka
topic: streaming
weight: 6
---

## Вопрос
Какие гарантии доставки даёт Kafka (at-most-once / at-least-once / exactly-once)? В чём роль `acks`, idempotent producer и транзакций?

## Ответ
**`acks` на продюсере:** `acks=0` — не ждём подтверждения (at-most-once, можно потерять); `acks=1` — лидер записал (потеря при падении лидера до репликации); `acks=all` — все ISR подтвердили (durability, вместе с `min.insync.replicas`).

- **at-least-once** — продюсер ретраит при сбое → возможны дубли; безопасный дефолт.
- **Idempotent producer** (`enable.idempotence=true`) — продюсер нумерует сообщения (producer id + sequence), брокер отбрасывает дубли при ретраях → нет дублей в пределах партиции и сохраняется порядок. Сейчас включён по умолчанию.
- **Exactly-once (EOS)** — идемпотентный продюсер + **транзакции** (`transactional.id`): атомарная запись в несколько партиций/топиков и атомарный commit оффсетов вместе с выходом (паттерн read-process-write); консьюмер читает с `isolation.level=read_committed`. Так Kafka Streams даёт exactly-once.

На стороне консьюмера важен момент коммита оффсета: после обработки = at-least-once, до = at-most-once. **Сквозной** exactly-once требует, чтобы и конечный приёмник был транзакционным/идемпотентным.
