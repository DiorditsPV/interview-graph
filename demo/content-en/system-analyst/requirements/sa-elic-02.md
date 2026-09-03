---
block: requirements
difficulty: middle
id: sa-elic-02
kind: question
subblock: elicitation
tags:
- domain
- quality
title: Eliciting non-functional requirements
topic: nfr-elicitation
weight: 4
---

## Question
Nobody ever asks for performance or availability up front, but everyone notices when they are
missing. How do you get real numbers?

## Answer
Do not ask "how fast should it be", because the answer is always "fast". Ask questions whose answers
are facts rather than preferences: how many users are working at peak, how many records a typical
search returns, what the busiest hour of the month looks like, what the business loses per hour if
the service is unavailable. Numbers extracted from the existing process are far more reliable than
numbers invented for a new one.

Anchoring on consequences works better than anchoring on targets. "What do users do today if this
screen takes ten seconds" produces a usable answer; often they tolerate it, and sometimes they have
built a workaround that reveals the actual constraint. Similarly, "what breaks if this is down for
four hours on a Sunday night" separates the systems that genuinely need high availability from those
where the requirement was aspirational.

Then write each one so it can be tested: a percentile rather than an average, a specific load, a
defined measurement point. "Ninety-five percent of searches return within two seconds at two hundred
concurrent users" is verifiable; "the system should be responsive" is not.

Finally, name the cost. Availability, latency and retention targets all have a price, and stakeholders
choose sensibly once they see it. Left unpriced, everything is critical.
