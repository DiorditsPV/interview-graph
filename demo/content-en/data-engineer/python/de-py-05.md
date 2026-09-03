---
block: python
difficulty: middle
id: de-py-05
kind: question
tags:
- concurrency
- optimization
title: Threads, processes or asyncio
topic: gil-and-parallelism
weight: 4
---

## Question
A job makes ten thousand HTTP requests, and another one parses ten thousand files of CPU-heavy
text. How do you parallelise each, and what does the GIL have to do with it?

## Answer
The global interpreter lock allows only one thread to execute Python bytecode at a time in a single
interpreter. That makes threads useless for speeding up pure Python computation, because they take
turns rather than running simultaneously, but it does not block concurrency for waiting: the lock is
released around blocking I/O, so while one thread waits on a socket the others run.

So the HTTP job is I/O bound and threads work well, and asyncio works better at that scale. Ten
thousand OS threads is a lot of memory and context switching; ten thousand coroutines on one event
loop is cheap, because concurrency is expressed as awaiting rather than as stacks. The cost of asyncio
is that it is all or nothing within a task: one synchronous blocking call in a coroutine stalls the
entire loop, so the libraries have to cooperate.

The parsing job is CPU bound, so it needs separate processes. Each has its own interpreter and its
own lock and they genuinely run in parallel across cores. The cost is that arguments and results are
pickled and copied between processes, so it pays off for coarse-grained chunks of work and loses on
many tiny ones. The exception worth mentioning is that libraries with C extensions, such as NumPy or
a compiled parser, release the lock internally and can therefore parallelise with threads.
