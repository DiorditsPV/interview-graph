---
block: platform
difficulty: middle
id: plat-docker-01
kind: question
tags:
- docker
- kubernetes
- multi-stage
title: Multi-stage Docker build
topic: containers
weight: 4
---

## Вопрос
Зачем нужен multi-stage build в Docker и что должно (и не должно) попадать в финальный образ для PySpark-джобы?

## Ответ
Multi-stage build разделяет сборку и рантайм: в первом стейдже ставятся build-зависимости (компиляторы, dev-пакеты, сборка колёс), а в финальный образ копируется только результат — так образ меньше, безопаснее (нет лишних инструментов) и быстрее тянется в K8s.

В финальный образ PySpark-джобы кладём: рантайм Python нужной версии, прод-зависимости (зафиксированные версии), код джобы, нужные JVM/Spark-библиотеки. НЕ кладём: build-tools, тесты и dev-зависимости, секреты/креды (их — через K8s secrets/Vault в рантайме), кэши пакетного менеджера. Базовый образ — slim/конкретный тег (не `latest`).
