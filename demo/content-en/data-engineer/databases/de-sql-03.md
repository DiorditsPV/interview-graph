---
block: databases
difficulty: senior
id: de-sql-03
kind: question
subblock: sql
tags:
- sql
- optimization
title: Reading a slow query plan
topic: query-planning
weight: 5
---

## Question
A report query that used to take seconds now takes minutes, with no code change. How do you
investigate?

## Answer
Start from the plan, not from guesses. Compare the plan the database produces now against what you
expect, and read it for three things: the join strategy, the row estimates, and where the time is
actually spent. An execution plan with real counts alongside the estimates is far more useful than a
plan alone, because the interesting failure is almost always a large gap between estimated and
actual rows.

That gap explains most sudden regressions. The optimiser chooses a join algorithm from cardinality
estimates, and a nested loop that was optimal for a hundred estimated rows becomes catastrophic when
the real number turns out to be a million. Estimates go stale when statistics are not refreshed after
a bulk load, when data has grown unevenly, or when a correlated predicate defeats the independence
assumption the estimator makes. Refreshing statistics is the first cheap thing to try.

Then check whether an index stopped being usable. Wrapping an indexed column in a function, comparing
across mismatched types, or a leading wildcard all force a full scan while the query text looks
unchanged. Finally consider whether the problem is not this query at all: a plan can also degrade
because of lock contention or because the working set no longer fits in cache, and both show up as
wait time rather than as a bad plan shape.
