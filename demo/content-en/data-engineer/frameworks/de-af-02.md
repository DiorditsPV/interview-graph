---
block: frameworks
difficulty: middle
id: de-af-02
kind: question
subblock: airflow
tags:
- orchestration
- architecture
title: Passing data between tasks
topic: task-communication
weight: 4
---

## Question
Two tasks in the same DAG need to exchange data. What are your options, and where is the line
between them?

## Answer
Airflow gives you XComs for small values. A task returns a value, the scheduler stores it in the
metadata database, and a downstream task pulls it by task id. That is the right mechanism for
control-plane data: a partition name, a row count, an object key, a flag that decides which branch
runs. It is the wrong mechanism for payloads, because every value lands in the same database that
schedules every DAG in the cluster, and a few megabytes per run will eventually degrade scheduling
for everyone.

Anything larger goes through shared storage. The upstream task writes to object storage or a table
under a deterministic path derived from the run's data interval, and the downstream task reads that
same path. Only the path travels through Airflow, and often not even that, because both tasks can
compute it from the interval independently.

The deeper point is that Airflow is an orchestrator, not a data transport. Tasks should be
restartable in isolation, and a task that reads a path computed from its own interval satisfies
that; a task that depends on a value another task happened to leave in memory does not.
