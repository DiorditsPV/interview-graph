---
block: ops
difficulty: junior
id: be-ops-01
kind: question
tags:
- deployment
- monitoring
title: Health checks and graceful shutdown
topic: deployment-lifecycle
weight: 3
---

## Question
Every deploy drops a handful of requests even though the rollout is gradual. What is missing?

## Answer
Two things, and they are the mirror image of each other at the start and end of a container's life.

At startup, the orchestrator will route traffic as soon as the container reports ready, so a single
health endpoint that returns success the moment the process starts sends requests to a service that
has not yet connected to its database or warmed its caches. The distinction that fixes this is
between liveness, meaning the process is not wedged and should not be restarted, and readiness,
meaning it can serve traffic right now. Readiness should reflect the dependencies the service
actually needs, and it should be able to go false again temporarily without the container being
killed, which is exactly what liveness would do.

At shutdown, the container receives a termination signal and, by default, most runtimes exit
immediately, abandoning in-flight requests. Graceful shutdown means catching the signal, marking
readiness false so no new requests are routed, then finishing the requests already in progress before
exiting, within the grace period the platform allows.

There is one subtlety that catches people even after both are implemented: removal from the load
balancer is not instantaneous, so a service that stops accepting connections the instant it is
signalled still drops requests already in flight toward it. A short delay after failing readiness,
before closing the listener, covers that window.
