---
block: databases
difficulty: middle
id: sql-02
kind: task
rubric:
- агрегация SUM(qty) с GROUP BY region, sku
- оконная нумерация ROW_NUMBER/RANK с PARTITION BY region ORDER BY sum DESC
- фильтр по дате и по rank <= 3
- корректная обработка ничьих (если требуется RANK)
starterCode: '-- Таблица sales(region, sku, qty, dt). Нужен топ-3 SKU по сумме qty

  -- в каждом регионе за май 2026. Напиши запрос (Trino/Spark SQL).

  SELECT ...

  '
subblock: sql
tags:
- sql
title: Топ-3 SKU по регионам
topic: analytical-sql
weight: 10
---

## Задача
По таблице `sales(region, sku, qty, dt)` верни топ-3 SKU по суммарному `qty` в каждом регионе за май 2026.

## Решение
```sql
WITH agg AS (
  SELECT region, sku, SUM(qty) AS total
  FROM sales
  WHERE dt >= DATE '2026-05-01' AND dt < DATE '2026-06-01'
  GROUP BY region, sku
)
SELECT region, sku, total
FROM (
  SELECT region, sku, total,
         ROW_NUMBER() OVER (PARTITION BY region ORDER BY total DESC) AS rn
  FROM agg
)
WHERE rn <= 3
ORDER BY region, total DESC;
```
Если нужно учитывать ничьи на 3-м месте — заменить `ROW_NUMBER` на `RANK`.
