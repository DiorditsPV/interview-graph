---
block: python
difficulty: junior
id: de-py-03
kind: task
rubric:
- removes the list materialisation and iterates the reader lazily
- keeps the file handle managed by a context manager instead of leaking it
- explains that memory now scales with the number of distinct countries, not with
  rows
- handles malformed rows explicitly rather than letting one bad line kill the job
starterCode: "import csv\n\ndef revenue_by_country(path):\n    rows = list(csv.DictReader(open(path)))\n
  \   totals = {}\n    for row in rows:\n        totals[row[\"country\"]] = totals.get(row[\"country\"],
  0) + float(row[\"amount\"])\n    return totals\n\n# The file is 80 GB. This process
  is killed by the OOM killer.\n# Rewrite it, and say what else you would change before
  shipping.\n"
tags:
- memory
- quality
title: Aggregate an oversized CSV
topic: streaming-aggregation
weight: 3
---

## Task
Rewrite `revenue_by_country` from `starterCode` so it processes an 80 GB file in bounded memory, and
name the remaining problems you would fix before running this in production.

## Solution
The only structural problem is `list(...)`, which pulls every parsed row into memory before any
aggregation happens. The reader is already lazy, so dropping the list is most of the fix. The open
file also needs a context manager, and reading with an explicit encoding avoids surprises on a
machine with a different default:

```python
import csv
from collections import defaultdict

def revenue_by_country(path):
    totals = defaultdict(float)
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            totals[row["country"]] += float(row["amount"])
    return dict(totals)
```

Memory now scales with the number of distinct countries rather than the number of rows, which is the
property that makes this safe at any input size.

Two things I would still change. One malformed `amount` raises and discards eighty gigabytes of
work, so bad rows should be counted and skipped, or routed to a rejects file, with the job failing
only if the rate crosses a threshold. And `float` is the wrong type for money, since repeated
addition accumulates rounding error across millions of rows; `Decimal` or integer minor units is the
correct choice even though it is slower.
