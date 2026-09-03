---
block: databases
difficulty: middle
id: de-sql-02
kind: task
rubric:
- aggregates qty by region and sku before ranking, not after
- filters the date range with a half-open interval rather than a function on dt
- ranks within each region using a window function partitioned by region
- applies the rank filter outside the window, in an outer query or qualify clause
- discusses ROW_NUMBER versus RANK and what should happen on a tie for third place
starterCode: '-- Table sales(region, sku, qty, dt).

  -- Return the three best-selling SKUs by total qty in each region for May 2026,

  -- ordered by region and then by descending total.

  -- Portable ANSI SQL is fine (Trino / Spark SQL / PostgreSQL).

  SELECT ...

  '
subblock: sql
tags:
- sql
- optimization
title: Top three products per region
topic: window-ranking
weight: 4
---

## Task
Write the query described in `starterCode`, then explain how you would decide between `ROW_NUMBER`
and `RANK` and what you would check before running it on a large table.

## Solution
Aggregate first, then rank the aggregates. A window function cannot be used in `WHERE` because it is
evaluated after filtering, so the rank goes in a subquery and is filtered outside it:

```sql
WITH totals AS (
  SELECT region, sku, SUM(qty) AS total
  FROM sales
  WHERE dt >= DATE '2026-05-01' AND dt < DATE '2026-06-01'
  GROUP BY region, sku
)
SELECT region, sku, total
FROM (
  SELECT region, sku, total,
         ROW_NUMBER() OVER (PARTITION BY region ORDER BY total DESC) AS rn
  FROM totals
)
WHERE rn <= 3
ORDER BY region, total DESC;
```

`ROW_NUMBER` always returns exactly three rows per region and breaks ties arbitrarily, which makes
the result non-deterministic when two products tie. `RANK` returns every product tied for third, so
a region can yield four rows. Which one is right is a business question, and the honest answer in an
interview is to state the trade-off rather than pick silently.

Two things matter on a large table. The date predicate is written as a half-open range so a
partition or index on `dt` can be used; wrapping `dt` in a function would prevent that. And the
aggregation runs before the window, so the ranking sorts one row per region and sku rather than the
whole fact table.
