---
block: databases
difficulty: senior
id: de-storage-02
kind: question
subblock: storage
tags:
- architecture
- storage
- quality
title: Layering a lakehouse
topic: lake-layering
weight: 5
---

## Question
Why split a lake into raw, cleaned and serving layers instead of transforming data once on ingest?

## Answer
Because the layers have different contracts and different failure modes. The raw layer stores what
the source actually sent, unmodified, append-only, partitioned by arrival. Its only job is to make
reprocessing possible. When a transformation turns out to be wrong six months later, or a new
requirement needs a field that was previously discarded, the raw layer is the difference between
rebuilding from history and losing that history permanently. Transforming on ingest destroys exactly
the evidence you need when something is wrong.

The cleaned layer is where schema is enforced, types are normalised, duplicates are resolved and
quality checks run. It is the first layer anyone should build on, and its contract is that consumers
do not need to know the quirks of the source system.

The serving layer is modelled for consumption: aggregates, denormalised marts, whatever the query
patterns actually need, often in a different engine. It is intentionally disposable, because it can
always be rebuilt from the cleaned layer.

The cost is real: more storage, more pipeline steps, higher latency end to end. It is worth paying
because it makes every stage independently rebuildable and puts a clear boundary on where each kind
of bug can live. What makes it work in practice is retention and compaction policies per layer,
since raw data grows without bound if nobody decides how long it stays.
