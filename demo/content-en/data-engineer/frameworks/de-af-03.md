---
block: frameworks
difficulty: junior
id: de-af-03
kind: task
rubric:
- spots that the load reads a wall-clock cursor instead of the run's data interval
- parameterises the extract by the interval boundaries so a rerun reads the same slice
- makes the write idempotent by replacing the target partition or merging on a key
- notes that concurrent backfill runs make a shared mutable cursor unsafe
starterCode: "from airflow.decorators import dag, task\nimport pendulum\n\n@dag(schedule=\"@daily\",
  start_date=pendulum.datetime(2026, 1, 1), catchup=True)\ndef load_orders():\n    @task\n
  \   def load():\n        rows = fetch_orders_since(last_run_timestamp())\n        warehouse.insert(\"orders\",
  rows)\n\n    load()\n\nload_orders()\n\n# A backfill of this DAG produced duplicated
  orders. Fix it.\n"
subblock: airflow
tags:
- orchestration
- quality
title: Make a daily load rerunnable
topic: idempotent-load
weight: 3
---

## Task
Backfilling the DAG in `starterCode` duplicated orders in the warehouse. Explain why and rewrite
the task so any run, in any order, produces the same result.

## Solution
There are two independent bugs, and both come from the task not being a function of its run.

The extract uses `last_run_timestamp()`, a moving cursor. During a backfill several runs execute
close together, and possibly in parallel, so they all read a similar window rather than the day each
one is supposed to own. The fix is to take the boundaries from the run itself, which are constant
across retries and reruns:

```python
@task
def load(data_interval_start=None, data_interval_end=None):
    rows = fetch_orders_between(data_interval_start, data_interval_end)
    warehouse.replace_partition("orders", day=data_interval_start.date(), rows=rows)
```

The write is the second bug. A plain insert accumulates: run the same day twice and you get the rows
twice. Making the write idempotent means the target for a day is replaced rather than appended to,
either by overwriting that day's partition or by merging on the order key. Now rerunning a failed
day is a safe, boring operation instead of a data incident, which is the property that makes
backfills usable at all.
