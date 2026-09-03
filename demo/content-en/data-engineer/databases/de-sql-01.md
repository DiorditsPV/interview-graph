---
block: databases
difficulty: base
id: de-sql-01
kind: question
subblock: sql
tags:
- sql
title: WHERE versus HAVING
topic: aggregation-filtering
weight: 2
---

## Question
What is the difference between `WHERE` and `HAVING`, and why can a `LEFT JOIN` behave like an
`INNER JOIN`?

## Answer
`WHERE` filters rows before grouping; `HAVING` filters groups after aggregation. So a condition on a
raw column belongs in `WHERE`, where it also reduces the number of rows that ever reach the grouping
step, while a condition on an aggregate such as `SUM(qty) > 100` can only be expressed in `HAVING`,
because the aggregate does not exist until the groups are formed. Putting a plain column filter in
`HAVING` usually still returns the right answer but does more work than necessary.

The `LEFT JOIN` trap is the same ordering idea one level up. A left join keeps unmatched left rows
and fills the right side with nulls. If you then write a `WHERE` condition on a right-side column,
those null rows fail the condition and disappear, which quietly turns the query into an inner join.
When the condition is meant to restrict which right rows are eligible to match, it belongs in the
`ON` clause, where it is applied during the join and unmatched left rows survive. When it is meant
to filter the final result, `WHERE` is correct and losing those rows is the intended behaviour.
