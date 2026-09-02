---
block: python
difficulty: middle
id: py-lang-02
kind: question
tags:
- concurrency
title: GIL и конкурентность
topic: language
weight: 8
---

## Вопрос
Что такое GIL в CPython и как он влияет на выбор между threading, multiprocessing и asyncio для CPU-bound и IO-bound задач?

## Ответ
GIL (Global Interpreter Lock) — глобальная блокировка, из-за которой в один момент Python-байткод исполняет только один поток. Поэтому:
- **CPU-bound** (тяжёлые вычисления): threading не ускоряет (потоки дерутся за GIL) → `multiprocessing`/процессы или вынос в C/NumPy/PySpark.
- **IO-bound** (сеть, диск, БД): GIL отпускается на время ожидания → `threading` или `asyncio` дают реальный выигрыш; asyncio эффективнее на тысячах одновременных IO-операций.

Нюанс: PySpark/numpy обходят GIL, отдавая вычисления вне интерпретатора. В Python 3.13+ появился экспериментальный free-threaded build без GIL.
