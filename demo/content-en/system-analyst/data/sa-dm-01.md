---
block: data
difficulty: middle
id: sa-dm-01
kind: question
subblock: data-model
tags:
- data-modeling
title: Normalisation and when to break it
topic: normalisation
weight: 4
---

## Question
Explain third normal form in terms a stakeholder would accept, and when you would deliberately
denormalise.

## Answer
The plain-language version is that every fact is stored exactly once, in the table it belongs to.
Customer address lives with the customer, not copied onto every order. The reason is not tidiness, it
is that duplicated facts drift: update the address in one of the four places it exists and the data
now contradicts itself, with no way to tell which copy is right. Normalisation makes that class of
inconsistency structurally impossible rather than something a process has to prevent.

The cost is joins. A normalised model spreads one business concept across several tables, so reading
it requires assembling the pieces, and on large volumes that is expensive.

There are two legitimate reasons to denormalise. One is performance for read-heavy analytical
workloads, which is why warehouse models flatten dimensions deliberately and accept the redundancy in
exchange for simpler and faster queries. The other, and it is a different thing entirely, is
historical accuracy: an order line stores the price at the time of sale not as a duplicate of the
product price, but because it is a distinct fact that must not change when the catalogue does.

That second case is the one analysts most often get wrong, and it is worth naming explicitly in a
specification, because a developer looking only at the model will normalise it away.
