---
block: databases
difficulty: base
id: de-fmt-01
kind: question
subblock: formats
tags:
- file-formats
- storage
title: Why Parquet beats CSV
topic: columnar-formats
weight: 2
---

## Question
What does Parquet give you that CSV does not?

## Answer
Three things, and they compound. Parquet is columnar, so a query reading four columns out of a
hundred reads only those four; a CSV reader must parse every byte of every row to find the columns it
wants. On wide tables that alone is a large multiple in bytes read.

Parquet also carries a schema. Column names and types live in the file footer, so a reader knows that
a field is a 64-bit integer or a timestamp without inferring it. CSV has no types at all, which means
every consumer re-guesses, and they eventually disagree: leading zeros become numbers, dates parse in
the wrong locale, an empty field is sometimes null and sometimes an empty string.

Third, Parquet compresses well and stores statistics per row group. Because a column holds
homogeneous values, encodings such as dictionary and run-length work far better than general
compression over mixed rows, and files are typically several times smaller. The footer statistics
record the minimum and maximum of each column per row group, so a reader can skip whole row groups
that cannot match a predicate.

CSV keeps one advantage worth naming: it is human-readable and universally supported, which makes it
fine for small interchange and bad for anything you will query repeatedly.
