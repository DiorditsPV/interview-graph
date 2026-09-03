---
block: python
difficulty: senior
id: de-py-07
kind: question
tags:
- architecture
- quality
title: Designing a testable pipeline
topic: testable-etl
weight: 5
---

## Question
How do you structure a pipeline so its logic can be tested without a cluster, a warehouse or a live
source?

## Answer
Separate the parts that touch the world from the parts that decide things. Reading a source, writing
a target and calling an API are effects; parsing, cleaning, joining and computing are pure functions
of their input. If a transformation takes a frame and returns a frame, it can be tested with a dozen
handcrafted rows in milliseconds, and that test is where all the interesting cases live: nulls,
duplicates, timezone edges, the currency that has three decimal places.

Effects then live in thin adapters at the edges, injected rather than imported inside the logic. The
production job wires a real reader and writer; the test wires an in-memory one. The point is not
mocking for its own sake, it is that the wiring becomes a decision made in one place instead of being
hard-coded halfway down a call stack.

Above unit tests, run the real pipeline over a small fixed dataset with known expected output as an
integration test. That is what catches the things unit tests structurally cannot: schema mismatches,
engine-specific null semantics, and configuration that is wrong everywhere except in the test
harness.

Finally, treat data quality checks as part of the pipeline rather than as tests. Row counts,
freshness, uniqueness of keys and referential integrity are assertions about production data and must
run on every execution, because they fail for reasons that have nothing to do with your code
changing.
