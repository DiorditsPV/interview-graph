---
block: python
difficulty: middle
id: x5-python-04
kind: task
rubric:
- 'нашёл баг: dec возвращает 1 вместо wrapper, поэтому имя func перепривязано к int'
- wrapper принимает и пробрасывает *args/**kwargs и возвращает результат func, а не
  печатает его
- знает functools.wraps и зачем он нужен (сохранить __name__/__doc__)
- 'объяснил декоратор с параметрами как фабрику: три уровня вложенности, @dec(p) сначала
  вызывается, результат применяется к функции'
starterCode: "def dec(func):\n    def wrapper():\n        print(\"asd\")\n        print(func())\n
  \   return 1\n\n\n@dec\ndef func():\n    return 1\n\n\nfunc()   # TypeError: 'int'
  object is not callable\n\n\n# и с параметрами:\n@dec(param1, param2)\ndef func2():\n
  \   ...\n"
tags:
- architecture
- quality
title: Декоратор без параметра и с параметром
topic: decorators-with-params
weight: 3
---

## Задача
1) Что не так с этим декоратором и почему `func()` падает с `TypeError`? 2) Как выглядит декоратор с параметрами — в чём разница в уровнях вложенности по сравнению с обычным?

## Эталон
Запись `@dec` над `def func` эквивалентна `func = dec(func)`: имя `func` перепривязывается к тому, что вернул декоратор. Здесь `dec` возвращает `1`, поэтому после декорирования `func` — это целое число, и вызов `func()` даёт `TypeError: 'int' object is not callable`. Декоратор обязан вернуть вызываемый объект — как правило, внутреннюю функцию `wrapper`. Есть и второй дефект: `wrapper` не принимает аргументов и печатает результат вместо того, чтобы вернуть его, — обёрнутая функция с параметрами сломается, а вызывающий код не получит значения.

Исправленный вариант:
```python
import functools

def dec(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print("asd")
        return func(*args, **kwargs)
    return wrapper
```
`*args, **kwargs` пробрасывают любые аргументы внутрь, `return` отдаёт результат наружу, а `functools.wraps` копирует на обёртку `__name__`, `__doc__`, `__module__` и сигнатуру, чтобы декорированная функция не превращалась в анонимный `wrapper` в логах, документации и трассировках. Всё это работает на замыкании: `wrapper` помнит `func` из объемлющей области.

Декоратор с параметрами — это фабрика декораторов, поэтому уровней вложенности три. Выражение `@dec(param1, param2)` сначала вызывает `dec(param1, param2)`; результат этого вызова — и есть настоящий декоратор, который затем применяется к функции. Значит, внешняя функция принимает параметры, средняя — декорируемую функцию, внутренняя — аргументы вызова:
```python
def dec_with_params(param1, param2):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator
```
Параметры доступны во всех внутренних уровнях через замыкание. Отсюда и практическое следствие: `@dec` и `@dec()` — разные вещи, второе требует, чтобы `dec` без аргументов вернул декоратор.
