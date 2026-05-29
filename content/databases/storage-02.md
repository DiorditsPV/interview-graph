---
block: databases
difficulty: base
id: storage-02
kind: question
subblock: formats
tags:
- file-formats
title: Устройство Apache Parquet
topic: architecture
weight: 5
---

## Вопрос
Как устроен Apache Parquet изнутри и почему он эффективен для аналитики? Что внутри файла позволяет читать только нужные данные?

## Ответ
Parquet — **колоночный** бинарный формат с такой структурой файла:
- файл делится на **row groups** (горизонтальные блоки строк, обычно десятки–сотни МБ);
- внутри row group данные хранятся по столбцам — **column chunk** на каждую колонку;
- column chunk состоит из **pages** (единица сжатия/кодирования);
- в конце файла — **footer** с метаданными: схема, границы row groups, и **статистика по каждому column chunk** (min/max, число null, count).

Почему эффективен для аналитики:
- **Column pruning** — читаются только нужные колонки, а не вся строка (аналитика обычно трогает 2–3 поля из сотни).
- **Predicate pushdown / row-group skipping** — по min/max-статистике в footer движок пропускает целые row groups, не подходящие под фильтр.
- **Эффективное сжатие и кодирование** — одинаковые типы в колонке жмутся лучше: dictionary encoding, RLE, bit-packing + кодек (snappy/zstd/gzip). Snappy — баланс скорость/размер, zstd — сильнее жмёт.
- **Схема со типами** хранится в файле (self-describing), поддерживает вложенные структуры (Dremel-кодирование repetition/definition levels).
- **Splittable** по row groups → параллельное чтение в Spark/Trino.

Нюансы: формат для **батч-чтения, не для построчных UPDATE**; «маленькие файлы» убивают производительность — поэтому контролируют размер row group/файла (см. вопрос о партиционировании parquet).
