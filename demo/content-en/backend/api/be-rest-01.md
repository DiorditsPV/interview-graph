---
block: api
difficulty: base
id: be-rest-01
kind: question
subblock: rest
tags:
- architecture
title: Idempotent HTTP methods
topic: http-semantics
weight: 2
---

## Question
Which HTTP methods are idempotent, why does it matter, and how do you make a `POST` safe to retry?

## Answer
`GET`, `PUT` and `DELETE` are idempotent: sending the same request twice leaves the server in the
same state as sending it once. `PUT` replaces a resource with the body you supply, so repeating it
lands on the same result; `DELETE` removes it, and a second call finds nothing left to remove. `POST`
is not idempotent, because it is defined as creating a new subordinate resource, so two calls create
two things.

This matters because retries are unavoidable. A client that times out genuinely cannot distinguish a
request that never arrived from one that succeeded with a lost response, so it must retry, and for an
idempotent method that is free. For `POST` it duplicates the order.

The standard fix is an idempotency key: the client generates a unique identifier per logical
operation and sends it as a header. The server records the key with the result of the first
successful call; a repeat with the same key returns the stored result instead of executing again.
Payment APIs work exactly this way.

Related and often confused: safe methods, meaning `GET` and `HEAD`, additionally promise not to
modify anything, which is why they can be cached and prefetched. A `GET` with side effects breaks
assumptions all over the stack.
