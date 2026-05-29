---
block: databases
difficulty: base
id: oltp-pg-arch-01
kind: question
subblock: dbms
tags:
- consistency
- architecture
title: Архитектура PostgreSQL
topic: architecture
weight: 5
---

## Вопрос
Как устроен PostgreSQL: процессная модель, MVCC, WAL, shared buffers? Почему он подходит для OLTP?

## Ответ
PostgreSQL — реляционная **OLTP**-СУБД (строковое хранение, ACID-транзакции, индексы под точечные операции).

- **Процессная модель:** на каждое соединение — отдельный backend-процесс (не поток); фоновые процессы — checkpointer, WAL writer, autovacuum, background writer. Отсюда важность пулеров (PgBouncer) при многих коротких коннектах.
- **MVCC** (multiversion concurrency control): `UPDATE`/`DELETE` не перезаписывают строку, а создают новую версию и помечают старую — читатели не блокируют писателей и наоборот. Цена — «мёртвые» версии (dead tuples), которые убирает **VACUUM/autovacuum**; иначе раздувание (bloat).
- **WAL** (write-ahead log): изменения сначала пишутся в журнал (durability), потом применяются к страницам; на WAL построены крэш-восстановление, репликация (streaming) и PITR.
- **Shared buffers** — кэш страниц в общей памяти; данные читаются/пишутся страницами (8 КБ) через буферный пул, грязные страницы сбрасываются на checkpoint.
- **Планировщик** — cost-based, опирается на статистику (`ANALYZE`); план смотрят через `EXPLAIN`. Индексы (B-tree, GIN, BRIN…) ускоряют выборки.

Подходит для OLTP: короткие транзакции, точечные чтения/записи по индексам, строгая консистентность. Для тяжёлой аналитики по широким таблицам уступает колоночным OLAP-движкам.
