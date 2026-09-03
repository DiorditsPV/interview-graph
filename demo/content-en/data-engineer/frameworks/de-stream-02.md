---
block: frameworks
difficulty: middle
id: de-stream-02
kind: question
subblock: streaming
tags:
- streaming
- consistency
title: Delivery guarantees in practice
topic: delivery-semantics
weight: 4
---

## Question
At-least-once, at-most-once, exactly-once: what do they mean for a consumer, and what does a
pipeline actually need?

## Answer
The difference is where you commit the offset relative to doing the work. Commit before processing
and a crash loses the message, which is at-most-once. Commit after processing and a crash replays
it, which is at-least-once. At-least-once is the sane default, because losing data is usually worse
than seeing it twice.

Exactly-once is the one people overstate. Kafka's transactional producer gives exactly-once
semantics for read-process-write flows that stay inside Kafka: consuming, transforming and producing
commit atomically with the offsets. What it does not cover is side effects in other systems. The
moment your handler writes to a database, calls an API or sends an email, that effect is outside the
transaction and can happen twice.

So the practical target is at-least-once delivery plus an idempotent consumer. Give every event a
stable identifier and make the write absorb repetition: upsert on that key, or record processed ids
and skip duplicates. Then a replay is harmless, retries are free, and you no longer need a guarantee
the transport cannot give you across system boundaries.
