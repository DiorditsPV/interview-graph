---
block: frameworks
difficulty: middle
id: de-spark-03
kind: question
subblock: pyspark
tags:
- optimization
- memory
title: Repartition versus coalesce
topic: partition-tuning
weight: 4
---

## Question
When do you use `repartition` and when `coalesce`, and how do you pick the number of partitions?

## Answer
`repartition` performs a full shuffle: it can raise or lower the partition count and redistributes
rows evenly, optionally by a key. `coalesce` only lowers the count and does so by merging existing
partitions on the executors where they already live, with no shuffle. Because it avoids the shuffle,
`coalesce` is much cheaper, but it cannot fix an uneven distribution, and shrinking aggressively also
shrinks the parallelism of the stage that produces the data.

The usual pattern is `repartition` in the middle of a job, when data arrived skewed or when you want
it laid out by the join or write key, and `coalesce` at the very end, when the result is small and
you would otherwise emit hundreds of tiny files.

For the count, aim for partitions of roughly a hundred to a few hundred megabytes and at least as
many partitions as you have executor cores, so no core sits idle at the tail of a stage. The default
shuffle partition count is a fixed number that suits neither small nor very large jobs; with adaptive
query execution enabled Spark coalesces shuffle partitions at runtime based on actual sizes, which
removes most of the need to tune that value by hand.
