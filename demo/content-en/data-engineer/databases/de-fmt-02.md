---
block: databases
difficulty: middle
id: de-fmt-02
kind: question
subblock: formats
tags:
- file-formats
- consistency
title: Table formats over file formats
topic: table-formats
weight: 4
---

## Question
Parquet is already a good file format. What does a table format such as Iceberg or Delta Lake add on
top of it?

## Answer
Parquet describes one file. A table format describes which files make up a table right now, and that
distinction solves the problems a plain directory of Parquet files cannot.

The first is atomicity. In a bare directory, a job that rewrites a partition is visible to readers
halfway through, so a concurrent query sees a mix of old and new files or a partially written one. A
table format keeps an explicit manifest of the files in the current snapshot and swaps that pointer
in a single atomic commit, so a reader sees either the old table or the new one. It also gives
optimistic concurrency between writers instead of last-writer-wins on a directory.

The second is that a snapshot history makes several previously painful operations routine: reading
the table as of an earlier time, rolling back a bad load, and computing which files changed since a
given snapshot for incremental consumption.

Third is schema and partition evolution. Because the manifest maps files to a schema by field id,
columns can be added, renamed or reordered without rewriting data, and the partitioning strategy can
change going forward while old data stays readable. Finally, planning stops requiring directory
listings, since the manifest already holds per-file statistics, which matters a great deal on object
storage where listing is slow.
