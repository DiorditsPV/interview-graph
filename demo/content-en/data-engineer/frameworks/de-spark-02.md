---
block: frameworks
difficulty: senior
id: de-spark-02
kind: task
rubric:
- identifies key skew on store_id as the reason a few tasks dominate the stage
- broadcasts the small dimension so the fact table is never shuffled
- 'names a fallback for large-to-large skew: adaptive skew join handling or salting'
- controls output partitioning so the write does not produce many tiny files
- explains how to confirm the diagnosis from the Spark UI stage metrics
starterCode: '# PySpark: enrich a large fact table with a tiny store dimension.

  # The job is slow: a handful of hypermarkets carry most of the rows,

  # so a few shuffle partitions do almost all of the work.

  sales = spark.read.parquet("s3a://lake/sales")        # billions of rows

  stores = spark.read.parquet("s3a://lake/dim_store")   # a few thousand rows


  result = sales.join(stores, on="store_id", how="left")

  result.write.parquet("s3a://lake/sales_enriched")


  # What do you change, and why?

  '
subblock: pyspark
tags:
- optimization
- distributed
title: Fix a skewed Spark join
topic: spark-shuffle
weight: 5
---

## Task
The join in `starterCode` runs for hours and the Spark UI shows one stage where a couple of tasks
last far longer than the rest. Rewrite the job and justify every change.

## Solution
The dimension is a few thousand rows, so it never needs to be shuffled. Broadcasting it turns the
join into a map-side lookup and removes the shuffle of the fact table entirely, which is where all
the skew was being paid:

```python
from pyspark.sql.functions import broadcast

result = sales.join(broadcast(stores), on="store_id", how="left")
```

That alone fixes this case. The general answer matters too, because a broadcast only works while one
side fits in executor memory. For a large-to-large join with the same skew, adaptive query execution
can split the oversized partitions automatically once `spark.sql.adaptive.enabled` and
`spark.sql.adaptive.skewJoin.enabled` are on. When adaptive handling is not enough, salting is the
manual equivalent: append a random suffix to the hot keys on the fact side and replicate the matching
dimension rows across the same suffixes, so one key spreads over many partitions.

Finally, check the write. After a broadcast join the output keeps the fact table's partitioning, which
is usually fine, but if an earlier repartition inflated the count you get thousands of small files and
push the cost onto every downstream reader. Coalesce to a sane number and partition the output by date.
