---
block: requirements
difficulty: junior
id: sa-doc-01
kind: question
subblock: documentation
tags:
- quality
title: User stories and acceptance criteria
topic: user-stories
weight: 3
---

## Question
What belongs in a user story versus in its acceptance criteria, and what is the story format
actually for?

## Answer
The story names who wants something and why. Its value is not the template but the fact that it keeps
the user and the purpose attached to the work, which is what lets a team propose a cheaper solution
that serves the same goal. A story that reads "as a system, I want a table" has lost that and is just
a task.

Acceptance criteria say how you will know it is done. They are specific, checkable statements
covering the successful path and, more importantly, the ones people skip: what happens with no data,
with invalid input, with insufficient permissions, when the downstream service is unavailable.
Writing them in a given-when-then shape helps because it forces a starting state, a trigger and an
observable result, which is exactly what a test needs.

The dividing line is that the story holds intent and stays stable, while criteria hold detail and get
refined right up to the start of work. A story is small enough when it can be delivered in one
iteration and still be independently useful; if the criteria list grows past roughly a handful of
scenarios, that is the signal to split, usually by scenario rather than by technical layer, so each
piece delivers something a user can actually do.
