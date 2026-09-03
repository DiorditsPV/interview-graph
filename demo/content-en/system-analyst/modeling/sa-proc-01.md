---
block: modeling
difficulty: base
id: sa-proc-01
kind: question
subblock: process
tags:
- domain
title: Reading a BPMN diagram
topic: bpmn-basics
weight: 2
---

## Question
What do pools, lanes and gateways mean in BPMN, and why does the difference between an exclusive and
a parallel gateway matter?

## Answer
A pool is a participant in the process, typically an organisation or a system that owns its own flow.
Lanes divide a pool into roles or departments, so a task's lane answers who performs it. The practical
rule is that sequence flow connects activities inside a pool, while communication between pools is
message flow, which is what makes handovers between organisations visible rather than implied.

Gateways control branching. An exclusive gateway takes exactly one outgoing path, chosen by a
condition, so it models a decision. A parallel gateway takes all outgoing paths at once, so it models
work happening simultaneously. Confusing them changes the meaning entirely: an exclusive gateway where
work is genuinely concurrent hides the fact that two teams act in parallel and misleads anyone
estimating duration, while a parallel gateway where only one path should run implies work that will
never happen. An inclusive gateway sits between them, taking every path whose condition is true.

Two details separate a correct diagram from a decorative one. Every path that a gateway splits must
eventually converge at a matching gateway, or the process has flows that never complete. And every
exclusive gateway needs a default path, because a case that matches no condition otherwise gets stuck
with no defined behaviour.
