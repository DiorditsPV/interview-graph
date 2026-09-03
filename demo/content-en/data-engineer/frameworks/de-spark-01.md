---
block: frameworks
difficulty: junior
id: de-spark-01
kind: question
subblock: pyspark
tags:
- distributed
- optimization
title: Transformations versus actions
topic: lazy-evaluation
weight: 3
---

## Question
Why does a chain of Spark transformations return instantly while a single `count()` takes minutes?

## Answer
Transformations such as `select`, `filter` and `join` are lazy. Calling them only extends a logical
plan attached to the DataFrame; no data is read and no executor does any work. An action such as
`count`, `collect` or a write is what forces execution: at that point the optimiser turns the
accumulated logical plan into a physical plan, splits it into stages at shuffle boundaries, and the
scheduler dispatches tasks to executors.

Laziness exists so the optimiser can see the whole pipeline at once. Knowing that a filter follows a
read, it can push the predicate down into the scan and skip files entirely; knowing which columns
survive to the end, it reads only those from a columnar format. Neither optimisation is available to
a system that executes each step eagerly.

The practical consequence catches people out: if you trigger three actions on the same DataFrame,
the plan runs three times, re-reading the source each time. When a result is genuinely reused, either
persist it or restructure the job so it is computed once and written once.
