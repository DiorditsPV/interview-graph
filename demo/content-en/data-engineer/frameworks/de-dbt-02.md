---
block: frameworks
difficulty: middle
id: de-dbt-02
kind: question
subblock: dbt
tags:
- quality
- data-modeling
title: Testing an incremental model
topic: incremental-testing
weight: 4
---

## Question
You own an incremental dbt model over a large event table. What can silently go wrong, and what
tests would catch it?

## Answer
The classic failure is late-arriving data. The incremental filter usually selects rows newer than
the maximum timestamp already loaded, so a record that arrives after its own event time has passed
that watermark is never picked up. It is silent because the model runs green every time; the rows
simply are not there. Widening the filter to a lookback window and merging on a unique key rather
than appending makes reprocessing safe, since a row seen twice updates instead of duplicating.

The second failure is drift. Incremental models are only rebuilt fully when someone asks, so a
change in the transformation applies to new rows while old rows keep the old logic, and the table
becomes internally inconsistent. A scheduled full refresh, or at minimum a full rebuild whenever the
model's logic changes, keeps history and present in agreement.

Both are detectable with dbt's built-in tests: `unique` and `not_null` on the merge key catch
duplication and broken joins, `accepted_values` catches enum drift, and a freshness or row-count
check on the source catches an upstream feed that stopped. Reconciling counts against the source for
a recent window is what actually catches the late-arrival gap.
