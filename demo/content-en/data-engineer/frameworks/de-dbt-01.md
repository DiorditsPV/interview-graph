---
block: frameworks
difficulty: junior
id: de-dbt-01
kind: question
subblock: dbt
tags:
- data-modeling
- orchestration
title: How dbt builds a DAG
topic: model-dependencies
weight: 3
---

## Question
A dbt project is a folder of SQL files. How does dbt know the order to run them in, and what do
materialisations change?

## Answer
Dependencies are inferred from the SQL itself. When one model selects from another it does so
through a `ref` call rather than a hard-coded table name, and dbt resolves those calls into a graph.
Because the graph comes from the code, it cannot drift from reality: rename a model and every
consumer either updates or fails to compile. The same mechanism handles environments, since `ref`
expands to whatever schema the current target points at, so the identical project builds into a
developer's sandbox or into production.

Materialisation decides what the compiled SQL becomes in the warehouse. A view stores only the query
and is recomputed on every read, which is cheap to build and right for thin transformations. A table
is fully rebuilt on each run, which is simple and predictable but pays for the whole history every
time. An incremental model builds fully once, then on later runs processes only new or changed rows
and merges them into the existing table, trading that simplicity for run time on large facts.
Ephemeral models are not persisted at all and are inlined into their consumers as a CTE.
