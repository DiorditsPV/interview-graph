---
block: frameworks
difficulty: senior
id: de-stream-03
kind: question
subblock: streaming
tags:
- streaming
- consistency
- architecture
title: Event time and late data
topic: watermarks
weight: 5
---

## Question
You aggregate events into one-minute windows. Some events arrive minutes after they happened. How
do you design the windowing, and what does the watermark actually decide?

## Answer
First separate the two clocks. Processing time is when your job saw the event; event time is when it
occurred. Windowing on processing time is trivial and wrong for anything analytical, because a
network hiccup or a consumer restart silently moves events into the wrong bucket and the same input
replayed later produces a different answer. Windowing on event time gives a result that is
reproducible, at the cost of having to decide how long to wait.

That decision is the watermark. A watermark is the engine's assertion that no event older than a
given event time is still expected, and it is what allows a window to be closed and emitted. Set it
too tight and you emit fast but drop a tail of legitimate late events; set it too loose and every
window holds state longer, which is memory you pay for continuously. The right value comes from
measuring the observed lag distribution, not from a guess.

For events later than the watermark you need an explicit policy, and all three options are
defensible: drop them and monitor the rate, route them to a side output for reconciliation, or allow
the window to emit an update and require downstream consumers to handle retraction. What is not
defensible is leaving it unspecified, because the default is silent loss.
