---
block: data
difficulty: base
id: sa-sql-01
kind: question
subblock: sql
tags:
- sql
title: Inner join versus left join
topic: join-semantics
weight: 2
---

## Question
You join customers to orders and the row count is lower than the number of customers. What happened,
and how would you have avoided it?

## Answer
An inner join keeps only rows that match on both sides, so every customer with no orders disappeared.
That is correct behaviour and frequently the wrong question: "revenue per customer" answered with an
inner join silently excludes exactly the customers you probably care about, and the result looks
plausible, which is what makes it dangerous.

A left join keeps every row from the left table and fills the right side with nulls where there is no
match, so customers without orders survive with a null order. Aggregating then needs care, because
`COUNT(*)` counts those null rows as one while `COUNT(orders.id)` correctly returns zero, and `SUM`
over nulls returns null rather than zero unless you substitute a default.

The other direction is worth checking too. If the row count went up rather than down, the join key is
not unique on the right side, and every duplicate multiplies rows, which quietly inflates any sum
computed afterwards. As an analyst the habit that catches both cases is to count rows before and after
every join and know which number you expected, and to confirm the cardinality of the key rather than
assuming it.
