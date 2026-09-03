---
block: databases
difficulty: middle
id: be-nosql-01
kind: question
subblock: nosql
tags:
- data-modeling
- storage
title: When a document store fits
topic: document-modeling
weight: 4
---

## Question
When does a document database genuinely beat a relational one, and what do you give up?

## Answer
It fits when the data is naturally a self-contained document that is read and written as a whole, and
when the shape varies between instances. A product catalogue where every category has different
attributes, or an event payload whose fields depend on its type, is awkward to normalise: you end up
with either a very wide sparse table or an attribute-value table that is painful to query. Storing
the document as it is keeps one read per entity with no joins, and lets the schema differ per record
without a migration.

What you give up is mostly the guarantees relational systems make for you. Referential integrity is
not enforced, so a reference to a deleted entity is application logic's problem. Data duplicated
across documents must be updated in every copy, and the moment that update spans documents you are
managing consistency yourself, since transactional scope across documents is limited or expensive
depending on the engine. Ad hoc queries that were not anticipated in the document shape are hard,
because you modelled for known access patterns rather than for arbitrary joins.

The failure mode to avoid is choosing a document store for highly relational data with the intention
of joining it in application code, which reimplements a query planner badly. If the entities have
many-to-many relationships that get queried from both directions, relational is still the right
answer.
