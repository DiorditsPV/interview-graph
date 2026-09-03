---
block: platform
difficulty: base
id: de-plat-01
kind: question
tags:
- deployment
title: Why containerise a job
topic: containers
weight: 2
---

## Question
Why package a batch job as a container image instead of installing its dependencies on the machine
that runs it?

## Answer
Because the image pins the entire runtime, not just your code. The Python version, the libraries and
their exact versions, the system packages a driver needs, the environment variables and the entry
point are all captured in one artifact, so the job that passed in staging is byte for byte the job
that runs in production. The failure this eliminates is the classic one where two jobs on the same
host need incompatible versions of the same library, or where a host is quietly upgraded and a job
that has not changed starts behaving differently.

It also makes deployment a matter of moving one immutable, versioned thing. Rolling back is
re-running the previous tag rather than reversing a sequence of installation steps, and the same
image runs locally, in continuous integration and on the cluster, so a developer can reproduce a
production failure on a laptop.

The trade-offs are real but modest: images have to be built, stored and kept current with security
patches, and a stale base image is now your problem rather than the platform team's. For anything
that runs on a schedule and matters when it breaks, that cost is much smaller than the cost of an
environment nobody can reproduce.
