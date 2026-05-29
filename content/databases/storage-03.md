---
block: databases
difficulty: base
id: storage-03
kind: question
subblock: engines
tags:
- hdfs
- namenode
- replication
title: Архитектура HDFS
topic: architecture
weight: 5
---

## Вопрос
Опиши архитектуру HDFS: роли NameNode и DataNode, блоки, фактор репликации и rack awareness. Кто за что отвечает?

## Ответ
HDFS — распределённая ФС по схеме master/worker:
- **NameNode** (master) — хранит **метаданные**: дерево каталогов, из каких блоков состоит файл и на каких DataNode лежат их реплики. Сами данные не хранит. Критичен для доступности кластера.
- **DataNode** (workers) — хранят сами **блоки** на локальных дисках, обслуживают чтение/запись, шлют NameNode heartbeat и block reports.

Файл бьётся на блоки фиксированного размера (по умолчанию **128 МБ**); каждый блок реплицируется (**replication factor**, по умолчанию 3) на разные DataNode для надёжности и доступности.

**Rack awareness** — NameNode размещает реплики с учётом стоек: типично одна реплика на локальной стойке, ещё одна-две на другой. Это баланс надёжности (переживёт отказ стойки) и сетевого трафика (запись внутри стойки дешевле). Чтение предпочитает ближайшую реплику (**data locality**), что важно для Spark/MapReduce.
