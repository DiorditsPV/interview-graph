---
block: requirements
difficulty: junior
id: sa-anal-01
kind: question
subblock: analysis
tags:
- quality
title: What makes a requirement testable
topic: requirement-quality
weight: 3
---

## Question
What separates a good requirement from a bad one? Give the criteria you actually apply when
reviewing.

## Answer
The one criterion that subsumes most others is testability: can someone read this and say
unambiguously whether the built system satisfies it? A requirement that cannot be checked cannot be
accepted or rejected, so it will be argued about at the end of the project instead of at the
beginning.

In review I look for four failures. Ambiguity, meaning words that different readers resolve
differently, such as "quickly", "user-friendly", or "appropriate"; each of them hides a number or a
rule that somebody has to decide, and if the analyst does not, a developer will. Compound
requirements, where one statement contains three obligations joined by "and", which cannot be
partially accepted or estimated. Solution disguised as need, where the requirement prescribes a
dropdown or a specific table rather than the outcome, closing off better implementations. And
unstated behaviour at the edges, which is where most defects live: what happens when the list is
empty, when the external service is down, when two users act at once.

Beyond the individual statement, the set has to be consistent, with no two requirements contradicting
each other, and traceable, so every requirement connects back to a stated business goal. A
requirement nobody can attach to a goal is usually one nobody will miss.
