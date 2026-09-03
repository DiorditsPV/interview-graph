---
block: requirements
difficulty: base
id: sa-elic-01
kind: question
subblock: elicitation
tags:
- domain
title: Running a requirements interview
topic: stakeholder-interview
weight: 2
---

## Question
A stakeholder says "we need a report on orders". How do you turn that into something a team can
build?

## Answer
Treat the sentence as a symptom, not a requirement. The first question is who will use the report and
what decision they will make with it, because a report that nobody acts on is a request that will be
abandoned after release. Asking what happens today, and what goes wrong with it, usually surfaces the
real problem faster than asking what they want.

From there the specifics follow: which orders, over what period, at what granularity, refreshed how
often, and what "order" even means at this company, since it is exactly the kind of word two
departments define differently. Ask what they do with the answer once they have it, because that
often reveals the report is a step toward an action that could be automated instead.

Two techniques help. Ask open questions first and closed ones only to confirm, so you do not lead the
answer. And restate what you heard in your own words and let them correct you; misunderstandings
surface far more reliably when someone hears their intent paraphrased than when they are asked
whether they agree.

Finally establish how you will know it worked. If nobody can name a measurable outcome, the scope has
no natural boundary and will keep growing.
