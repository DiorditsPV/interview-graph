---
block: frameworks
difficulty: base
id: de-af-01
kind: question
subblock: airflow
tags:
- orchestration
title: What a DAG actually schedules
topic: dag-scheduling
weight: 2
---

## Question
What is a DAG in Airflow, and when does a run with `schedule="@daily"` actually start?

## Answer
A DAG is a directed acyclic graph of tasks plus the schedule that decides when a new run of that graph is created. The DAG file is Python that Airflow parses on a loop, so the graph is rebuilt from code rather than stored as a static definition; the acyclic part matters because dependencies must have a topological order the scheduler can walk.

The point candidates most often get wrong is timing. A run is identified by the data interval it covers, not by the moment it starts. With a daily schedule, the run whose interval is the 1st of the month is queued only once that interval has closed, so it starts just after midnight on the 2nd. Airflow deliberately waits for the period to end, because a pipeline that aggregates a day of data cannot run before that day exists.

In practice this means the templated dates a task receives describe the interval being processed, and they are stable across retries and manual backfills. That stability is what makes a task reproducible: rerunning it processes exactly the same slice of data it did the first time.
