---
block: platform
difficulty: middle
id: de-plat-03
kind: question
tags:
- monitoring
- quality
title: Monitoring beyond job success
topic: pipeline-observability
weight: 4
---

## Question
Your pipelines all report success, and a stakeholder tells you the numbers are wrong. What should
you have been monitoring?

## Answer
A green run only proves the code did not raise. It says nothing about whether the data was right, and
the expensive incidents are almost always in that gap.

Freshness is the first missing signal. If a table's newest row is older than its promised interval,
something upstream stopped, and that can happen while every job in your orchestrator succeeds because
it correctly processed the zero rows it was given. Alert on the age of the data, not on the status of
the task.

Volume is the second. Track rows written per run and alert on deviation from the recent norm in both
directions. A partition that suddenly has one tenth of its usual rows is a partial upstream load; ten
times its usual rows is a duplicated feed. Both are invisible to a success check.

Then distribution and constraints: null rate per important column, uniqueness of keys, referential
integrity against dimensions, and share of values falling outside an expected range. These catch
upstream schema changes, which usually manifest as a column that quietly becomes all nulls rather
than as an error.

Finally, measure end-to-end latency from source event to availability in the serving layer, since
that is the number the stakeholder actually experiences, and it degrades gradually in a way no
individual task duration reveals.
