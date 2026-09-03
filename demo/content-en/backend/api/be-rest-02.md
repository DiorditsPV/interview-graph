---
block: api
difficulty: middle
id: be-rest-02
kind: question
subblock: rest
tags:
- architecture
- optimization
title: Paginating a large collection
topic: pagination
weight: 4
---

## Question
A list endpoint returns millions of rows. How do you paginate it, and what breaks with page numbers?

## Answer
Offset pagination, meaning limit and offset or a page number, is the obvious approach and it has two
serious problems. The first is cost: the database must walk and discard every skipped row, so page
one is instant and page ten thousand is a full scan. The second is correctness under concurrent
writes. Offsets address positions in a result set, so if a row is inserted or deleted between two
requests, everything shifts, and a client paging through will see an item twice or miss it entirely.
For a user browsing search results that is cosmetic; for a client synchronising data it is data loss.

Cursor pagination fixes both. Instead of a position, the client sends the last item it saw, and the
server returns rows after that value, ordered by an indexed, stable, unique key. The query is a range
scan on the index regardless of depth, so page ten thousand costs the same as page one, and inserts
elsewhere in the collection do not shift the window. The ordering key must be unique, otherwise ties
at the boundary drop or repeat rows, so a timestamp is usually paired with an id as a tiebreaker.

The trade-off is that cursors cannot jump to an arbitrary page and cannot easily go backwards, so
offset pagination stays reasonable for small, bounded, human-browsed collections.
