---
block: databases
difficulty: senior
id: query-trino-01
kind: question
subblock: dbms
tags:
- storage
- distributed
title: 'Trino: pushdown и federation'
topic: query-engines
weight: 5
---

## Вопрос
Что такое predicate pushdown и federation в Trino? Почему это ключевые механизмы и где они «ломаются»?

## Ответ
**Federation**: Trino — движок запросов без своего хранилища; через коннекторы он выполняет один SQL поверх разных источников (Hive/HDFS, ClickHouse, PostgreSQL, S3-таблицы) и джойнит их.

**Predicate / projection pushdown**: Trino проталкивает фильтры и список колонок в источник, чтобы тот вернул минимум данных (для parquet — отсечение по статистике row groups, чтение только нужных колонок).

Ломается, когда: коннектор не поддерживает pushdown конкретного предиката (функция, каст), join между источниками тянет большие объёмы по сети в координатор, нет статистики/партиционирования у таблиц. Тогда Trino читает много и медленно. Лечится партиционированием, актуальной статистикой и переносом тяжёлых агрегаций ближе к данным.
