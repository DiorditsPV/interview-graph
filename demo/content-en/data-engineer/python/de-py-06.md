---
block: python
difficulty: middle
id: de-py-06
kind: question
tags:
- memory
- optimization
title: Making pandas fit in memory
topic: dataframe-memory
weight: 4
---

## Question
A pandas script dies loading a 5 GB CSV on a 16 GB machine. What do you do before reaching for
Spark?

## Answer
First understand why 5 GB on disk needs far more than 5 GB in memory. Text columns are stored as
Python objects by default, so a short string can cost far more than its characters; numeric columns
default to 64-bit types even when the values would fit in 8 or 16 bits; and the CSV reader itself
holds intermediate buffers on top of the final frame.

That gives three concrete levers. Read only the columns you need, since a wide table usually has a
handful that matter. Specify a dtype mapping instead of letting the reader infer: narrower integer
and float types, and categorical for low-cardinality strings, which stores an integer code per row
plus one copy of each distinct value and often cuts a text column by an order of magnitude. Parse
dates explicitly rather than keeping them as strings.

If it still does not fit, process in chunks. Reading with a chunk size gives an iterator of frames,
and any aggregation that is associative can be computed per chunk and combined at the end, which is
the same bounded-memory pattern as a generator pipeline.

Only when the work genuinely exceeds one machine, or the pipeline needs to scale with data volume
rather than fit a fixed dataset, does a distributed engine earn its overhead. Spark on a single node
is usually slower than tuned pandas.
