---
block: databases
difficulty: middle
id: de-storage-01
kind: question
subblock: storage
tags:
- partitioning
- storage
title: Picking a partitioning scheme
topic: lake-partitioning
weight: 4
---

## Question
How do you choose partition columns for a table in a data lake, and what happens if you choose
badly in either direction?

## Answer
Partitioning writes data into directories by column value, and the payoff is partition pruning: a
query filtering on a partition column skips the other directories without opening a file. The
candidate columns are therefore the ones that appear in almost every query's filter, which in
practice usually means a date, sometimes combined with a coarse categorical column such as region or
event type.

Partition too coarsely and pruning does nothing, so every query scans everything. Partition too
finely and you hit the small files problem, which is the more common and more damaging mistake.
Partitioning by a high-cardinality column such as user id produces enormous numbers of directories
each holding a few kilobytes. Every file costs a listing call and a read request, metadata operations
start to dominate, and both query planning and job startup slow down badly. The rough target is
partitions in the hundreds of megabytes.

Two related habits matter. Compact small files periodically, because a streaming or frequent
micro-batch writer will create them no matter how well you partitioned. And remember that a query
only prunes when it filters on the partition column directly; applying a function to it, or filtering
on a correlated column instead, silently reverts to a full scan.
