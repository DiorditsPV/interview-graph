---
block: databases
difficulty: senior
id: de-dbms-02
kind: question
subblock: dbms
tags:
- optimization
- storage
title: Choosing a ClickHouse sort key
topic: primary-key-design
weight: 5
---

## Question
How do you choose the ordering key for a ClickHouse MergeTree table, and why is it more important
than any secondary index?

## Answer
In MergeTree the primary key is not a unique constraint and does not enforce anything. It defines the
order in which rows are physically stored inside each part, and ClickHouse keeps a sparse index with
one entry per granule, a block of several thousand rows. A query can only skip data if its predicate
matches a prefix of that ordering, in which case entire granules and parts are eliminated before
being read. Everything else is a full scan of the columns involved.

So the key is chosen from the query pattern, and the order of columns in it is the whole decision.
Put low-cardinality, frequently filtered columns first, then progressively more selective ones. A
common shape is a tenant or event-type column, then a date, then an identifier. Leading with a
high-cardinality column such as a raw user id ruins the sparse index for every query that does not
filter on that id, and it also hurts compression, since sorting is what puts similar values next to
each other.

Partitioning is a separate lever, usually by month, and it exists mainly so old data can be dropped
cheaply. Partitioning too finely creates many small parts, which slows both merges and queries.
Secondary data-skipping indexes help only after the ordering key is right; they cannot rescue a
table sorted for the wrong access pattern.
