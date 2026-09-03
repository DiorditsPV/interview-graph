---
block: api
difficulty: junior
id: be-grpc-01
kind: question
subblock: grpc
tags:
- architecture
title: Choosing gRPC over REST
topic: rpc-tradeoffs
weight: 3
---

## Question
When would you pick gRPC for a service, and when is REST over JSON still the better default?

## Answer
gRPC's advantages come from the contract being a compiled schema. The service and its messages are
defined in a proto file, and both client and server are generated from it, so a field that does not
exist is a compile error rather than a runtime surprise. On the wire the encoding is binary and
considerably more compact than JSON, and it runs over HTTP/2, which means many concurrent calls
multiplexed on one connection without the head-of-line blocking of sequential requests. It also
supports streaming in either or both directions, which REST does not express naturally.

That makes it a strong default for internal service-to-service traffic, especially where calls are
frequent, latency-sensitive, or polyglot across teams, because the generated clients remove a whole
category of integration mistakes.

REST over JSON stays better at the edge. It is readable in a browser and a log, debuggable with
curl, cacheable by ordinary infrastructure, and supported by every proxy, gateway and client library
without special configuration. Browsers cannot speak gRPC directly without a proxy layer, and
public APIs consumed by third parties benefit far more from being trivially explorable than from
saving bytes.

The honest summary is gRPC inside the system, REST at its boundary, unless a specific constraint
argues otherwise.
