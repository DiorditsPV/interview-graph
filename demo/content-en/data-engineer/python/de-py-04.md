---
block: python
difficulty: junior
id: de-py-04
kind: question
tags:
- quality
- data-modeling
title: Validating data at the boundary
topic: schema-validation
weight: 3
---

## Question
A pipeline reads JSON from an external API. Where do you validate it, and why not just use
dictionaries?

## Answer
Validate once, at the boundary, immediately after parsing and before any business logic sees the
data. The alternative in practice is not validating at all: dictionaries let a missing key or a
string where a number was expected travel deep into the pipeline, and the failure surfaces somewhere
unrelated, often as a confusing error in a transformation ten steps later, or as silently wrong
numbers in a report.

Parsing into a typed model changes the shape of the failure. A validation library checks required
fields, coerces types, applies constraints and raises one clear error naming the offending field
while you still have the raw payload in hand to log or quarantine. From that point on the rest of the
code can rely on the type, so no downstream function needs defensive checks.

The secondary benefit is that the model becomes the written contract with the source. When the API
adds or renames a field, the model is the one place that records what you expected, and a schema
change fails loudly at ingest rather than propagating. Dataclasses are enough when the input is
already trusted, since they give you types and structure without runtime coercion; for untrusted
external input you want the validation as well.
