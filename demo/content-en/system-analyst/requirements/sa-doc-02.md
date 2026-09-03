---
block: requirements
difficulty: senior
id: sa-doc-02
kind: question
subblock: documentation
tags:
- architecture
- quality
title: Specifications that survive handover
topic: traceability
weight: 5
---

## Question
A year after release, nobody can tell why a rule works the way it does, and the specification is
outdated. How do you write documentation that stays useful?

## Answer
Accept first that any document duplicating what the code does will rot, because the code is changed
under pressure and the document is not. So the goal is not completeness, it is keeping the things
that are genuinely not recoverable from the system itself.

What is not recoverable is intent. Code shows that orders over a threshold need a second approval; it
cannot show that the threshold came from a regulatory limit, that it is expected to change annually,
and that two alternatives were rejected for stated reasons. That is the material worth writing down,
and it is what decision records exist for: context, options considered, choice, consequences, dated
and immutable. They stay accurate because they describe a moment rather than a current state.

Second is traceability. Each requirement links to the business goal above it and to the tests and
components below it, so when someone proposes a change the blast radius is visible and orphaned rules
become identifiable. Without it, nobody can safely delete anything, which is how systems accumulate
rules that serve no one.

Third, keep a single owned glossary. Most long-lived ambiguity is one term meaning two things in two
departments.

Finally, put the volatile detail where it is executed, as acceptance criteria and tests, and keep the
narrative document short enough that updating it stays plausible.
