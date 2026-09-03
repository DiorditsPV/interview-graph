---
block: integration
difficulty: senior
id: sa-int-02
kind: question
tags:
- architecture
- quality
title: Evolving an integration contract
topic: api-versioning
weight: 5
---

## Question
An integration contract with an external partner needs a new mandatory field. Six consumers depend on
the current version. How do you manage the change?

## Answer
Start by classifying the change honestly, because that determines everything else. Adding an optional
field, or a new value that consumers can ignore, is backward compatible: existing consumers keep
working untouched. Making a field mandatory, removing one, narrowing a type or changing the meaning of
an existing value is breaking, and the last of those is the most dangerous because it passes every
schema check while silently changing behaviour.

If the field can be optional at first, that is nearly always the better route. Introduce it optional,
let consumers adopt it at their own pace, monitor how many requests actually carry it, and only tighten
the rule once adoption is complete. That converts a coordinated release across seven parties into six
independent ones.

Where it genuinely must be mandatory, both versions run side by side for a defined period. The
specification needs an explicit deprecation timeline with dates, a way to observe who is still on the
old version so the deadline is enforceable, and a decision on what happens to a consumer who misses
it. A cut-off nobody measures is a cut-off that will not happen.

For an external partner, add the contractual dimension: notice period, a test environment available
before the change, and agreement on who bears the cost. And record the change history against the
contract, since the recurring failure is a partner integrating against documentation that no longer
matches production.
