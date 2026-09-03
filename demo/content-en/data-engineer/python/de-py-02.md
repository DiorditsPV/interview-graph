---
block: python
difficulty: base
id: de-py-02
kind: question
tags:
- quality
title: Mutable default arguments
topic: default-arguments
weight: 2
---

## Question
Why does a function with `def add(item, target=[])` accumulate values across calls?

## Answer
Because the default value is evaluated once, when the `def` statement runs, not on every call. That
single list object is stored on the function and reused by every call that does not pass the
argument, so anything appended to it persists into the next call. The same applies to dictionaries,
sets, and any other mutable default, including one built from a function call such as a timestamp,
which will be frozen at import time rather than computed per call.

The fix is the standard idiom of defaulting to `None` and creating the object inside the function,
which gives each call its own fresh object:

```python
def add(item, target=None):
    if target is None:
        target = []
    target.append(item)
    return target
```

This is a small bug with an outsized reputation because it teaches the underlying rule: Python
evaluates default expressions at definition time, and names bind to objects rather than copying them.
The same rule explains why mutating a list passed into a function is visible to the caller, and why
a shallow copy of a nested structure still shares its inner objects.
