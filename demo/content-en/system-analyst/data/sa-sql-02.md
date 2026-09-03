---
block: data
difficulty: middle
id: sa-sql-02
kind: question
subblock: sql
tags:
- sql
- quality
title: Checking data before you specify
topic: data-profiling
weight: 4
---

## Question
Before writing a specification against an existing table, what do you check with SQL, and why?

## Answer
The purpose is to replace what the documentation claims with what the data actually contains, because
specifications built on the former fail in acceptance testing.

I start with volume and range: row count, and the minimum and maximum of the date column, which
immediately reveals whether history goes back as far as the report needs and whether the feed has
quietly stopped. Then null rate per column, since a field described as mandatory being forty percent
null changes the design of everything built on it.

Next, uniqueness of the key I intend to join on. Grouping by that key and returning groups with more
than one row is a two-line query and it settles whether the relationship is one-to-one or
one-to-many, which determines whether a join will duplicate rows.

Then the distribution of any column used as a category or a status. Selecting distinct values with
counts reliably turns up undocumented codes, values differing only by case or whitespace, and a
long-obsolete status that still carries volume.

Finally, referential integrity: rows whose foreign key has no match in the referenced table. Orphans
are common, and how they should be treated is a business decision that must be in the specification
rather than left to whoever writes the join.
