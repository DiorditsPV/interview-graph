---
block: databases
difficulty: senior
id: pg-isolation-01
kind: question
subblock: dbms
tags:
- consistency
- concurrency
- sql
title: 'PostgreSQL: уровни изоляции и MVCC'
topic: oltp-relational
weight: 5
---

## Вопрос
Какие уровни изоляции есть в PostgreSQL, какие аномалии они предотвращают и как это реализовано через MVCC?

## Ответ
**Аномалии конкурентного доступа:** dirty read (чтение незакоммиченного), non-repeatable read (перечитал строку — изменилась), phantom read (повторный запрос вернул новые строки), плюс serialization anomalies.

**Уровни изоляции в PG:**
- **Read Committed** (по умолчанию) — не видит незакоммиченное, но возможны non-repeatable и phantom (каждый оператор берёт свежий снапшот).
- **Repeatable Read** — снапшот на всю транзакцию: нет dirty / non-repeatable / phantom (в PG RR строже стандарта). При конфликте записи → `could not serialize access` (serialization failure), нужен ретрай.
- **Serializable (SSI)** — полная сериализуемость через Serializable Snapshot Isolation: отслеживает опасные пересечения чтений/записей и откатывает одну из транзакций.

Нюанс: в PG нет dirty read даже на «Read Uncommitted» (он маппится в Read Committed).

**MVCC:** каждая строка хранит версии с `xmin`/`xmax`; транзакция видит версии согласно своему снапшоту → **читатели не блокируют писателей** и наоборот. Цена — мёртвые версии (dead tuples), которые чистит `VACUUM`/autovacuum. На RR/Serializable конфликты разрешаются через ошибки сериализации, поэтому приложение должно уметь **ретраить** транзакцию.
