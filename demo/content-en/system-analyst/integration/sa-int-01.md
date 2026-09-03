---
block: integration
difficulty: middle
id: sa-int-01
kind: question
tags:
- architecture
- consistency
title: Direct call or message queue
topic: integration-style
weight: 4
---

## Question
Two services need to exchange data. How does an analyst choose between a synchronous call and a
queue, and what must the specification state either way?

## Answer
The first question is whether the caller needs the answer to continue. If a user is waiting on a price
calculation or an availability check, the call is synchronous by necessity. If the caller only needs
the request to be accepted, such as sending a notification or triggering a downstream recalculation,
a queue is better, because it decouples the two services in time: the sender proceeds regardless of
whether the receiver is up, slow, or being deployed.

The second is what happens when the other side fails. A synchronous integration requires the
specification to define a timeout, how many times to retry and with what spacing, and above all what
the user sees when it ultimately fails. A queue moves that problem to the consumer, with redelivery
handled by the broker and a dead-letter destination for messages that fail repeatedly, but it then
requires someone to own the messages that land there.

The point analysts most often omit is idempotency. Queues deliver at least once, and a synchronous
call that times out leaves the caller genuinely unable to tell whether the operation happened, so both
styles produce repeats. The receiver must therefore be able to recognise a repeated request by a
stable identifier and not apply it twice. Stating that, along with the contract, the delivery
expectation and the degraded behaviour, is what makes the integration specifiable rather than left to
whoever implements it.
