---
block: runtime
difficulty: middle
id: be-run-02
kind: question
tags:
- concurrency
- quality
title: Preventing a double booking
topic: race-conditions
weight: 4
---

## Question
Your booking endpoint checks whether a seat is free and then reserves it. Under load, the same seat is
sometimes booked twice. Walk through the fix.

## Answer
The bug is the gap between the check and the act. Two requests both read "free", both conclude they
may proceed, and both write. Nothing is wrong with either request in isolation; the invariant lives
across them, and no amount of validation inside a single request can enforce it.

Retrying or adding a second check does not help, because the same window exists between the new check
and the write. The fix has to make the check and the write a single atomic step, and there are three
practical ways.

The strongest and simplest is a database constraint: a unique index on seat and event means the second
insert fails outright, and the endpoint turns that violation into a friendly response. This is the
option I would reach for first, because it holds regardless of how many application instances run or
what code path is involved.

Second, a conditional write. Update the seat row to booked only where it is still free, and check the
number of affected rows; zero means someone else won. One statement, no separate read, no window.

Third, pessimistic locking, selecting the row for update inside a transaction so the second request
blocks. It works and is sometimes necessary when several rows must be reserved together, but it holds
locks under load and needs care about lock ordering to avoid deadlocks.

A distributed lock in Redis is the weakest option, because correctness then depends on timeouts.
