---
block: frameworks
difficulty: junior
id: af-orchestration-04
kind: question
subblock: airflow
tags:
- orchestration
title: Операторы и свой оператор
topic: orchestration
weight: 16
---

## Вопрос
Какие группы операторов в Airflow ты знаешь? Если нужно написать свой оператор — какие методы и поля обязательно реализовать?

## Ответ
Условно операторы делятся на группы:
- **Action-операторы** — выполняют работу: `PythonOperator`, `BashOperator`, `@task` (TaskFlow), `KubernetesPodOperator`, `SparkSubmitOperator`.
- **Transfer-операторы** — перекладывают данные между системами: `S3ToHiveOperator`, `*ToGCSOperator` и т.п.
- **Sensors** — ждут события/условия (`ExternalTaskSensor`, `S3KeySensor`, `SqlSensor`); работают в режиме `poke`/`reschedule`.
Большинство приходит из provider-пакетов (`apache-airflow-providers-*`).

Чтобы написать свой оператор, наследуешься от `BaseOperator` и реализуешь:
- **`__init__`** — принимает параметры, обязательно вызывает `super().__init__(**kwargs)`; шаблонизируемые поля перечисляются в `template_fields`.
- **`execute(self, context)`** — главный метод с логикой задачи; его возвращаемое значение автоматически кладётся в XCom. Вызывается в воркере.

Опционально: `pre_execute`/`post_execute`, `on_kill` (корректная остановка при kill/timeout), `template_ext` для шаблонов из файлов. Логику стороннего сервиса принято выносить в Hook, а оператор делает его тонкой обёрткой. Сам оператор должен быть идемпотентным.
