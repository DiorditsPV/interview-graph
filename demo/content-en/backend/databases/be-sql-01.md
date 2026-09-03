---
block: databases
difficulty: junior
id: be-sql-01
kind: question
subblock: sql
tags:
- sql
- optimization
title: When an index is not used
topic: index-selectivity
weight: 3
---

## Question
You added an index and the query is still slow. Give the reasons a database would ignore it.

## Answer
The most common reason is that the predicate is not sargable, meaning it is not expressed in a form
the index can be searched with. Wrapping the column in a function, doing arithmetic on it, comparing
it to a value of a different type that forces an implicit conversion, or using a leading wildcard in
a pattern all prevent an index seek, because the index is ordered by the raw column value and none of
those preserve that ordering. Rewriting the condition to put the column bare on one side, or
indexing the expression itself, restores it.

The second is selectivity. An index is only worth using when it eliminates most of the table. If a
condition matches a large share of rows, the planner correctly prefers a sequential scan, because
following index entries back to the table for many rows costs more in random reads than reading the
table in order. An index on a column with three distinct values is rarely useful for that reason.

The third is column order in a composite index. A composite index can only be searched on a prefix of
its columns, so an index on the pair does not help a query that filters only on the second one.

Finally, stale statistics: the planner chooses from estimates, and after a bulk load those estimates
can be far enough off to pick the wrong plan entirely.
