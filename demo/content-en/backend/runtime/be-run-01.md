---
block: runtime
difficulty: base
id: be-run-01
kind: question
tags:
- concurrency
- memory
title: Processes versus threads
topic: process-model
weight: 2
---

## Question
What is the practical difference between a process and a thread, and why does it change how you write
code?

## Answer
A process owns its own memory space; threads live inside a process and share it. Everything else
follows from that. Creating a process is more expensive, and communication between processes has to
go through an explicit channel such as a socket, a pipe or shared storage, because neither can read
the other's memory. Threads are cheap to create and can pass data by simply referring to the same
object.

That sharing is the whole trade-off. Because threads share memory, two of them touching the same
variable without coordination produces a race, where the outcome depends on timing and the bug
reproduces once a week in production and never on a laptop. Anything mutable that more than one
thread can reach needs a lock, an atomic operation, or a design that avoids sharing altogether, and
"seems to work" is not evidence of correctness here.

Isolation is the corresponding benefit of processes. A thread that corrupts memory or crashes the
runtime takes every other thread with it, whereas a process that dies leaves its siblings running,
which is why many servers use several worker processes rather than one process with many threads.

The practical guidance is to prefer not sharing state at all, then immutable shared state, and only
then explicit synchronisation.
