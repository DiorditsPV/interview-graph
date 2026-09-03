---
block: modeling
difficulty: junior
id: sa-uml-01
kind: question
subblock: uml
tags:
- architecture
title: When a sequence diagram helps
topic: sequence-diagram
weight: 3
---

## Question
You have a process diagram already. What does a sequence diagram add, and when is it the wrong tool?

## Answer
A process diagram answers what happens and who is responsible. A sequence diagram answers who calls
whom, in what order, with what data, and what comes back. It makes the interaction between systems
explicit over time, which is exactly the level at which integration defects live.

That makes it the right tool for a specific job: designing or reviewing an interaction that crosses
system boundaries. Laying out the calls reveals things a process diagram hides, such as a step that
requires two round trips to an external provider, a synchronous call in the middle of a
user-facing flow, or a piece of data that the third participant needs but nobody passes to it.
Alternative and loop fragments let it show the failure branches, and it is worth drawing the timeout
and error paths rather than only the successful one, because those paths are where the specification
is usually silent.

It is the wrong tool for the overall business flow, where it becomes an unreadable wall of arrows,
and for anything with many independent branches, which a process model expresses better. It is also
wrong as documentation of everything: sequence diagrams age quickly because they describe
implementation-level calls, so draw them for the interactions that are genuinely complex or contested,
and let the rest live as an interface contract.
