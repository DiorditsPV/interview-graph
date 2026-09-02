---
block: databases
difficulty: junior
id: acid-01
kind: question
subblock: dbms
tags:
- consistency
- architecture
title: ACID и BASE
topic: db-theory
weight: 5
---

## Вопрос
Что означает ACID (atomicity / consistency / isolation / durability) и что гарантирует каждое свойство? Чем ACID отличается от BASE?

## Ответ
**ACID** — свойства надёжной транзакции:
- **Atomicity** — транзакция применяется целиком или не применяется вовсе (всё или ничего; при сбое — откат).
- **Consistency** — транзакция переводит БД из одного валидного состояния в другое, не нарушая ограничений (constraints, FK, триггеры).
- **Isolation** — параллельные транзакции не видят промежуточных результатов друг друга; степень задаётся уровнем изоляции.
- **Durability** — после `COMMIT` данные переживут сбой (журнал/WAL + fsync).

**BASE** (Basically Available, Soft state, Eventual consistency) — противоположный подход распределённых NoSQL-хранилищ: жертвуем строгой консистентностью ради доступности и масштабирования, данные сходятся к согласованному состоянию **со временем** (eventual consistency).

ACID типичен для OLTP-СУБД (PostgreSQL), BASE — для AP-систем (Cassandra/DynamoDB). Связь с CAP: строгий ACID на нескольких узлах тяготеет к CP (ради консистентности жертвуем доступностью при разделении).
