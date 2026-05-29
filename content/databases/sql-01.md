---
block: databases
difficulty: junior
id: sql-01
kind: question
subblock: sql
tags:
- sql
title: 'Оконные функции: ROW_NUMBER / RANK'
topic: analytical-sql
weight: 10
---

## Вопрос
Чем отличаются оконные функции `ROW_NUMBER`, `RANK` и `DENSE_RANK`? Когда какую брать?

## Ответ
Все нумеруют строки в пределах `PARTITION BY ... ORDER BY ...`, но по-разному обрабатывают одинаковые значения (ties):
- `ROW_NUMBER` — уникальный номер, ties разбиваются произвольно (1,2,3,4).
- `RANK` — одинаковым значениям один ранг, следующий ранг с пропуском (1,2,2,4).
- `DENSE_RANK` — одинаковым один ранг, без пропуска (1,2,2,3).

`ROW_NUMBER` — для дедупликации «оставить одну строку на ключ» (`qualify row_number() over(...) = 1`). `RANK`/`DENSE_RANK` — для топ-N с учётом равенств (топ-3 по продажам, где ничьи делят место).
