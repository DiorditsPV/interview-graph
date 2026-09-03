---
block: databases
difficulty: junior
id: de-dbms-01
kind: question
subblock: dbms
tags:
- storage
- architecture
title: Row stores versus column stores
topic: storage-layout
weight: 3
---

## Question
Why is PostgreSQL a poor fit for scanning a billion-row fact table, and why is an analytical engine
a poor fit for an order-entry service?

## Answer
The difference is physical layout. A row store keeps all columns of a row together, so fetching or
modifying one complete record touches a single page. That is exactly what transactional work does:
read one order, update its status, insert a new line. It also makes row-level locking, indexes on
selective predicates and multi-statement transactions natural.

A column store keeps each column contiguously. An analytical query that touches four columns out of
two hundred reads only those four, so it moves a fraction of the bytes. Storing similar values
together also compresses far better, and lets the engine work on batches of values at a time instead
of row by row. Scanning a billion rows to compute a few sums is therefore an order of magnitude
cheaper than in a row store.

The costs are symmetric. Updating a single row in a column store means touching every column segment
and usually rewriting parts of files, so point updates are expensive and often only eventually
applied. Analytical engines also tend to offer weaker transactional guarantees and no meaningful
support for many small concurrent writes. Pick by access pattern: many small reads and writes of
whole rows, or few large scans of few columns.
