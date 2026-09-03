---
block: databases
difficulty: middle
id: be-nosql-02
kind: question
subblock: nosql
tags:
- consistency
- optimization
title: Cache invalidation and stampedes
topic: caching
weight: 4
---

## Question
You put Redis in front of a slow query. What are the failure modes, and how do you handle
invalidation?

## Answer
The first failure is staleness, and it is a choice rather than a bug. A time-to-live gives eventual
correctness with a bounded window and costs nothing to implement, which is right for data where a few
seconds of lag is harmless. Explicit invalidation on write is precise but must cover every path that
modifies the underlying data, including background jobs and manual fixes, and any path that is missed
serves wrong data indefinitely. Where correctness matters, writing through the cache so the update
and the invalidation happen together is safer than remembering to invalidate in each caller.

The second is the stampede. A popular key expires, and every concurrent request misses simultaneously
and hits the database at once, which is how adding a cache can make an outage worse than having none.
The mitigations are to let only one request recompute while the others wait or serve the previous
value, and to jitter expiry times so keys that were populated together do not expire together.

Third, decide what happens on a cache miss storm or a Redis outage. If the database cannot survive
full traffic, the cache is not an optimisation but a load-bearing dependency, and it needs to be
treated as one.

Finally, do not cache what you have not measured. Caching a query that was fast anyway adds an
invalidation bug for no gain.
