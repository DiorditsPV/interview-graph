"""Pydantic-схемы графа интервью.

Паттерн заимствован из Astro Content Collections + Zod: схема валидирует каждую
импортируемую запись. Здесь роль Zod выполняет pydantic v2.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Block = Literal["frameworks", "databases", "python", "platform"]
Difficulty = Literal["base", "junior", "middle", "senior"]
Kind = Literal["question", "task"]


class Node(BaseModel):
    """Вершина графа: вопрос или практическая задача."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    id: str
    kind: Kind = "question"
    block: Block
    subblock: Optional[str] = None  # под-блок внутри блока (напр. airflow/pyspark/dbt)
    topic: str
    title: Optional[str] = None  # короткий заголовок для карточки (полный текст — в drawer)
    difficulty: Difficulty = "middle"
    weight: int = Field(default=1, ge=0)
    question: str
    answer: str = ""
    # только для kind == "task"
    starter_code: Optional[str] = Field(default=None, alias="starterCode")
    rubric: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    @field_validator("id", "topic", "question")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be blank")
        return v.strip()


class Graph(BaseModel):
    nodes: List[Node] = Field(default_factory=list)


class ImportError_(BaseModel):
    """Ошибка импорта одного файла (показывается в UI, не роняет загрузку)."""

    file: str
    error: str


class GraphResponse(BaseModel):
    nodes: List[Node]
    errors: List[ImportError_] = Field(default_factory=list)
