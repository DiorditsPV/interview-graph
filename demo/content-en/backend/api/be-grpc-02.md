---
block: api
difficulty: senior
id: be-grpc-02
kind: question
subblock: grpc
tags:
- architecture
- quality
title: Evolving a protobuf schema safely
topic: schema-evolution
weight: 5
---

## Question
Services deploy independently, so old and new versions of a message coexist. Which protobuf changes
are safe and which are not?

## Answer
The rule follows from the encoding: fields are identified on the wire by their number, not their
name, and unknown fields are skipped rather than rejected. So adding a new field with a fresh number
is safe in both directions, because an old reader ignores it and a new reader sees the default when
an old writer omits it. Renaming a field is also safe on the wire, though it breaks generated code
and therefore the build.

What is unsafe is anything that changes the meaning of a number. Reusing the number of a deleted
field is the classic production incident: an old service still sending the previous type into that
slot produces silent misinterpretation rather than an error, which is why removed numbers should be
marked reserved so the compiler refuses to reuse them. Changing a field's type is unsafe for the same
reason, apart from a small set of documented compatible pairs. Moving a field into or out of a
`oneof` changes how the message is interpreted, and so does changing cardinality between singular and
repeated.

Two subtler ones matter in practice. Because a missing field and a field set to its zero value are
indistinguishable for scalar types, adding a field whose absence must be distinguished from zero
requires an explicitly optional or wrapped type. And adding an enum value is only safe if every
consumer already handles unknown values, so the default branch has to exist before the value is
introduced, not after.
