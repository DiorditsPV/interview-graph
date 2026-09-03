---
block: platform
difficulty: senior
id: de-plat-04
kind: question
tags:
- architecture
- domain
title: Central platform or domain ownership
topic: data-ownership
weight: 5
---

## Question
One central data team owns every pipeline, and the backlog is six months long. What are the options,
and what does decentralising actually cost?

## Answer
The bottleneck is structural, not a staffing problem. A central team owns pipelines for domains it
does not understand, so every change needs a conversation with the domain expert, and the team
becomes a queue in front of everyone else's work. Adding people lengthens the queue more slowly; it
does not remove it.

The decentralised answer is to move ownership of a dataset to the team that owns the system
producing it. They know the semantics, they know when the meaning of a field changes, and they can
ship without coordinating. The dataset becomes a product with an owner, a documented schema, a stated
freshness and quality guarantee, and a contract that does not break silently.

The cost is what people underestimate. Decentralising without a shared platform produces eight teams
each inventing their own ingestion, scheduling, lineage and quality tooling, at wildly varying
quality, and consumers now have eight conventions to learn. It only works if the central team stops
building pipelines and instead builds the paved road that domain teams use, plus the federated
governance that keeps identifiers, definitions and access control consistent across domains.

It also needs the domain teams to have real data engineering capability, which is often the actual
blocker. Where that is missing, a more honest intermediate step is embedding engineers into domains
while keeping shared infrastructure central.
