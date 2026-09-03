---
block: frameworks
difficulty: base
id: de-stream-01
kind: question
subblock: streaming
tags:
- streaming
- distributed
title: Topics, partitions, consumer groups
topic: kafka-basics
weight: 2
---

## Question
Explain how topics, partitions and consumer groups relate in Kafka, and what limits how fast a
consumer can go.

## Answer
A topic is a named stream, and it is split into partitions. A partition is the unit of both storage
and ordering: messages within one partition are strictly ordered and each consumer reads them
sequentially by offset, but there is no ordering guarantee across partitions. Which partition a
message lands in comes from its key, so all events sharing a key stay in order relative to each
other, which is what lets per-entity processing be correct.

A consumer group is a set of consumers that share the work of one topic. Kafka assigns each
partition to exactly one consumer in the group, so messages are processed once per group rather than
once per consumer, and different groups reading the same topic each get the full stream
independently.

That assignment is also the throughput ceiling. Because a partition goes to a single consumer within
a group, adding consumers beyond the partition count gains nothing, and the extra ones sit idle.
Scaling a consumer group therefore means planning partition count up front, since raising it later
changes how existing keys map to partitions.
