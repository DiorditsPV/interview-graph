---
block: modeling
difficulty: middle
id: sa-uml-02
kind: question
subblock: uml
tags:
- data-modeling
- architecture
title: Aggregation versus composition
topic: class-relationships
weight: 4
---

## Question
On a class or entity diagram, how do you decide between aggregation and composition, and why does the
distinction have consequences?

## Answer
Both express a whole-part relationship; the difference is lifecycle ownership. In composition the part
cannot exist without the whole and is destroyed with it: an order line has no meaning without its
order, and deleting the order deletes the lines. In aggregation the part exists independently and can
be shared: an employee belongs to a department, but deleting the department must not delete the
person.

The consequence is not decorative, because the choice dictates real behaviour downstream. It decides
whether a delete cascades or is refused, whether the part gets its own identifier and its own
lifecycle in the interface, and whether it can be referenced by more than one parent. Modelling a
shared entity as composition eventually produces the bug where removing one parent destroys data
another parent still uses.

The practical test is to ask what should happen to the part when the whole is deleted, and whether the
same part instance can belong to two wholes at once. If the honest answer is that it should survive,
or that it can be shared, it is aggregation regardless of how tightly coupled the two feel in
conversation.

Cardinality deserves the same rigour. Whether a side is optional is a business rule with direct
consequences for validation and for whether a column can be null, and it is one of the most common
things left unstated in a specification.
