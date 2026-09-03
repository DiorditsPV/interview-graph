---
block: platform
difficulty: junior
id: de-plat-02
kind: question
tags:
- deployment
- quality
title: CI for a data pipeline
topic: pipeline-ci
weight: 3
---

## Question
What should run in continuous integration for a repository of pipelines, given that the real data is
not available there?

## Answer
Start with the checks that need no data at all, because they catch the majority of breakages
cheaply: linting and formatting, type checking, and for an orchestrator, importing every pipeline
definition. That last one matters more than it sounds. A syntax error or a bad import in a DAG file
is not caught by any test, and in production it surfaces as a pipeline that silently stops appearing
in the scheduler. Parsing every definition and asserting there are no import errors turns that into a
failed build.

Then unit tests over the pure transformation functions with small handmade fixtures, which is what
the pipeline should have been structured to allow.

Then an integration run against an ephemeral target: a container with a real database, or a temporary
schema in a development warehouse, loaded with a small fixed dataset and asserted against a known
expected output. This is the layer that catches SQL that is valid but wrong, and schema drift.

Two things are worth adding once the basics hold. Validate configuration and connection definitions,
since a typo there fails at three in the morning rather than at build time. And check migrations
apply cleanly against a copy of the current production schema, because a migration that works on an
empty database and not on a populated one is a common and expensive surprise.
