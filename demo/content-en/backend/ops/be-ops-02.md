---
block: ops
difficulty: senior
id: be-ops-02
kind: question
tags:
- monitoring
- architecture
title: Debugging a slow request path
topic: observability
weight: 5
---

## Question
Users report that checkout is sometimes slow, but every service dashboard looks healthy. How do you
find the problem?

## Answer
The dashboards look healthy because they show averages, and "sometimes slow" is a tail. An average
response time of eighty milliseconds is entirely compatible with one request in fifty taking four
seconds. So the first change is to look at percentiles, and specifically the high ones, per endpoint.
If the ninety-ninth percentile is bad while the median is fine, you are looking for something that
affects a subset of requests: a cache miss path, a particular customer with far more data, lock
contention, or garbage collection pauses.

The second problem is that per-service metrics cannot see across a call chain. Checkout touches
several services, and each may be individually within its budget while the sum is not. Distributed
tracing is what resolves that: a trace id propagated through every call lets you see one slow request
broken down by span and identify which hop consumed the time. It also reveals structural problems no
single service can see, most commonly a loop issuing one call per item where a batch call was
intended.

Then correlate. Logs carrying the same trace id turn "which log line belongs to this slow request"
into a query. Compare slow traces against fast ones for the same endpoint rather than reading them in
isolation, since the difference between the two is the answer.

Finally, define what "slow" means as a stated objective, so this is measured continuously instead of
investigated after complaints.
