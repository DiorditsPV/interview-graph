---
block: modeling
difficulty: middle
id: sa-proc-02
kind: question
subblock: process
tags:
- domain
- quality
title: Modelling as-is before to-be
topic: process-analysis
weight: 4
---

## Question
Why bother diagramming the current process if you are about to replace it?

## Answer
Because the current process encodes constraints nobody will tell you about. Almost every long-lived
process contains steps that look absurd until you learn they exist for a regulatory check, a
downstream system's limitation, or a failure that happened once and was expensive. Designing the
target state without that map produces a design that is elegant, and then has three exceptions bolted
onto it during implementation.

Modelling as-is also gives you the baseline to argue with. If you cannot say the current process takes
eleven days with four handovers and a twelve percent rework rate, you cannot demonstrate that the new
one is better, and you cannot tell which step was actually the bottleneck. Teams routinely optimise
the visible step rather than the constraining one.

It surfaces disagreement early, too. Walking a diagram through two departments reliably reveals that
they believe different things happen, which is far cheaper to discover in a workshop than in
acceptance testing.

The trap is over-investing. As-is modelling is for understanding, not for archiving, so it should
cover the main flow and the exceptions that carry real volume or real risk, and stop there. If the
process is being discarded wholesale rather than improved, a shallower model that captures the
constraints and the numbers is enough.
