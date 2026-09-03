---
block: data
difficulty: senior
id: sa-dm-02
kind: question
subblock: data-model
tags:
- data-modeling
- consistency
title: Modelling data that changes
topic: historical-data
weight: 5
---

## Question
A report run today for last quarter gives different numbers than when it was run last quarter,
although no transaction changed. Why, and how should the model have handled it?

## Answer
Because a reference attribute was overwritten. A customer moved to a different region, or a product
was reassigned to another category, and the model stores only the current value. Every historical
transaction is therefore reported under today's classification, so last quarter's regional split
changes retroactively. Nothing is corrupt; the model simply has no memory.

The fix is to decide, per attribute, whether history matters, and this is a business question rather
than a technical one. Some attributes genuinely should be current everywhere, such as a corrected
spelling of a name. Others must be preserved as of the moment of the event, and for those you keep
versioned rows with validity periods, so each transaction joins to the version that was in force at
its own date rather than to the latest one.

The important part for a specification is stating which behaviour applies where, because both are
defensible and the difference is invisible until someone notices numbers moving. It also has to state
which date drives the join, since the date a sale occurred, the date it was recorded and the date it
was corrected are three different things and reports disagree depending on which is used.

The other half is auditability: knowing what changed, when, and who changed it, which versioned rows
give you and an overwrite destroys permanently.
