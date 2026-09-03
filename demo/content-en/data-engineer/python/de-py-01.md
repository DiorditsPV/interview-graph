---
block: python
difficulty: base
id: de-py-01
kind: question
tags:
- memory
title: Generators versus lists
topic: lazy-iteration
weight: 2
---

## Question
What is the difference between a list comprehension and a generator expression, and when does it
matter?

## Answer
A list comprehension builds the whole result in memory immediately. A generator expression produces
values one at a time, computing each only when it is requested, and holds nothing but its own state
between yields. For a thousand items the difference is irrelevant. For a file with a hundred million
lines it is the difference between a job that runs in constant memory and one that is killed by the
operating system.

The mechanics are worth stating plainly: a generator is an iterator, so it can be consumed exactly
once and it has no length and no indexing. If you need to iterate twice, or need random access, you
need the list, and reaching for a generator there just means converting it back and paying the memory
anyway.

The natural use is pipelines over data that does not fit in memory. Reading a file, parsing each
line, filtering, and writing out can be composed as a chain of generators where each element flows
through the whole chain before the next one is read, so peak memory stays flat regardless of input
size. That pattern is the reason generators come up in almost every data engineering interview.
