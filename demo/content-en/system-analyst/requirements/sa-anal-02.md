---
block: requirements
difficulty: middle
id: sa-anal-02
kind: question
subblock: analysis
tags:
- domain
- quality
title: Prioritising a contested backlog
topic: prioritisation
weight: 4
---

## Question
Three departments each insist their requirement is top priority and the release fits only one. How do
you resolve it?

## Answer
The mistake is trying to arbitrate on importance, because everyone is sincerely right about their own
area, and an analyst has no standing to rank departments. The job is to convert opinion into
comparable evidence and put the decision where it belongs.

Comparable evidence means the same axes for each item: the value if it ships, expressed in whatever
the business measures, the number of people or transactions affected, the cost of not doing it now,
and an estimate of effort from the team rather than from the requester. A simple frame such as
MoSCoW is useful for communicating a decision but weak for making one, because everything arrives
labelled "must"; a scoring approach that divides value by effort at least forces the trade-off to be
explicit.

Two questions usually collapse the deadlock. What happens if this waits one release, in concrete
terms rather than "it is critical"? And is there a smaller version that captures most of the value,
since a manual workaround for a rare case often removes eighty percent of the work.

Then the decision goes to a single accountable owner, with the trade-off written down. The analyst's
deliverable is the comparison and its assumptions, not the verdict. Recording what was deferred and
why is what stops the same argument repeating next quarter.
