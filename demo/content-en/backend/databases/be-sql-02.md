---
block: databases
difficulty: senior
id: be-sql-02
kind: question
subblock: sql
tags:
- consistency
- concurrency
title: Isolation levels and lost updates
topic: transaction-isolation
weight: 5
---

## Question
Two requests read a balance, each subtracts an amount, and both write it back. One deduction
disappears. Which isolation level prevents this, and what would you actually do?

## Answer
This is a lost update, and raising the isolation level is only part of the answer. Read committed,
the common default, prevents reading uncommitted data but does nothing here, because both
transactions read a legitimately committed value before either writes. Repeatable read stops the
value changing under you within a transaction, and in implementations using snapshot isolation the
second writer fails on commit with a serialisation conflict rather than silently overwriting, which
converts the corruption into an error you can retry. Serialisable is stronger still and also rules
out phantom rows and write skew, at the cost of more aborts or more blocking depending on the engine.

In practice I would not rely on the global level alone, because it is easy for one code path to run
under a different one. Two explicit approaches work. Pessimistic locking selects the row for update,
which blocks the second transaction until the first commits; simple and correct, at the cost of
holding a lock for the duration. Optimistic locking adds a version column and makes the update
conditional on the version still matching, so a losing writer updates zero rows and retries. That
scales better under low contention and is the right default when the read and the write are separated
by a user thinking.

Best of all, where the operation allows it, is not reading first: an atomic update that decrements
the column in the database has no window to lose.
