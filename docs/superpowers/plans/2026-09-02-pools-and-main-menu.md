# Пулы направлений и главное меню — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Направление интервью становится самостоятельным пулом вопросов (`content/<pool>/`) со своей таксономией блоков; доска — подстраница главного меню с разделами кандидатов, сессий, подключения и банка.

**Architecture:** Бэкенд читает `content/<pool>/pool.yaml`, хранит `pool` у нод и сессий (мягкая миграция SQLite), отдаёт `/api/pools` и `/api/graph?pool=`. Фронт получает свой hash-роутер и страницы; блоки/цвета/под-колонки берутся из конфига пула, а не из констант. Три PR в `dev`: бэкенд+контент (старый фронт продолжает работать), фронт, стартовый пул «Системный аналитик».

**Tech Stack:** FastAPI + pydantic v2 + SQLite (backend/), React 18 + Vite + @xyflow/react (frontend/), pytest, playwright-smoke (`frontend/smoke.mjs`), docker compose для локальной проверки.

**Spec:** `docs/superpowers/specs/2026-09-02-pools-and-main-menu-design.md`

## Global Constraints

- Frontmatter нод не меняется: `pool` в файлах **не пишется**, его ставит импортёр по каталогу (`Node` остаётся `extra="forbid"`).
- PK `nodes` = `(tenant_id, id)` не трогаем; id нод уникальны в пределах тенанта, SA-вопросы с префиксом `sa-`.
- Кандидаты и интервьюеры общие; сессия привязана к пулу (`sessions.pool`).
- Миграции — по образцу `Database._migrate_sessions`: `PRAGMA table_info` → `ALTER TABLE ... ADD COLUMN ... DEFAULT 'data-engineer'`; ничего руками на сервере.
- PR 1 не ломает старый фронт: `GET /api/graph` без `?pool` = `data-engineer` (или первый пул по алфавиту), `/api/tracks` и `/api/weights` — заглушки поверх пулов, удаляются в PR 2.
- Роутер — свой hash-роутер, без новой npm-зависимости. Маршруты: `#/`, `#/board/<pool>`, `#/bank/<pool>`, `#/candidates`, `#/sessions`, `#/connect`.
- Классы, на которые ходит `smoke.mjs`, сохраняются: `.tb__toggle`, `.themebtn`, `.helpbtn`, `.addbtn`, `.uploadbtn`, `.bankscreenbtn`, `.bankbtn`, `.setbtn`, `.qnode*`, `.bgroup__header`, `.subhead`, `.hud*`, `.drawer*`, `.fp__*`, `.login__*`.
- Шапка доски — ровно два ряда; всё, что не ход интервью, — в боковой панели ⚙ или в меню.
- Каждая задача: `cd backend && . .venv/bin/activate && pytest -q` (67+ тестов зелёные) и/или `cd frontend && npm run build`; перед PR — `npm run smoke` против `docker compose up -d --build` (логин `admin`/`admin`, `SMOKE_OWNER_EMAIL=admin SMOKE_OWNER_PASSWORD=admin`).
- Коммиты по-русски в стиле репозитория (`feat(pools): …`, `fix(...)`), с трейлерами `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7`.

---

# Часть 1 · PR 1 — бэкенд и контент

Ветка `feature/pools-main-menu` (от `design/preview-finalists`). Итог части: `content/data-engineer/` с `pool.yaml`, `pool` у нод и сессий, `/api/pools`, `/api/graph?pool=`, старый фронт работает без изменений.

## Карта файлов части 1

- Create: `backend/app/pools.py` — чтение и валидация `pool.yaml` (dataclass-конфиг, веса).
- Create: `backend/tests/test_pools.py` — загрузка/валидация пулов, импорт с чужим блоком.
- Modify: `backend/app/models.py` — `block: str`, поле `pool`.
- Modify: `backend/app/importer.py` — `load_pool_content`, `parse_file(..., pool_id)`, проверка блока по пулу.
- Modify: `backend/app/db.py` — столбец `pool` в `nodes`/`sessions`, миграции, фильтры по пулу.
- Modify: `backend/app/seed.py` — `seed_pool_if_empty`.
- Modify: `backend/app/sampler.py` — удалить `load_weights`/`load_tracks`/`node_in_track`, `build_interview` без `track_include`.
- Modify: `backend/app/main.py` — `POOLS`, `/api/pools`, `?pool=` в graph/sessions, `pool` в import/nodes/interview/sessions, заглушки tracks/weights.
- Modify: `backend/tests/test_app.py`, `test_nodes.py`, `test_people.py` — пути `content/data-engineer/…`, пулы.
- Move: `content/{frameworks,databases,python,platform}` → `content/data-engineer/…`; Create `content/data-engineer/pool.yaml`; Delete `content/tracks.yaml`, `content/weights.yaml`.
- Modify: `.claude/skills/interview-balance/coverage.py`, `interview-refactor/inventory.py`, `interview-verify/check_import.py`, `interview-ideas/regen_ledger.py`, их `SKILL.md` — параметр пула.
- Modify: `CLAUDE.md`, `AGENTS.md`, `README.md` (разделы про контент и API).

---

### Task 1: `pools.py` — конфиг пула из `pool.yaml`

**Files:**
- Create: `backend/app/pools.py`
- Test: `backend/tests/test_pools.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass(frozen=True) class SubblockCfg: id: str; label: str
  @dataclass(frozen=True) class BlockCfg: id: str; label: str; color: str; weight: int; subblocks: tuple[SubblockCfg, ...]
  @dataclass(frozen=True) class PoolCfg:
      id: str; label: str; description: str; blocks: tuple[BlockCfg, ...]; dir: Path
      block_ids -> frozenset[str]; subblock_ids(block_id) -> frozenset[str]
      to_dict() -> dict          # как отдаёт /api/pools (без dir)
  def load_pools(content_dir: Path) -> dict[str, PoolCfg]
  def block_weights(pool: PoolCfg) -> dict[str, int]
  class PoolConfigError(ValueError)
  ```

- [ ] **Step 1: Написать падающие тесты**

`backend/tests/test_pools.py`:

```python
"""Тесты конфигурации пулов (content/<pool>/pool.yaml)."""

from pathlib import Path

import pytest

from app.pools import PoolCfg, block_weights, load_pools

VALID = """\
id: demo
label: Демо
description: тестовый пул
blocks:
  - id: alpha
    label: Альфа
    color: "#2563eb"
    weight: 60
    subblocks:
      - { id: a1, label: A1 }
      - { id: a2, label: A2 }
  - id: beta
    label: Бета
    color: "#16a34a"
    weight: 40
"""


def _mk(tmp_path: Path, name: str, yaml_text: str) -> Path:
    d = tmp_path / name
    d.mkdir()
    (d / "pool.yaml").write_text(yaml_text, encoding="utf-8")
    return d


def test_load_valid_pool(tmp_path):
    _mk(tmp_path, "demo", VALID)
    pools = load_pools(tmp_path)
    assert set(pools) == {"demo"}
    p = pools["demo"]
    assert isinstance(p, PoolCfg)
    assert p.label == "Демо"
    assert [b.id for b in p.blocks] == ["alpha", "beta"]
    assert p.block_ids == {"alpha", "beta"}
    assert p.subblock_ids("alpha") == {"a1", "a2"}
    assert p.subblock_ids("beta") == frozenset()
    assert p.dir == tmp_path / "demo"
    assert block_weights(p) == {"alpha": 60, "beta": 40}


def test_pool_id_must_match_dir(tmp_path):
    _mk(tmp_path, "other", VALID)  # id: demo, каталог other
    assert load_pools(tmp_path) == {}


def test_dir_without_pool_yaml_is_skipped(tmp_path):
    (tmp_path / "stray").mkdir()
    _mk(tmp_path, "demo", VALID)
    assert set(load_pools(tmp_path)) == {"demo"}


def test_invalid_yaml_is_skipped_not_fatal(tmp_path):
    _mk(tmp_path, "demo", VALID)
    _mk(tmp_path, "broken", "id: broken\nblocks: [not, a, mapping]\n")
    assert set(load_pools(tmp_path)) == {"demo"}


def test_to_dict_has_no_dir(tmp_path):
    _mk(tmp_path, "demo", VALID)
    d = load_pools(tmp_path)["demo"].to_dict()
    assert d["id"] == "demo" and "dir" not in d
    assert d["blocks"][0]["subblocks"] == [{"id": "a1", "label": "A1"}, {"id": "a2", "label": "A2"}]
    assert d["blocks"][1]["subblocks"] == []


def test_missing_content_dir(tmp_path):
    assert load_pools(tmp_path / "nope") == {}
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && . .venv/bin/activate && pytest tests/test_pools.py -q`
Expected: `ModuleNotFoundError: No module named 'app.pools'`

- [ ] **Step 3: Реализовать `backend/app/pools.py`**

```python
"""Конфигурация пулов направлений: content/<pool>/pool.yaml.

Пул — самостоятельный банк вопросов со своей таксономией блоков (см. спек
docs/superpowers/specs/2026-09-02-pools-and-main-menu-design.md). Отсюда берут
порядок и подписи колонок фронт, веса — sampler, допустимые block/subblock — импортёр.

Невалидный pool.yaml не роняет сервис: каталог пропускается с предупреждением в лог,
как сегодня битый контент попадает в errors, а не в 500.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Tuple

import yaml

log = logging.getLogger("interview")

_ID_RE = re.compile(r"^[a-z0-9-]+$")
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class PoolConfigError(ValueError):
    """pool.yaml есть, но не проходит валидацию."""


@dataclass(frozen=True)
class SubblockCfg:
    id: str
    label: str


@dataclass(frozen=True)
class BlockCfg:
    id: str
    label: str
    color: str
    weight: int
    subblocks: Tuple[SubblockCfg, ...]


@dataclass(frozen=True)
class PoolCfg:
    id: str
    label: str
    description: str
    blocks: Tuple[BlockCfg, ...]
    dir: Path

    @property
    def block_ids(self) -> frozenset:
        return frozenset(b.id for b in self.blocks)

    def subblock_ids(self, block_id: str) -> frozenset:
        for b in self.blocks:
            if b.id == block_id:
                return frozenset(s.id for s in b.subblocks)
        return frozenset()

    def to_dict(self) -> dict:
        """Форма для /api/pools — без пути к каталогу."""
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "blocks": [
                {
                    "id": b.id,
                    "label": b.label,
                    "color": b.color,
                    "weight": b.weight,
                    "subblocks": [{"id": s.id, "label": s.label} for s in b.subblocks],
                }
                for b in self.blocks
            ],
        }


def _req_str(d: dict, key: str, where: str) -> str:
    v = d.get(key)
    if not isinstance(v, str) or not v.strip():
        raise PoolConfigError(f"{where}: '{key}' must be a non-empty string")
    return v.strip()


def _parse_pool(data: dict, pool_dir: Path) -> PoolCfg:
    if not isinstance(data, dict):
        raise PoolConfigError("pool.yaml must be a mapping")
    pid = _req_str(data, "id", "pool")
    if not _ID_RE.match(pid):
        raise PoolConfigError(f"pool id '{pid}' must match [a-z0-9-]+")
    if pid != pool_dir.name:
        raise PoolConfigError(f"pool id '{pid}' must equal directory name '{pool_dir.name}'")
    raw_blocks = data.get("blocks")
    if not isinstance(raw_blocks, list) or not raw_blocks:
        raise PoolConfigError("pool must declare a non-empty 'blocks' list")

    blocks = []
    seen = set()
    for rb in raw_blocks:
        if not isinstance(rb, dict):
            raise PoolConfigError("each block must be a mapping")
        bid = _req_str(rb, "id", "block")
        if not _ID_RE.match(bid):
            raise PoolConfigError(f"block id '{bid}' must match [a-z0-9-]+")
        if bid in seen:
            raise PoolConfigError(f"duplicate block id '{bid}'")
        seen.add(bid)
        color = _req_str(rb, "color", f"block {bid}")
        if not _COLOR_RE.match(color):
            raise PoolConfigError(f"block {bid}: color must be #rrggbb")
        weight = rb.get("weight", 1)
        if not isinstance(weight, int) or weight < 0:
            raise PoolConfigError(f"block {bid}: weight must be a non-negative integer")
        subs = []
        sub_seen = set()
        for rs in rb.get("subblocks") or []:
            if not isinstance(rs, dict):
                raise PoolConfigError(f"block {bid}: each subblock must be a mapping")
            sid = _req_str(rs, "id", f"subblock of {bid}")
            if not _ID_RE.match(sid):
                raise PoolConfigError(f"subblock id '{sid}' must match [a-z0-9-]+")
            if sid in sub_seen:
                raise PoolConfigError(f"block {bid}: duplicate subblock '{sid}'")
            sub_seen.add(sid)
            subs.append(SubblockCfg(id=sid, label=_req_str(rs, "label", f"subblock {sid}")))
        blocks.append(
            BlockCfg(
                id=bid,
                label=_req_str(rb, "label", f"block {bid}"),
                color=color,
                weight=weight,
                subblocks=tuple(subs),
            )
        )
    return PoolCfg(
        id=pid,
        label=_req_str(data, "label", "pool"),
        description=str(data.get("description") or "").strip(),
        blocks=tuple(blocks),
        dir=pool_dir,
    )


def load_pool(pool_dir: Path) -> PoolCfg:
    """Прочитать один каталог пула. Бросает PoolConfigError / OSError / yaml.YAMLError."""
    data = yaml.safe_load((pool_dir / "pool.yaml").read_text(encoding="utf-8"))
    return _parse_pool(data, pool_dir)


def load_pools(content_dir: Path) -> Dict[str, PoolCfg]:
    """Все валидные пулы в content_dir, по id. Каталоги без pool.yaml пропускаются молча,
    с невалидным — с предупреждением."""
    out: Dict[str, PoolCfg] = {}
    if not content_dir.exists():
        return out
    for d in sorted(p for p in content_dir.iterdir() if p.is_dir()):
        if not (d / "pool.yaml").exists():
            continue
        try:
            cfg = load_pool(d)
        except (PoolConfigError, yaml.YAMLError, OSError) as exc:
            log.warning("pool '%s' skipped: %s", d.name, exc)
            continue
        out[cfg.id] = cfg
    return out


def block_weights(pool: PoolCfg) -> Dict[str, int]:
    """Веса блоков для sampler (порядок блоков сохраняется)."""
    return {b.id: b.weight for b in pool.blocks}


def default_pool_id(pools: Iterable[str]) -> str | None:
    """Пул по умолчанию для запросов без ?pool: data-engineer, иначе первый по алфавиту."""
    ids = sorted(pools)
    if not ids:
        return None
    return "data-engineer" if "data-engineer" in ids else ids[0]
```

- [ ] **Step 4: Прогнать тесты**

Run: `pytest tests/test_pools.py -q`
Expected: `6 passed`

- [ ] **Step 5: Коммит**

```bash
git add backend/app/pools.py backend/tests/test_pools.py
git commit -m "feat(pools): конфиг пула из content/<pool>/pool.yaml" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 2: Перенос контента в `content/data-engineer/` + `pool.yaml`

**Files:**
- Move: `content/frameworks/`, `content/databases/`, `content/python/`, `content/platform/` → `content/data-engineer/<block>/`
- Create: `content/data-engineer/pool.yaml`
- Delete: `content/tracks.yaml`, `content/weights.yaml`
- Modify: `backend/tests/test_app.py` (константа `CONTENT` и пути к файлам)

**Interfaces:**
- Produces: каталог пула `content/data-engineer/` с 61 нодой, валидный `pool.yaml` (веса 35/30/23/12, под-колонки как в бывшем `PREFERRED_SUB`).

- [ ] **Step 1: Перенести каталоги и убрать старые конфиги**

```bash
cd /Users/user/dev/projects/personal/interview-graph
mkdir -p content/data-engineer
git mv content/frameworks content/databases content/python content/platform content/data-engineer/
git rm -q content/tracks.yaml content/weights.yaml
ls content/data-engineer   # databases frameworks platform python
```

- [ ] **Step 2: Создать `content/data-engineer/pool.yaml`**

```yaml
# Пул «Дата-инженер» — бывший единственный банк. Порядок блоков = порядок колонок,
# порядок subblocks = порядок под-колонок (бывший PREFERRED_SUB во фронте),
# weight = доля блока в наборе интервью в % (бывший weights.yaml).
id: data-engineer
label: Дата-инженер
description: Airflow и Spark, SQL и хранилища, Python, платформа
blocks:
  - id: frameworks
    label: Фреймворки
    color: "#2563eb"
    weight: 35
    subblocks:
      - { id: airflow,   label: Airflow }
      - { id: pyspark,   label: PySpark }
      - { id: dbt,       label: dbt }
      - { id: streaming, label: Streaming }
  - id: databases
    label: Базы данных
    color: "#16a34a"
    weight: 30
    subblocks:
      - { id: sql,     label: SQL }
      - { id: dbms,    label: СУБД и движки }
      - { id: storage, label: Хранилища }
      - { id: formats, label: Форматы }
  - id: python
    label: Python
    color: "#d97706"
    weight: 23
  - id: platform
    label: Платформа
    color: "#9333ea"
    weight: 12
```

- [ ] **Step 3: Проверить, что все subblock контента объявлены в pool.yaml**

```bash
grep -h "^subblock:" content/data-engineer/*/*.md | sort -u
```
Expected: только `airflow dbms dbt formats pyspark sql storage streaming` — все есть в `pool.yaml`. Если появится другой — добавить его в `subblocks` соответствующего блока с подписью.

- [ ] **Step 4: Поправить пути в тестах**

В `backend/tests/test_app.py` заменить:

```python
CONTENT = Path(__file__).resolve().parent.parent.parent / "content"
```
на
```python
CONTENT_ROOT = Path(__file__).resolve().parent.parent.parent / "content"
CONTENT = CONTENT_ROOT / "data-engineer"   # каталог пула по умолчанию
```

Строки `assert not (CONTENT / "databases" / "zzz-upload-test-01.md").exists()` и `assert (CONTENT / "databases" / "sql-01.md").exists()` остаются как есть (теперь указывают внутрь пула). Тесты, использующие `load_content(CONTENT)`, `load_weights(CONTENT)`, `load_tracks(CONTENT)` пока падают — их правит Task 3 и Task 5; на этом шаге прогон не нужен.

- [ ] **Step 5: Коммит**

```bash
git add -A content backend/tests/test_app.py
git commit -m "feat(pools): контент дата-инженера переехал в content/data-engineer/ с pool.yaml" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 3: `Node.pool`, `block: str`, импортёр по каталогу пула

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/importer.py`
- Modify: `backend/tests/test_app.py` (импортёрные тесты), `backend/tests/test_pools.py` (+2 теста импорта)

**Interfaces:**
- Consumes: `PoolCfg` из Task 1.
- Produces:
  ```python
  # models.py
  class Node(BaseModel): ...; pool: str = Field(min_length=1); block: str = Field(min_length=1)
  # importer.py
  def parse_file(path: Path, pool_id: str) -> List[Node]
  def validate_against_pool(node: Node, pool: PoolCfg) -> None   # ValueError при чужом block/subblock
  def load_pool_content(pool: PoolCfg) -> Tuple[List[Node], List[ImportError_]]
  ```
  `load_content` удаляется.

- [ ] **Step 1: Тесты импортёра по пулу** — добавить в `backend/tests/test_pools.py`:

```python
from app.importer import load_pool_content, parse_file, validate_against_pool
from app.models import Node

MD_OK = "---\nid: alpha-01\nblock: alpha\nsubblock: a1\ntopic: t\ntitle: T\n---\n## Вопрос\nq?\n## Ответ\na.\n"
MD_BAD_BLOCK = "---\nid: bad-01\nblock: gamma\ntopic: t\n---\n## Вопрос\nq?\n"
MD_BAD_SUB = "---\nid: bad-02\nblock: alpha\nsubblock: zzz\ntopic: t\n---\n## Вопрос\nq?\n"


def test_parse_file_sets_pool(tmp_path):
    f = tmp_path / "alpha-01.md"
    f.write_text(MD_OK, encoding="utf-8")
    [node] = parse_file(f, pool_id="demo")
    assert node.pool == "demo" and node.block == "alpha" and node.subblock == "a1"


def test_load_pool_content_validates_blocks(tmp_path):
    d = _mk(tmp_path, "demo", VALID)
    (d / "alpha").mkdir()
    (d / "alpha" / "alpha-01.md").write_text(MD_OK, encoding="utf-8")
    (d / "alpha" / "bad-01.md").write_text(MD_BAD_BLOCK, encoding="utf-8")
    (d / "alpha" / "bad-02.md").write_text(MD_BAD_SUB, encoding="utf-8")
    pool = load_pools(tmp_path)["demo"]
    nodes, errors = load_pool_content(pool)
    assert [n.id for n in nodes] == ["alpha-01"]
    assert all(n.pool == "demo" for n in nodes)
    files = sorted(e.file for e in errors)
    assert files == ["alpha/bad-01.md", "alpha/bad-02.md"]
    assert any("block 'gamma'" in e.error for e in errors)
    assert any("subblock 'zzz'" in e.error for e in errors)


def test_validate_against_pool_ok_without_subblock(tmp_path):
    _mk(tmp_path, "demo", VALID)
    pool = load_pools(tmp_path)["demo"]
    node = Node(id="b-1", pool="demo", block="beta", topic="t", question="q")
    validate_against_pool(node, pool)  # не бросает
```

В `backend/tests/test_app.py` заменить импорты и первые пять тестов:

```python
from app.importer import load_pool_content
from app.models import Node
from app.pools import load_pools
from app.sampler import build_interview

CONTENT_ROOT = Path(__file__).resolve().parent.parent.parent / "content"
CONTENT = CONTENT_ROOT / "data-engineer"


def _de():
    return load_pools(CONTENT_ROOT)["data-engineer"]


def test_content_imports_without_errors():
    nodes, errors = load_pool_content(_de())
    assert errors == [], f"import errors: {errors}"
    assert len(nodes) >= 15
    assert all(n.pool == "data-engineer" for n in nodes)


def test_nodes_have_title_and_tags():
    nodes, _ = load_pool_content(_de())
    assert all(n.title for n in nodes), "every node should have a title"
    assert any(n.tags for n in nodes)


def test_both_formats_loaded():
    nodes, _ = load_pool_content(_de())
    ids = {n.id for n in nodes}
    assert "af-orchestration-01" in ids
    assert "domain-01" in ids and "monitoring-01" in ids


def test_markdown_body_split():
    nodes, _ = load_pool_content(_de())
    node = next(n for n in nodes if n.id == "af-orchestration-01")
    assert node.question and "DAG" in node.question
    assert node.answer and "идемпотентн" in node.answer.lower()


def test_task_node_has_starter_and_rubric():
    nodes, _ = load_pool_content(_de())
    task = next(n for n in nodes if n.id == "spark-batch-02")
    assert task.kind == "task"
    assert task.starter_code and "spark.read" in task.starter_code
    assert len(task.rubric) >= 2
```

`test_weights_loaded` удалить (веса теперь в pool.yaml — проверяется `test_load_valid_pool`). `test_build_interview_respects_count_and_balance`:

```python
def test_build_interview_respects_count_and_balance():
    nodes, _ = load_pool_content(_de())
    order = build_interview(nodes, count=10, seed=42)
    assert 1 <= len(order) <= 10
    assert len(order) == len(set(order))
```

`test_invalid_node_rejected` заменить на проверку, что `block` без пула — это уже не ошибка схемы, а ошибка импорта (см. `test_load_pool_content_validates_blocks`); сам тест переписать так:

```python
def test_node_requires_pool():
    with pytest.raises(Exception):
        Node.model_validate({"id": "x", "block": "python", "topic": "t", "question": "q"})  # нет pool
```

Все прочие обращения `load_content(CONTENT)` в файле (в `test_load_tracks`, `test_node_in_track_matcher`, `test_interview_track_scoped`, `test_graph_served_from_db_seed`, `test_seed_is_idempotent`) → `load_pool_content(_de())`; тесты треков удаляются в Task 5.

- [ ] **Step 2: Убедиться, что падает**

Run: `pytest tests/test_pools.py -q`
Expected: `ImportError: cannot import name 'load_pool_content'`

- [ ] **Step 3: `models.py`**

Заменить `Block = Literal["frameworks", "databases", "python", "platform"]` на:

```python
# Блок — строка: допустимые значения задаёт pool.yaml пула, проверяет импортёр
# (validate_against_pool), а не схема — у каждого пула своя таксономия.
Block = str
```

В классе `Node` после `kind: Kind = "question"` добавить:

```python
    pool: str = Field(min_length=1)  # id пула (content/<pool>/); ставит импортёр по каталогу, не frontmatter
```

и `block: Block` → `block: str = Field(min_length=1)`.

- [ ] **Step 4: `importer.py`**

Заменить `_node_from_markdown`, `_nodes_from_json`, `parse_file` и `load_content` на:

```python
def _node_from_markdown(path: Path, pool_id: str) -> Node:
    post = frontmatter.load(str(path))
    data: Dict = dict(post.metadata)
    if "question" not in data or "answer" not in data:
        q, a = _split_body(post.content)
        data.setdefault("question", q)
        data.setdefault("answer", a)
    data.setdefault("id", path.stem)
    data["pool"] = pool_id  # источник правды — каталог, не frontmatter
    return Node.model_validate(data)


def _nodes_from_json(path: Path, pool_id: str) -> List[Node]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "nodes" in raw:
        items = raw["nodes"]
    elif isinstance(raw, list):
        items = raw
    else:
        items = [raw]
    out: List[Node] = []
    for item in items:
        if isinstance(item, dict):
            item.setdefault("id", path.stem)
            item["pool"] = pool_id
        out.append(Node.model_validate(item))
    return out


def parse_file(path: Path, pool_id: str) -> List[Node]:
    """Распарсить один файл (.md → одна нода, .json → одна или несколько) в список Node
    пула `pool_id`. Бросает ValidationError/ValueError/JSONDecodeError/OSError — вызывающий ловит.
    id-less Markdown берёт id из `path.stem`, поэтому имя файла важно (см. /api/import).
    """
    if path.suffix.lower() == ".md":
        return [_node_from_markdown(path, pool_id)]
    return _nodes_from_json(path, pool_id)


def validate_against_pool(node: Node, pool: PoolCfg) -> None:
    """block/subblock ноды должны быть объявлены в pool.yaml её пула."""
    if node.block not in pool.block_ids:
        raise ValueError(
            f"block '{node.block}' is not declared in pool '{pool.id}' "
            f"(allowed: {', '.join(sorted(pool.block_ids))})"
        )
    if node.subblock and node.subblock not in pool.subblock_ids(node.block):
        raise ValueError(
            f"subblock '{node.subblock}' is not declared for block '{node.block}' in pool '{pool.id}'"
        )


def load_pool_content(pool: PoolCfg) -> Tuple[List[Node], List[ImportError_]]:
    """Загрузить все *.md и *.json каталога пула (рекурсивно), проверив блоки по pool.yaml."""
    nodes: List[Node] = []
    errors: List[ImportError_] = []
    seen: Dict[str, str] = {}

    if not pool.dir.exists():
        return nodes, [ImportError_(file=str(pool.dir), error="pool dir not found")]

    files = sorted(p for p in pool.dir.rglob("*") if p.suffix.lower() in {".md", ".json"})
    for path in files:
        rel = str(path.relative_to(pool.dir))
        try:
            batch = parse_file(path, pool.id)
            for node in batch:
                validate_against_pool(node, pool)
        except (ValidationError, ValueError, json.JSONDecodeError, OSError) as exc:
            errors.append(ImportError_(file=rel, error=_fmt_error(exc)))
            continue
        for node in batch:
            if node.id in seen:
                errors.append(
                    ImportError_(file=rel, error=f"duplicate id '{node.id}' (already in {seen[node.id]})")
                )
                continue
            seen[node.id] = rel
            nodes.append(node)

    return nodes, errors
```

Импорт вверху файла: `from .pools import PoolCfg`. Функцию `load_content` удалить целиком.

- [ ] **Step 5: Прогнать**

Run: `pytest tests/test_pools.py -q`
Expected: `9 passed`. `pytest tests/test_app.py -q` пока падает на `load_tracks`/`load_weights`/`seed` — это Task 4–5.

- [ ] **Step 6: Коммит**

```bash
git add backend/app/models.py backend/app/importer.py backend/tests/test_pools.py backend/tests/test_app.py
git commit -m "feat(pools): Node.pool, block как строка, импорт по каталогу пула с проверкой блоков" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 4: БД — столбец `pool` в `nodes`/`sessions`, миграция, фильтры

**Files:**
- Modify: `backend/app/db.py`
- Test: `backend/tests/test_people.py` (+ тест миграции нод), `backend/tests/test_app.py` (`test_seed_is_idempotent`)

**Interfaces:**
- Produces:
  ```python
  Database.count_nodes(tenant_id, pool: Optional[str] = None) -> int
  Database.list_nodes(tenant_id, pool: Optional[str] = None, include_hidden=True) -> List[Dict]
  Database.seed_nodes(tenant_id, nodes) -> int              # rows содержат "pool"
  Database.upsert_node(tenant_id, node, source) -> Dict      # node["pool"] пишется
  Database.create_session(candidate, tenant_id="default", candidate_id=None, interviewer_id=None, pool="data-engineer") -> Dict
  Database.list_sessions(tenant_id, pool: Optional[str] = None) -> List[Dict]
  Database.count_sessions(tenant_id, pool: str) -> int
  ```

- [ ] **Step 1: Тест миграции старой схемы нод** — в `backend/tests/test_people.py` добавить:

```python
def test_migration_adds_pool_to_old_nodes_and_sessions(tmp_path):
    """БД без столбца pool апгрейдится: старые ноды и сессии получают 'data-engineer'."""
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
        INSERT INTO tenants VALUES ('default', 'default', '2024-01-01T00:00:00');
        CREATE TABLE nodes (
            tenant_id TEXT NOT NULL DEFAULT 'default', id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'question',
            block TEXT NOT NULL, subblock TEXT, topic TEXT NOT NULL, title TEXT,
            difficulty TEXT NOT NULL DEFAULT 'middle', weight INTEGER NOT NULL DEFAULT 1,
            question TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', starter_code TEXT,
            rubric TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]',
            source TEXT NOT NULL DEFAULT 'seed', hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, id)
        );
        INSERT INTO nodes (id, block, topic, question, created_at, updated_at)
            VALUES ('old-01', 'python', 't', 'q', '2024-01-01T00:00:00', '2024-01-01T00:00:00');
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, candidate TEXT NOT NULL, created_at TEXT NOT NULL,
            tenant_id TEXT NOT NULL DEFAULT 'default', candidate_id INTEGER, interviewer_id INTEGER
        );
        INSERT INTO sessions (candidate, created_at) VALUES ('Старый', '2024-01-01T00:00:00');
        """
    )
    conn.commit()
    conn.close()

    db = Database(path)
    assert db.count_nodes("default") == 1
    assert db.count_nodes("default", pool="data-engineer") == 1
    assert db.count_nodes("default", pool="system-analyst") == 0
    assert db.get_node("default", "old-01")["pool"] == "data-engineer"
    assert db.get_session(1, "default")["pool"] == "data-engineer"
    assert db.list_sessions("default", pool="data-engineer")[0]["candidate"] == "Старый"
    assert db.list_sessions("default", pool="system-analyst") == []
    Database(path)  # повторное открытие идемпотентно
```

- [ ] **Step 2: Убедиться, что падает**

Run: `pytest tests/test_people.py::test_migration_adds_pool_to_old_nodes_and_sessions -q`
Expected: `TypeError: count_nodes() got an unexpected keyword argument 'pool'`

- [ ] **Step 3: Схема и миграция в `db.py`**

В `_SCHEMA` в `CREATE TABLE IF NOT EXISTS nodes (` после строки `tenant_id ... REFERENCES tenants(id),` добавить:

```sql
    pool         TEXT NOT NULL DEFAULT 'data-engineer',  -- id пула (content/<pool>/)
```

и в `CREATE TABLE IF NOT EXISTS sessions (` после `created_at TEXT NOT NULL` добавить строку `, pool TEXT NOT NULL DEFAULT 'data-engineer'` (внутри скобок, запятая после предыдущего поля).

В `__init__` после `self._migrate_sessions(conn)` добавить `self._migrate_nodes(conn)`; в `_migrate_sessions` добавить:

```python
        if "pool" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN pool TEXT NOT NULL DEFAULT 'data-engineer'")
```

Новый метод после `_migrate_sessions`:

```python
    @staticmethod
    def _migrate_nodes(conn: sqlite3.Connection) -> None:
        """Пулы направлений: столбец nodes.pool. Старые строки — бывший единственный банк,
        то есть 'data-engineer'. Индекс создаём здесь, а не в _SCHEMA: на старой БД столбца
        ещё нет в момент executescript."""
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(nodes)").fetchall()}
        if "pool" not in cols:
            conn.execute("ALTER TABLE nodes ADD COLUMN pool TEXT NOT NULL DEFAULT 'data-engineer'")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nodes_tenant_pool ON nodes(tenant_id, pool)")
```

- [ ] **Step 4: Методы нод**

```python
    def count_nodes(self, tenant_id: str, pool: Optional[str] = None) -> int:
        sql, args = "SELECT COUNT(*) FROM nodes WHERE tenant_id = ?", [tenant_id]
        if pool is not None:
            sql += " AND pool = ?"
            args.append(pool)
        with self._conn() as conn:
            return conn.execute(sql, args).fetchone()[0]

    def list_nodes(self, tenant_id: str, pool: Optional[str] = None, include_hidden: bool = True) -> List[Dict]:
        sql, args = "SELECT * FROM nodes WHERE tenant_id = ?", [tenant_id]
        if pool is not None:
            sql += " AND pool = ?"
            args.append(pool)
        if not include_hidden:
            sql += " AND hidden = 0"
        sql += " ORDER BY block, subblock, id"
        with self._conn() as conn:
            rows = conn.execute(sql, args).fetchall()
        return [_row_to_node(r) for r in rows]
```

В `upsert_node`: в список столбцов INSERT добавить `pool` (после `tenant_id, id,`), в VALUES — ещё один `?`, в кортеж параметров после `node["id"]` — `node.get("pool", "data-engineer")`; в `ON CONFLICT ... DO UPDATE SET` добавить `pool=excluded.pool,`. В `seed_nodes` аналогично: столбец `pool`, `?`, параметр `node.get("pool", "data-engineer")` после `node["id"]`.

- [ ] **Step 5: Методы сессий**

```python
    def create_session(
        self,
        candidate: str,
        tenant_id: str = "default",
        candidate_id: Optional[int] = None,
        interviewer_id: Optional[int] = None,
        pool: str = "data-engineer",
    ) -> Dict:
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO sessions (candidate, tenant_id, candidate_id, interviewer_id, pool, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (candidate, tenant_id, candidate_id, interviewer_id, pool, _now()),
            )
            sid = cur.lastrowid
        return self.get_session(sid, tenant_id)

    def list_sessions(self, tenant_id: str, pool: Optional[str] = None) -> List[Dict]:
        sql, args = "SELECT * FROM sessions WHERE tenant_id = ?", [tenant_id]
        if pool is not None:
            sql += " AND pool = ?"
            args.append(pool)
        sql += " ORDER BY created_at DESC"
        with self._conn() as conn:
            rows = conn.execute(sql, args).fetchall()
        return [dict(r) for r in rows]

    def count_sessions(self, tenant_id: str, pool: str) -> int:
        with self._conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE tenant_id = ? AND pool = ?", (tenant_id, pool)
            ).fetchone()[0]
```

- [ ] **Step 6: Прогнать**

Run: `pytest tests/test_people.py tests/test_pools.py -q`
Expected: все зелёные (в `test_people` — 11 + новый).

- [ ] **Step 7: Коммит**

```bash
git add backend/app/db.py backend/tests/test_people.py
git commit -m "feat(pools): столбец pool у нод и сессий с мягкой миграцией SQLite" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 5: Сид по пулам, `/api/pools`, `/api/graph?pool=`, заглушки tracks/weights

**Files:**
- Modify: `backend/app/seed.py`
- Modify: `backend/app/sampler.py` (удалить `load_weights`, `load_tracks`, `node_in_track`, `DEFAULT_TRACKS`; `build_interview` без `track_include`)
- Modify: `backend/app/main.py` (импорты, `POOLS`, старт, `_db_nodes`, ручки graph/pools/tracks/weights/interview)
- Test: `backend/tests/test_app.py`

**Interfaces:**
- Consumes: `load_pools`, `block_weights`, `default_pool_id` (Task 1); `load_pool_content` (Task 3); `Database.count_nodes/list_nodes/seed_nodes/count_sessions` (Task 4).
- Produces:
  ```python
  # seed.py
  def seed_pool_if_empty(db: Database, tenant_id: str, pool: PoolCfg) -> Tuple[int, list]
  # main.py (модульные)
  POOLS: Dict[str, PoolCfg]
  def _pool_or_404(pool_id: Optional[str]) -> PoolCfg     # None → default_pool_id(POOLS); неизвестный → HTTPException(404)
  def _db_nodes(request: Request, pool: PoolCfg) -> List[Node]
  GET /api/pools → [pool.to_dict() + {"counts": {"nodes": int, "sessions": int}}]
  GET /api/graph?pool=<id>
  POST /api/interview {count, difficulties?, pool?, seed?}
  GET /api/tracks (заглушка: пулы как треки с include=[]), GET /api/weights (веса пула по умолчанию)
  ```

- [ ] **Step 1: Тесты** — в `backend/tests/test_app.py` удалить `test_load_tracks`, `test_node_in_track_matcher`, `test_api_tracks_endpoint`, `test_interview_track_scoped` (и комментарий `# --- tracks ---`). Добавить:

```python
# --- pools ---
def test_api_pools_lists_data_engineer_with_counts():
    r = _client().get("/api/pools")
    assert r.status_code == 200
    pools = {p["id"]: p for p in r.json()}
    de = pools["data-engineer"]
    assert de["label"] == "Дата-инженер"
    assert [b["id"] for b in de["blocks"]] == ["frameworks", "databases", "python", "platform"]
    assert de["blocks"][0]["subblocks"][0] == {"id": "airflow", "label": "Airflow"}
    assert de["counts"]["nodes"] >= 15
    assert isinstance(de["counts"]["sessions"], int)
    assert "dir" not in de


def test_api_graph_default_pool_is_data_engineer():
    c = _client()
    default = c.get("/api/graph").json()["nodes"]
    explicit = c.get("/api/graph?pool=data-engineer").json()["nodes"]
    assert {n["id"] for n in default} == {n["id"] for n in explicit}
    assert all(n["pool"] == "data-engineer" for n in explicit)


def test_api_graph_unknown_pool_404():
    assert _client().get("/api/graph?pool=nope").status_code == 404


def test_api_tracks_stub_mirrors_pools():
    """PR 1: старый фронт читает /api/tracks — отдаём пулы как треки без include-фильтра."""
    tracks = _client().get("/api/tracks").json()
    assert any(t["id"] == "data-engineer" and t["include"] == [] for t in tracks)


def test_api_weights_stub_is_default_pool_weights():
    assert _client().get("/api/weights").json() == {
        "frameworks": 35, "databases": 30, "python": 23, "platform": 12
    }


def test_api_interview_pool_scoped():
    c = _client()
    r = c.post("/api/interview", json={"count": 8, "seed": 1, "pool": "data-engineer"})
    assert r.status_code == 200
    ids = r.json()["order"]
    assert 0 < len(ids) <= 8
    pool_ids = {n["id"] for n in c.get("/api/graph?pool=data-engineer").json()["nodes"]}
    assert set(ids) <= pool_ids
    assert c.post("/api/interview", json={"count": 3, "pool": "nope"}).status_code == 404
```

`test_graph_served_from_db_seed` и `test_seed_is_idempotent` переписать под пул:

```python
def test_graph_served_from_db_seed():
    nodes_on_disk, _ = load_pool_content(_de())
    api_ids = {n["id"] for n in _client().get("/api/graph?pool=data-engineer").json()["nodes"]}
    assert {n.id for n in nodes_on_disk} <= api_ids


def test_seed_is_idempotent():
    from app.main import db
    from app.tenancy import DEFAULT_TENANT
    before = db.count_nodes(DEFAULT_TENANT, pool="data-engineer")
    nodes, _ = load_pool_content(_de())
    assert db.seed_nodes(DEFAULT_TENANT, [n.model_dump() for n in nodes]) == 0
    assert db.count_nodes(DEFAULT_TENANT, pool="data-engineer") == before
```

- [ ] **Step 2: Убедиться, что падает**

Run: `pytest tests/test_app.py -q -x`
Expected: первый же импорт `from app.sampler import build_interview, load_tracks, load_weights, node_in_track` уже заменён в Task 3; падение на `/api/pools` → 404 или на `load_pool_content` в старте — любое, главное красное.

- [ ] **Step 3: `seed.py`**

Заменить `seed_tenant_if_empty` на:

```python
def seed_pool_if_empty(db: Database, tenant_id: str, pool: PoolCfg) -> Tuple[int, list]:
    """Если у тенанта нет нод этого пула — залить их из каталога пула.

    Проверка по count_nodes(tenant, pool): полный пул не трогается, пустой — засеивается.
    Так после миграции старой БД (все ноды → 'data-engineer') DE не пересеивается,
    а новый пул засеивается при первом старте. Возвращает (вставлено, ошибки импорта).
    """
    db.ensure_tenant(tenant_id)
    if db.count_nodes(tenant_id, pool=pool.id) > 0:
        return 0, []
    nodes, errors = load_pool_content(pool)
    inserted = db.seed_nodes(tenant_id, [n.model_dump() for n in nodes])
    return inserted, errors
```

Импорты: `from .importer import load_pool_content`, `from .pools import PoolCfg`; убрать `from pathlib import Path`, если больше не используется.

- [ ] **Step 4: `sampler.py`**

Удалить `DEFAULT_TRACKS`, `load_weights`, `load_tracks`, `node_in_track` и импорт `yaml`, если он больше не нужен. `build_interview`: убрать параметр `track_include` и блок `if track_include: ...`; docstring — «Фильтры: уровни сложности (difficulties)». `DEFAULT_BLOCK_WEIGHTS` оставить как фолбэк.

- [ ] **Step 5: `main.py`**

Импорты: `from .importer import parse_file, validate_against_pool`; `from .models import Difficulty, GraphResponse, Kind, Node` (без `Block`); `from .pools import PoolCfg, block_weights, default_pool_id, load_pools`; `from .sampler import build_interview`; `from .seed import seed_interviewer_if_empty, seed_owner_if_empty, seed_pool_if_empty`; добавить `from typing import Dict`.

После `hub = SessionHub()` заменить блок сида нод на:

```python
# Пулы направлений: content/<pool>/pool.yaml. Читаются при старте; сид — на каждый пул
# отдельно (пустой засеивается из своего каталога, полный не трогается).
POOLS: Dict[str, PoolCfg] = load_pools(CONTENT_DIR)
if not POOLS:
    log.warning("no pools found in %s — /api/pools will be empty", CONTENT_DIR)
for _pool in POOLS.values():
    _seeded, _seed_errors = seed_pool_if_empty(db, resolve_tenant(), _pool)
    if _seeded:
        log.info("seeded %d nodes into pool %s", _seeded, _pool.id)
    if _seed_errors:
        log.warning("content import errors in pool %s: %s", _pool.id, _seed_errors)
```

`_db_nodes` заменить на:

```python
def _pool_or_404(pool_id: Optional[str]) -> PoolCfg:
    """Пул по id; без id — пул по умолчанию (data-engineer или первый по алфавиту)."""
    pid = pool_id or default_pool_id(POOLS)
    if pid is None or pid not in POOLS:
        raise HTTPException(status_code=404, detail=f"pool '{pool_id}' not found")
    return POOLS[pid]


def _db_nodes(request: Request, pool: PoolCfg) -> List[Node]:
    """Ноды пула из БД (источник правды) как объекты Node для текущего тенанта."""
    tenant = resolve_tenant(request)
    return [
        Node.model_validate({k: v for k, v in row.items() if k in _NODE_FIELDS})
        for row in db.list_nodes(tenant, pool=pool.id)
    ]
```

Ручки graph/weights/tracks заменить на:

```python
@app.get("/api/pools")
def get_pools(request: Request, _user: dict = Depends(current_user)) -> list:
    tenant = resolve_tenant(request)
    return [
        {
            **p.to_dict(),
            "counts": {
                "nodes": db.count_nodes(tenant, pool=p.id),
                "sessions": db.count_sessions(tenant, p.id),
            },
        }
        for p in POOLS.values()
    ]


@app.get("/api/graph", response_model=GraphResponse)
def get_graph(
    request: Request, pool: Optional[str] = None, _user: dict = Depends(current_user)
) -> GraphResponse:
    # Вопросы читаются из БД (а не с диска) — рантайм-правки переживают деплой.
    return GraphResponse(nodes=_db_nodes(request, _pool_or_404(pool)), errors=[])


# PR 1: заглушки для старого фронта; удаляются вместе с ним в PR 2.
@app.get("/api/weights")
def get_weights(_user: dict = Depends(current_user)) -> dict:
    return block_weights(_pool_or_404(None))


@app.get("/api/tracks")
def get_tracks(_user: dict = Depends(current_user)) -> list:
    return [{"id": p.id, "label": p.label, "include": []} for p in POOLS.values()]
```

`InterviewRequest`: поле `track: Optional[str] = None` → `pool: Optional[str] = None`. `make_interview`:

```python
@app.post("/api/interview")
def make_interview(
    req: InterviewRequest, request: Request, _user: dict = Depends(current_user)
) -> dict:
    pool = _pool_or_404(req.pool)
    order = build_interview(
        _db_nodes(request, pool),
        count=req.count,
        difficulties=req.difficulties,
        block_weights=block_weights(pool),
        seed=req.seed,
    )
    return {"order": order}
```

- [ ] **Step 6: Прогнать**

Run: `pytest -q`
Expected: падают только `test_api_import_*`, `test_create_node_*` и сессионные тесты, где ещё нет `pool` (Task 6); `test_api_pools_*`, `test_api_graph_*`, `test_api_interview_pool_scoped` — зелёные.

- [ ] **Step 7: Коммит**

```bash
git add backend/app/seed.py backend/app/sampler.py backend/app/main.py backend/tests/test_app.py
git commit -m "feat(pools): сид по пулам, GET /api/pools, /api/graph?pool=, заглушки tracks/weights" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 6: `pool` в сессиях, импорте и CRUD нод

**Files:**
- Modify: `backend/app/main.py` (`SessionCreate`, `ImportFile`, `NodeCreate`, `import_file`, `_unique_node_id`, `add_node`, `edit_node`, `create_session`, `list_sessions`)
- Test: `backend/tests/test_app.py`, `backend/tests/test_nodes.py`, `backend/tests/test_people.py`

**Interfaces:**
- Consumes: `_pool_or_404`, `validate_against_pool`, `Database.create_session(..., pool)`, `Database.list_sessions(tenant, pool)`.
- Produces:
  ```
  POST /api/sessions  {candidate, candidateId?, interviewerId?, pool?}   → сессия с полем pool
  GET  /api/sessions?pool=<id>
  POST /api/import    {filename, content, pool?}                          → ноды в пул; чужой block → в errors
  POST /api/nodes     {pool?, block, ...}                                 → 400 при block вне пула
  ```

- [ ] **Step 1: Тесты**

`backend/tests/test_app.py`:

```python
def test_api_session_carries_pool():
    c = _client()
    s = c.post("/api/sessions", json={"candidate": "Пулов", "pool": "data-engineer"}).json()
    assert s["pool"] == "data-engineer"
    default = c.post("/api/sessions", json={"candidate": "Дефолтов"}).json()
    assert default["pool"] == "data-engineer"
    assert c.post("/api/sessions", json={"candidate": "X", "pool": "nope"}).status_code == 404
    rows = c.get("/api/sessions?pool=data-engineer").json()
    assert all(r["pool"] == "data-engineer" for r in rows)
    assert c.get("/api/sessions?pool=nope").status_code == 404


def test_api_import_rejects_block_outside_pool():
    c = _client()
    md = "---\nid: zzz-outside-01\nblock: requirements\ntopic: t\n---\n## Вопрос\nq?\n"
    r = c.post("/api/import", json={"filename": "x.md", "content": md, "pool": "data-engineer"})
    data = r.json()
    assert data["added"] == []
    assert any("block 'requirements'" in e["error"] for e in data["errors"])
    assert "zzz-outside-01" not in {n["id"] for n in c.get("/api/graph").json()["nodes"]}


def test_api_import_default_pool_and_graph_visibility():
    c = _client()
    md = "---\nid: zzz-pooled-01\nblock: python\ntopic: t\n---\n## Вопрос\nq?\n"
    try:
        data = c.post("/api/import", json={"filename": "p.md", "content": md}).json()
        assert any(a["id"] == "zzz-pooled-01" for a in data["added"])
        node = next(n for n in c.get("/api/graph?pool=data-engineer").json()["nodes"] if n["id"] == "zzz-pooled-01")
        assert node["pool"] == "data-engineer"
    finally:
        _delete_node("zzz-pooled-01")
```

`backend/tests/test_nodes.py` — добавить:

```python
def test_create_node_block_outside_pool_400():
    c = _client()
    r = c.post("/api/nodes", json={"block": "requirements", "topic": "x", "question": "q?"})
    assert r.status_code == 400
    assert "requirements" in r.json()["detail"]


def test_create_node_gets_pool():
    c = _client()
    r = c.post("/api/nodes", json={"pool": "data-engineer", "block": "python", "topic": "Pooled", "question": "q?"})
    assert r.status_code == 200, r.text
    nid = r.json()["id"]
    try:
        node = next(n for n in c.get("/api/graph?pool=data-engineer").json()["nodes"] if n["id"] == nid)
        assert node["pool"] == "data-engineer"
    finally:
        c.delete(f"/api/nodes/{nid}")
```

- [ ] **Step 2: Убедиться, что падает**

Run: `pytest tests/test_app.py::test_api_session_carries_pool tests/test_nodes.py::test_create_node_block_outside_pool_400 -q`
Expected: FAIL (`pool` в ответе сессии отсутствует; 200 вместо 400).

- [ ] **Step 3: Модели запросов в `main.py`**

```python
class SessionCreate(BaseModel):
    candidate: str = Field(min_length=1)
    candidate_id: Optional[int] = Field(default=None, alias="candidateId")
    interviewer_id: Optional[int] = Field(default=None, alias="interviewerId")
    pool: Optional[str] = None  # id пула; None → пул по умолчанию (совместимость со старым фронтом)
    model_config = {"populate_by_name": True}


class ImportFile(BaseModel):
    filename: str = Field(min_length=1)
    content: str
    pool: Optional[str] = None


class NodeCreate(BaseModel):
    """Создание вопроса из UI: id генерится сервером, остальное валидируется."""

    pool: Optional[str] = None
    block: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    difficulty: Difficulty = "middle"
    kind: Kind = "question"
    title: Optional[str] = None
    question: str = Field(min_length=1)
    answer: str = ""
    tags: List[str] = Field(default_factory=list)
```

- [ ] **Step 4: Ручки**

`import_file`: после `tenant = resolve_tenant(request)` добавить `pool = _pool_or_404(body.pool)`; `nodes = parse_file(tmp)` → `nodes = parse_file(tmp, pool.id)`; в цикле `for node in nodes:` первым действием:

```python
        try:
            validate_against_pool(node, pool)
        except ValueError as exc:
            errors.append({"file": name, "error": str(exc)})
            continue
```

`add_node`:

```python
@app.post("/api/nodes")
def add_node(body: NodeCreate, request: Request, _user: dict = Depends(require_member)) -> dict:
    """Создать новый вопрос в банке пула (БД, source='user'). id генерится из topic/title."""
    tenant = resolve_tenant(request)
    pool = _pool_or_404(body.pool)
    base = _slugify(body.topic or body.title or body.block)
    node_id = _unique_node_id(tenant, base)
    node = Node.model_validate({**body.model_dump(exclude={"pool"}), "pool": pool.id, "id": node_id})
    try:
        validate_against_pool(node, pool)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    saved = db.upsert_node(tenant, node.model_dump(by_alias=True), source="user")
    return {"id": saved["id"], "block": saved["block"], "title": saved.get("title") or ""}
```

`edit_node`: без изменений по полям (в `NodeUpdate` нет `pool`, `merged` наследует `existing["pool"]`); после валидации `Node.model_validate(...)` добавить проверку блока: если `merged["pool"] in POOLS`, вызвать `validate_against_pool(Node.model_validate({k: v for k, v in merged.items() if k in _NODE_FIELDS}), POOLS[merged["pool"]])` внутри того же `try`, 422 при ошибке.

`create_session`: перед `return db.create_session(...)` добавить `pool = _pool_or_404(body.pool)` и передать `pool=pool.id`. `list_sessions`:

```python
@app.get("/api/sessions")
def list_sessions(
    request: Request, pool: Optional[str] = None, _user: dict = Depends(current_user)
) -> list:
    tenant = resolve_tenant(request)
    return db.list_sessions(tenant, pool=_pool_or_404(pool).id if pool else None)
```

- [ ] **Step 5: Прогнать всё**

Run: `pytest -q`
Expected: все зелёные (было 67; минус 5 удалённых треков/весов, плюс ~16 новых).

- [ ] **Step 6: Коммит**

```bash
git add backend/app/main.py backend/tests/test_app.py backend/tests/test_nodes.py
git commit -m "feat(pools): pool в сессиях, импорте и CRUD нод, проверка блока по пулу" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 7: Скиллы и документация под пулы

**Files:**
- Modify: `.claude/skills/interview-verify/check_import.py`, `.claude/skills/interview-balance/coverage.py`, `.claude/skills/interview-refactor/inventory.py`, `.claude/skills/interview-ideas/regen_ledger.py`
- Modify: `.claude/skills/interview-verify/SKILL.md`, `interview-balance/SKILL.md`, `interview-refactor/SKILL.md`, `interview-ideas/SKILL.md` (одна строка про `POOL`)
- Modify: `CLAUDE.md`, `AGENTS.md`, `README.md`

- [ ] **Step 1: Скрипты — параметр пула**

Во всех четырёх скриптах заменить определение адреса на:

```python
POOL = os.environ.get("POOL", "data-engineer")   # id пула (content/<pool>/)
API_BASE = os.environ.get("API_URL", "http://127.0.0.1:8000/api").rstrip("/")
GRAPH_URL = f"{API_BASE}/graph?pool={POOL}"
```

и использовать `GRAPH_URL` вместо `API_URL`/`get("/graph")`. В `coverage.py` веса брать из пулов:

```python
def main():
    ns = json.load(urllib.request.urlopen(GRAPH_URL))["nodes"]
    pools = json.load(urllib.request.urlopen(f"{API_BASE}/pools"))
    pool = next((p for p in pools if p["id"] == POOL), None)
    weights = {b["id"]: b["weight"] for b in pool["blocks"]} if pool else {}
```

Первую строку вывода: `print(f"Пул {POOL}: всего нод {len(ns)}\n")`. В `inventory.py` docstring: `cat content/<pool>/<block>/<id>.md`. В `regen_ledger.py` `GROUPS` остаются (реестр DE); в docstring добавить `POOL=... (по умолч. data-engineer)`.

В каждом `SKILL.md` в разделе запуска добавить строку: «Пул задаётся `POOL=<id>` (по умолчанию `data-engineer`); контент — `content/<pool>/<block>/`».

- [ ] **Step 2: Документация**

`CLAUDE.md`: строки про `importer.py`/`sampler.py` заменить на:

```
- `pools.py` — читает `content/<pool>/pool.yaml` (блоки, под-колонки, цвета, веса) — таксономия пула.
- `importer.py` — парсит `content/<pool>/<block>/*.md|*.json` через `python-frontmatter` в `Node`,
  проверяя block/subblock по `pool.yaml`; `pool` ноды ставится по каталогу, не во frontmatter.
- `sampler.py` — собирает набор вопросов пропорционально весам блоков пула.
```

и абзац «Под-колонки внутри блока задаются полем `subblock` … порядок — в `PREFERRED_SUB`» → «…порядок и подписи — в `subblocks` соответствующего блока в `pool.yaml`». Добавить в «Грабли»: «Новый пул = каталог `content/<id>/` с `pool.yaml` (id = имя каталога); id нод уникальны в пределах тенанта — используйте префикс пула».

`AGENTS.md`: строку `content/<block>/*.md|*.json — банк вопросов; content/weights.yaml — веса блоков.` → `content/<pool>/pool.yaml — таксономия и веса пула; content/<pool>/<block>/*.md|*.json — его вопросы.`; в списке ручек `GET /api/weights, GET /api/tracks` → `GET /api/pools, GET /api/graph?pool=`.

`README.md` раздел «Контент» — первый абзац:

```
Вопросы живут в пулах направлений: `content/<pool>/pool.yaml` задаёт блоки (порядок колонок,
подписи, цвета, под-колонки, веса), `content/<pool>/<block>/*.md|*.json` — сами вопросы.
Сейчас есть `data-engineer` (Фреймворки · Базы данных · Python · Платформа); новый пул —
новый каталог с `pool.yaml`.
```

В примере frontmatter комментарий `block: frameworks         # frameworks | databases | python | platform` → `block: frameworks         # один из blocks[].id в pool.yaml`. В таблице API строку `/api/weights` заменить на `GET /api/pools — пулы с блоками и счётчиками` и `/api/graph` → `/api/graph?pool=<id>`.

- [ ] **Step 3: Проверить скрипты вживую** (нужен сервер `./run.sh dev` или контейнер на :8000)

Run: `python3 .claude/skills/interview-verify/check_import.py && POOL=data-engineer python3 .claude/skills/interview-balance/coverage.py | head -5`
Expected: `RESULT: OK` и таблица с весами 35/30/23/12.

- [ ] **Step 4: Коммит**

```bash
git add .claude/skills CLAUDE.md AGENTS.md README.md
git commit -m "docs(pools): скиллы и документация под content/<pool>/" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 8: Проверка PR 1 на контейнере и PR в `dev`

**Files:**
- Modify: `frontend/smoke.mjs` (убрать шаг 5c «Направление интервью» — селектор треков уходит в PR 2, а заглушка `/api/tracks` не содержит `analyst`)

- [ ] **Step 1: Убрать из smoke шаг треков**

Удалить блок от комментария `// 5c. Направление интервью: смена трека на «Аналитик» …` до строки `await trackSel.selectOption("data-engineer"); // сброс трека` включительно.

- [ ] **Step 2: Полный прогон бэкенда**

Run: `cd backend && . .venv/bin/activate && pytest -q`
Expected: все зелёные, 0 failed.

- [ ] **Step 3: Контейнер и smoke (старый фронт должен работать)**

```bash
cd /Users/user/dev/projects/personal/interview-graph
docker compose build --no-cache 2>&1 | grep -E "^ Image|ERROR"
docker compose down -v && docker compose up -d      # свежий том: проверяем сид пулов с нуля
for i in $(seq 1 40); do st=$(docker inspect -f '{{.State.Health.Status}}' interview-graph 2>/dev/null || echo нет); [ "$st" = healthy ] && break; sleep 2; done; echo "health: $st"
docker compose logs interview | grep -E "seeded|pool"        # ожидаем: seeded 61 nodes into pool data-engineer
cd frontend && SMOKE_OWNER_EMAIL=admin SMOKE_OWNER_PASSWORD=admin npm run smoke 2>&1 | tail -3
```
Expected: `ALL SMOKE CHECKS PASSED ✓`.

- [ ] **Step 4: Миграция на живой БД** — том с данными от старой схемы:

```bash
docker compose down && docker compose up -d      # том сохранён; старт должен пройти без ошибок
docker compose logs interview | grep -iE "error|traceback" || echo "миграция без ошибок"
```

- [ ] **Step 5: PR**

```bash
git push -u origin feature/pools-main-menu
gh pr create --base dev --head feature/pools-main-menu --title "Пулы направлений: бэкенд и контент (PR 1/3)" --body-file - <<'EOF'
Первый из трёх PR по спеку docs/superpowers/specs/2026-09-02-pools-and-main-menu-design.md.

Направление становится самостоятельным пулом: content/<pool>/pool.yaml задаёт блоки, под-колонки, цвета и веса; ноды и сессии получают pool (мягкая миграция SQLite, старые строки → data-engineer). Новые ручки: GET /api/pools, GET /api/graph?pool=, pool в POST /api/sessions, /api/import, /api/nodes, /api/interview. Контент DE переехал в content/data-engineer/.

Старый фронт продолжает работать: graph без ?pool = data-engineer, /api/tracks и /api/weights — заглушки поверх пулов (уходят в PR 2 вместе с селектором «Направление»).

Проверено: pytest зелёный, контейнер с чистым томом засеял пул, smoke — ALL SMOKE CHECKS PASSED, старт на томе со старой схемой — без ошибок.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7
EOF
```

---

# Часть 2 · PR 2 — фронт: роутер, страницы, блоки как данные, шапка-минимум

Ветка та же (`feature/pools-main-menu`, после мержа PR 1 в `dev` — от `dev`). Итог части: главное меню `#/`, доска `#/board/<pool>` с двухрядной шапкой и боковой панелью ⚙, страницы банка/кандидатов/сессий/подключения; `/api/tracks` и `/api/weights` удалены.

## Карта файлов части 2

- Modify: `frontend/src/types.ts` — `Block = string`, `PoolConfig`, хелперы `blockOrder/blockLabel/blockColor/subLabel/darken`; `pool` у `QNode`/сессий; удалить `Track`, `nodeInTrack`, `BLOCK_LABEL/COLOR`.
- Modify: `frontend/src/api.ts` — `pools()`, `graph(pool)`, `createSession(pool, …)`, `listSessions(pool?)`, `importFile(pool, …)`, `NodeCreate.pool`; удалить `weights`, `tracks`.
- Modify: `frontend/src/layout.ts` — `swimlaneLayout(nodes, pool)`; удалить `BLOCK_ORDER`, `PREFERRED_SUB`, `SUB_LABEL`.
- Modify: `frontend/src/components/BlockGroupNode.tsx`, `SubHeadNode.tsx`, `QuestionNode.tsx`, `DetailDrawer.tsx`, `BankBrowser.tsx`, `frontend/src/report.ts` — цвета/подписи из конфига пула.
- Modify: `frontend/src/design-themes.css` — плашки через `var(--plate)`.
- Create: `frontend/src/router.ts` — hash-роутер; `frontend/src/pages/PageShell.tsx` — каркас страниц.
- Create: `frontend/src/pages/HomePage.tsx`, `BankPage.tsx`, `CandidatesPage.tsx`, `SessionsPage.tsx`, `ConnectPage.tsx`.
- Create: `frontend/src/components/AddQuestionModal.tsx` — форма «Новый вопрос», вынесенная из `App.tsx`.
- Rename: `frontend/src/App.tsx` → `frontend/src/pages/BoardPage.tsx` (параметр `pool`).
- Modify: `frontend/src/components/SettingsMenu.tsx` — боковая панель с темой и справкой.
- Modify: `frontend/src/AuthGate.tsx` — рендерит `<Router/>`.
- Modify: `frontend/src/styles.css` — стили панели, каркаса страниц, меню; убрать `.topbar__row--content`, `.contentbar`, `.settings__pop`.
- Modify: `frontend/smoke.mjs`, `frontend/shots.mjs`, `backend/app/main.py` (удалить заглушки), `backend/tests/test_app.py`, `README.md`, `CLAUDE.md`, `AGENTS.md`.

---

### Task 9: Типы и API-клиент под пулы

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Block = string;
  export interface SubblockCfg { id: string; label: string }
  export interface BlockCfg { id: string; label: string; color: string; weight: number; subblocks: SubblockCfg[] }
  export interface PoolConfig { id: string; label: string; description: string; blocks: BlockCfg[]; counts?: { nodes: number; sessions: number } }
  export function blockOrder(pool: PoolConfig): string[]
  export function blockLabel(pool: PoolConfig, block: string): string
  export function blockColor(pool: PoolConfig, block: string): string
  export function subLabel(pool: PoolConfig, block: string, sub: string): string
  export function darken(hex: string, amount: number): string
  // QNode.pool: string; Session/SessionMeta/SessionSummary.pool: string
  ```
- Produces (`api.ts`):
  ```ts
  api.pools(): Promise<PoolConfig[]>
  api.graph(pool: string): Promise<GraphResponse>
  api.createSession(pool: string, candidate: string, candidateId?: number, interviewerId?: number)
  api.listSessions(pool?: string): Promise<SessionMeta[]>
  api.importFile(pool: string, filename: string, content: string)
  interface NodeCreate { pool: string; block: string; … }
  ```

- [ ] **Step 1: `types.ts`**

Заменить строку `export type Block = "frameworks" | "databases" | "python" | "platform";` на:

```ts
// Блок — строка: таксономию задаёт pool.yaml пула (см. PoolConfig), а не union-тип.
export type Block = string;
```

В `QNode` после `kind: Kind;` добавить `pool: string;`. В `Session`, `SessionMeta`, `SessionSummary` после `candidate: string;` добавить `pool: string;` (в `Session`/`SessionMeta` — найти по `candidate:`; это три интерфейса).

Блок «Направление интервью (трек/роль)» (`export interface Track { … }` и `export function nodeInTrack(...)`) удалить целиком и на его место вставить:

```ts
// Пул направления — зеркало content/<pool>/pool.yaml (GET /api/pools).
export interface SubblockCfg {
  id: string;
  label: string;
}
export interface BlockCfg {
  id: string;
  label: string;
  color: string; // семантический цвет блока (600-ряд)
  weight: number;
  subblocks: SubblockCfg[];
}
export interface PoolConfig {
  id: string;
  label: string;
  description: string;
  blocks: BlockCfg[];
  counts?: { nodes: number; sessions: number };
}

const FALLBACK_COLOR = "#64748b";

export function blockOrder(pool: PoolConfig): string[] {
  return pool.blocks.map((b) => b.id);
}
export function blockLabel(pool: PoolConfig, block: string): string {
  return pool.blocks.find((b) => b.id === block)?.label ?? block;
}
export function blockColor(pool: PoolConfig, block: string): string {
  return pool.blocks.find((b) => b.id === block)?.color ?? FALLBACK_COLOR;
}
export function subLabel(pool: PoolConfig, block: string, sub: string): string {
  return pool.blocks.find((b) => b.id === block)?.subblocks.find((s) => s.id === sub)?.label ?? sub;
}
```

Константы `BLOCK_LABEL` и `BLOCK_COLOR` удалить. Рядом с `lighten` добавить:

```ts
// Затемнить цвет блока — для плашек заголовков (700-ряд из 600-го, см. design-themes.css).
export function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const mix = (c: number) => Math.round(c * (1 - amount));
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
```

- [ ] **Step 2: `api.ts`**

Импорт типов: заменить `Track,` на `PoolConfig,`. В `NodeCreate` первым полем добавить `pool: string;`. В объекте `api` заменить `graph`, `weights`, `tracks`, `createSession`, `listSessions`, `importFile` на:

```ts
  pools: () => fetch(`${BASE}/pools`).then(json<PoolConfig[]>),
  graph: (pool: string) =>
    fetch(`${BASE}/graph?pool=${encodeURIComponent(pool)}`).then(json<GraphResponse>),
  createSession: (pool: string, candidate: string, candidateId?: number, interviewerId?: number) =>
    fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool, candidate, candidateId, interviewerId }),
    }).then(json<Session>),
  listSessions: (pool?: string) =>
    fetch(`${BASE}/sessions${pool ? `?pool=${encodeURIComponent(pool)}` : ""}`).then(json<SessionMeta[]>),
  importFile: (pool: string, filename: string, content: string) =>
    fetch(`${BASE}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool, filename, content }),
    }).then(json<ImportResult>),
```

- [ ] **Step 3: Сборка** — `cd frontend && npm run build` пока падает на потребителях (`App.tsx`, `layout.ts`, компоненты) — это Task 10–13; на этом шаге проверяется только, что `types.ts`/`api.ts` сами компилируются: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "types.ts|api.ts" || echo "types/api чистые"`.

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat(front): типы и API-клиент под пулы (PoolConfig, graph?pool, pool у сессий)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 10: Раскладка из конфига пула

**Files:**
- Modify: `frontend/src/layout.ts`

**Interfaces:**
- Consumes: `PoolConfig`, `blockOrder`, `subLabel` (Task 9).
- Produces: `swimlaneLayout(nodes: QNode[], pool: PoolConfig): Placement`; `Column.label` — подпись под-колонки из `pool.yaml`; экспорты `BLOCK_ORDER`, `SUB_LABEL` удалены, `DIFFS`, `DIFF_LABEL_FULL`, `subOf`, размеры — без изменений.

- [ ] **Step 1: Правка `layout.ts`**

Импорт: `import { blockOrder, subLabel, type Difficulty, type PoolConfig, type QNode } from "./types";` (тип `Block` больше не нужен). Удалить `export const BLOCK_ORDER…`, `const PREFERRED_SUB…`, `export const SUB_LABEL…`. В `Column`/`BlockGroup` поле `block: Block` → `block: string`.

Сигнатуру и начало функции заменить на:

```ts
export function swimlaneLayout(nodes: QNode[], pool: PoolConfig): Placement {
  // Порядок колонок — из pool.yaml; блоки, которых в конфиге нет (например, старый
  // контент после смены таксономии), идут следом по алфавиту, чтобы ничего не потерять.
  const blocks: string[] = [...blockOrder(pool)];
  for (const n of [...nodes].sort((a, c) => a.block.localeCompare(c.block)))
    if (!blocks.includes(n.block)) blocks.push(n.block);

  // Под-блоки каждого блока: сначала объявленные в pool.yaml (в их порядке), потом прочие.
  const subsByBlock: Record<string, string[]> = {};
  for (const b of blocks) {
    const present = Array.from(new Set(nodes.filter((n) => n.block === b).map(subOf)));
    const pref = pool.blocks.find((x) => x.id === b)?.subblocks.map((s) => s.id) ?? [];
    const ordered = [
      ...pref.filter((s) => present.includes(s)),
      ...present.filter((s) => !pref.includes(s)).sort(),
    ];
    subsByBlock[b] = ordered.length ? ordered : [b];
  }
```

В `columns.push({ … label: split ? SUB_LABEL[sub] ?? sub : null, … })` → `label: split ? subLabel(pool, block, sub) : null,`. Остальное тело функции без изменений.

- [ ] **Step 2: Проверить типы файла**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "layout.ts" || echo "layout чистый"`

- [ ] **Step 3: Коммит**

```bash
git add frontend/src/layout.ts
git commit -m "feat(front): swimlane-раскладка берёт блоки и под-колонки из pool.yaml" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 11: Компоненты и отчёт — цвета и подписи из пула

**Files:**
- Modify: `frontend/src/components/BlockGroupNode.tsx`, `SubHeadNode.tsx`, `QuestionNode.tsx`, `DetailDrawer.tsx`, `BankBrowser.tsx`
- Modify: `frontend/src/report.ts`
- Modify: `frontend/src/design-themes.css`

**Interfaces:**
- Produces:
  ```ts
  BlockGroupNodeData: { block: string; label: string; color: string; width; height; count; done; split; dark }
  SubHeadNodeData:    { block: string; label: string; color: string; width; count; done; dark }
  QuestionNodeData:   { node: QNode; color: string; score?; current?; dimmed?; hidden? }
  DetailDrawer props: + pool: PoolConfig
  BankBrowser props:  { nodes: QNode[]; pool: PoolConfig; onClose?: () => void; embedded?: boolean }
  buildReportHtml(candidate, nodes, scores, pool: PoolConfig, notes?, people?)
  downloadReport(candidate, nodes, scores, pool: PoolConfig, notes?, people?)
  downloadBank(nodes, pool: PoolConfig)
  ```
  Плашка заголовка: `.bgroup__header` получает инлайн `--plate: darken(color, .15)`; CSS красит её `var(--plate)` в 37 и в тёмной.

- [ ] **Step 1: `BlockGroupNode.tsx`**

Импорт: `import { darken, hexA, lighten } from "../types";` (без `BLOCK_COLOR`, `BLOCK_LABEL`, `Block`). В `BlockGroupNodeData` заменить `block: Block;` на `block: string; label: string; color: string;`. В теле: `const { block, label: blockLabel, color, width, height, count, done, split, dark } = data;` — удалить `const color = BLOCK_COLOR[block];`, `const label = dark ? lighten(color, 0.45) : color;` → `const fg = dark ? lighten(color, 0.45) : color;`. Заголовок:

```tsx
      <div
        className="bgroup__header"
        data-block={block}
        style={{
          height: SUPER_H,
          background: hexA(color, dark ? 0.12 : 0.16),
          color: fg,
          // плашка 37/тёмной темы: 700-ряд из цвета блока (design-themes.css → var(--plate))
          ["--plate" as string]: darken(color, 0.15),
        }}
      >
        <span className="bgroup__name">{blockLabel}</span>
```

`DARK_ZONE_ALPHA: Record<Block, number>` → `Record<string, number>`, обращение `DARK_ZONE_ALPHA[block] ?? 0.24`.

- [ ] **Step 2: `SubHeadNode.tsx`**

Импорт: `import { hexA, lighten } from "../types";`. `SubHeadNodeData.block: Block` → `block: string; color: string;` (поле `label` уже есть). Удалить `const color = BLOCK_COLOR[block];`, брать `color` из `data`.

- [ ] **Step 3: `QuestionNode.tsx`**

Импорт: `import { type QNode } from "../types";`. В `QuestionNodeData` добавить `color: string;`; удалить `const color = BLOCK_COLOR[node.block];`, брать `color` из `data`: `const { node, color, score, current, dimmed, hidden } = data as QuestionNodeData;`.

- [ ] **Step 4: `DetailDrawer.tsx`**

Импорт: `import { blockColor, blockLabel, type Difficulty, type PoolConfig, type QNode } from "../types";`. В props добавить `pool: PoolConfig;`. `const color = BLOCK_COLOR[node.block];` → `const color = blockColor(pool, node.block);`; `{BLOCK_LABEL[node.block]} · {node.topic}` → `{blockLabel(pool, node.block)} · {node.topic}`.

- [ ] **Step 5: `BankBrowser.tsx`**

Импорты: `import { blockColor, blockLabel, blockOrder, subLabel, DIFF_COLOR, type Difficulty, type Kind, type PoolConfig, type QNode } from "../types";` и `import { DIFFS, subOf } from "../layout";`. Props:

```ts
interface Props {
  nodes: QNode[];
  pool: PoolConfig;
  onClose?: () => void;   // оверлей на доске; на странице банка не передаётся
  embedded?: boolean;     // true — рендер как содержимое страницы, без overlay-обёртки и Esc
}
```

`BLOCK_ORDER` → `blockOrder(pool)` (в `useState` для `blocks` и в `grouped`); `BLOCK_LABEL[b]` → `blockLabel(pool, b)`, `BLOCK_COLOR[b]` → `blockColor(pool, b)`, `SUB_LABEL[sub] ?? sub` → `subLabel(pool, block, sub)`. Esc-эффект обернуть: `if (embedded || !onClose) return;` первой строкой в `useEffect`. Корневой `<div className="bankbrowser" role="dialog" …>` → `className={embedded ? "bankbrowser bankbrowser--embedded" : "bankbrowser"}`; кнопку закрытия рендерить только при `onClose`.

- [ ] **Step 6: `report.ts`**

Импорты: `import { blockColor, blockLabel, blockOrder, subLabel, type PoolConfig, type QNode } from "./types";`, `import { DIFFS, subOf } from "./layout";`. Сигнатуры: `buildReportHtml(candidate, nodes, scores, pool: PoolConfig, notes?, people?)`, `downloadReport(candidate, nodes, scores, pool: PoolConfig, notes?, people?)`, `buildBankHtml(nodes, pool)`/`downloadBank(nodes, pool)`. Внутри: `const blocks: string[] = [...blockOrder(pool)]; for (const n of nodes) if (!blocks.includes(n.block)) blocks.push(n.block);`; `BLOCK_COLOR[s.b]` → `blockColor(pool, s.b)`, `BLOCK_LABEL[s.b] ?? s.b` → `blockLabel(pool, s.b)`, `SUB_LABEL[n.subblock] ?? n.subblock` → `subLabel(pool, n.block, n.subblock)`; в шапке отчёта `trackLabel` → `pool.label` (строка «направление: …» теперь всегда).

- [ ] **Step 7: `design-themes.css` — плашки через переменную**

Восемь правил `…​.bgroup__header[data-block="…"] { background: #… !important; color: #fff !important; }` (четыре в блоке 37 и четыре в тёмной секции) заменить на два:

```css
/* плашки направлений: 700-ряд из цвета блока считает BlockGroupNode (darken .15) и кладёт
   в --plate; белый текст на нём 5.0–7.0:1. !important — инлайновый полупрозрачный фон. */
html[data-design="37"]:not([data-theme="dark"]) .bgroup__header { background: var(--plate) !important; color: #fff !important; }
html[data-theme="dark"] .bgroup__header { background: var(--plate) !important; color: #fff !important; }
```

- [ ] **Step 8: Типы компонентов**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/|report.ts" || echo "компоненты чистые"` (ошибки в `App.tsx` ожидаемы до Task 13).

- [ ] **Step 9: Коммит**

```bash
git add frontend/src/components frontend/src/report.ts frontend/src/design-themes.css
git commit -m "feat(front): узлы канвы, drawer, банк и отчёт берут цвета и подписи из пула" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 12: Hash-роутер, каркас страниц, `AuthGate` → `Router`

**Files:**
- Create: `frontend/src/router.ts`
- Create: `frontend/src/Router.tsx`
- Create: `frontend/src/pages/PageShell.tsx`
- Modify: `frontend/src/AuthGate.tsx`
- Modify: `frontend/src/styles.css` (стили каркаса)

**Interfaces:**
- Produces:
  ```ts
  // router.ts
  export type Route =
    | { name: "home" } | { name: "board"; pool: string; session: number | null }
    | { name: "bank"; pool: string } | { name: "candidates" } | { name: "sessions" } | { name: "connect" };
  export function parseHash(hash: string): Route
  export function navigate(to: string): void
  export function useRoute(): Route
  export const href = { home: "#/", board: (pool: string, session?: number|null) => string,
                        bank: (pool: string) => string, candidates: "#/candidates", sessions: "#/sessions", connect: "#/connect" }
  // Router.tsx — default export <Router/>: грузит /api/pools один раз, раздаёт страницам props { pools, pool }
  // PageShell.tsx — <PageShell title actions?>{children}</PageShell>: полоса «← Меню · title»
  ```

- [ ] **Step 1: `frontend/src/router.ts`**

```ts
import { useEffect, useState } from "react";

// Свой hash-роутер: адреса вида #/board/data-engineer?session=12. Без зависимости —
// нам нужны ровно шесть маршрутов, глубокие ссылки и F5; history API не нужен
// (бэкенд раздаёт статику одним index.html, hash его не трогает).

export type Route =
  | { name: "home" }
  | { name: "board"; pool: string; session: number | null }
  | { name: "bank"; pool: string }
  | { name: "candidates" }
  | { name: "sessions" }
  | { name: "connect" };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart);
  if (segs.length === 0) return { name: "home" };
  if (segs[0] === "board" && segs[1]) {
    const s = query.get("session");
    return { name: "board", pool: decodeURIComponent(segs[1]), session: s ? Number(s) : null };
  }
  if (segs[0] === "bank" && segs[1]) return { name: "bank", pool: decodeURIComponent(segs[1]) };
  if (segs[0] === "candidates") return { name: "candidates" };
  if (segs[0] === "sessions") return { name: "sessions" };
  if (segs[0] === "connect") return { name: "connect" };
  return { name: "home" }; // неизвестный путь → меню
}

export const href = {
  home: "#/",
  board: (pool: string, session?: number | null) =>
    `#/board/${encodeURIComponent(pool)}${session != null ? `?session=${session}` : ""}`,
  bank: (pool: string) => `#/bank/${encodeURIComponent(pool)}`,
  candidates: "#/candidates",
  sessions: "#/sessions",
  connect: "#/connect",
};

export function navigate(to: string): void {
  window.location.hash = to;
}

/** Текущий маршрут; перерисовка на hashchange. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
```

- [ ] **Step 2: `frontend/src/pages/PageShell.tsx`**

```tsx
import type { ReactNode } from "react";
import { href } from "../router";

// Каркас всех страниц, кроме доски: тонкая полоса «← Меню · заголовок [· действия]»,
// ниже — содержимое. Оформление (37 и альтернативы) приходит через те же токены.
export function PageShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page">
      <header className="pageshell">
        <a className="pageshell__back" href={href.home}>← Меню</a>
        <h1 className="pageshell__title">{title}</h1>
        {actions && <div className="pageshell__actions">{actions}</div>}
      </header>
      <main className="page__body">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: `frontend/src/Router.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "./api";
import BoardPage from "./pages/BoardPage";
import { BankPage } from "./pages/BankPage";
import { CandidatesPage } from "./pages/CandidatesPage";
import { ConnectPage } from "./pages/ConnectPage";
import { HomePage } from "./pages/HomePage";
import { SessionsPage } from "./pages/SessionsPage";
import { useRoute } from "./router";
import type { PoolConfig } from "./types";

// Раздаёт страницы по маршруту. Список пулов грузится один раз на вход: он нужен и меню,
// и доске (таксономия колонок), и банку. Неизвестный пул в адресе → меню с пометкой.
export default function Router() {
  const route = useRoute();
  const [pools, setPools] = useState<PoolConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadPools = () => api.pools().then(setPools).catch((e) => setError(String(e)));
  useEffect(() => {
    reloadPools();
  }, []);

  if (error) return <div className="loading">Не удалось загрузить направления: {error}</div>;
  if (!pools) return <div className="loading">Загрузка…</div>;

  const poolOf = (id: string) => pools.find((p) => p.id === id) ?? null;

  switch (route.name) {
    case "board": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={`Направления «${route.pool}» нет`} />;
      // key — чтобы смена пула пересоздавала доску целиком (состояние, таймеры, SSE).
      return <BoardPage key={pool.id} pool={pool} sessionFromUrl={route.session} />;
    }
    case "bank": {
      const pool = poolOf(route.pool);
      if (!pool) return <HomePage pools={pools} notice={`Направления «${route.pool}» нет`} />;
      return <BankPage key={pool.id} pool={pool} onChanged={reloadPools} />;
    }
    case "candidates":
      return <CandidatesPage pools={pools} />;
    case "sessions":
      return <SessionsPage pools={pools} />;
    case "connect":
      return <ConnectPage pools={pools} />;
    default:
      return <HomePage pools={pools} />;
  }
}
```

- [ ] **Step 4: `AuthGate.tsx`**

`import App from "./App";` → `import Router from "./Router";`; `return <App />;` → `return <Router />;`; комментарий «рендерит доску» → «рендерит роутер страниц».

- [ ] **Step 5: Стили каркаса** — добавить в `styles.css` после блока `.topbar`:

```css
/* ---- страницы кроме доски: тонкая полоса «← Меню · заголовок» + содержимое ---- */
.page { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg); }
.pageshell {
  display: flex; align-items: center; gap: 14px; padding: 10px 16px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.pageshell__back { color: var(--text-muted); text-decoration: none; font-size: 13px; white-space: nowrap; }
.pageshell__back:hover { color: var(--text); }
.pageshell__title { margin: 0; font-size: 16px; font-weight: 700; color: var(--heading); }
.pageshell__actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.page__body { flex: 1; padding: 20px 16px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
```

- [ ] **Step 6: Сборка** — падает, пока нет страниц (Task 13–16); проверить только `router.ts`/`PageShell.tsx`: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "router.ts|PageShell" || echo "чисто"`.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/router.ts frontend/src/Router.tsx frontend/src/pages/PageShell.tsx frontend/src/AuthGate.tsx frontend/src/styles.css
git commit -m "feat(front): hash-роутер, каркас страниц, Router вместо App в AuthGate" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 13: `App.tsx` → `pages/BoardPage.tsx` с параметром пула и двухрядной шапкой

**Files:**
- Rename: `frontend/src/App.tsx` → `frontend/src/pages/BoardPage.tsx`
- Modify: `frontend/src/pages/BoardPage.tsx` (по списку ниже)

**Interfaces:**
- Consumes: `PoolConfig`, `blockOrder/blockLabel/blockColor` (Task 9); `swimlaneLayout(nodes, pool)` (Task 10); данные узлов с `color`/`label` (Task 11); `href` (Task 12); `SettingsMenu` с темой/справкой (Task 14).
- Produces: `export default function BoardPage({ pool, sessionFromUrl }: { pool: PoolConfig; sessionFromUrl: number | null })`.

Правки — по порядку сверху вниз файла. Резать минимально: всё состояние доски остаётся внутри.

- [ ] **Step 1: Переименовать и поправить импорты**

```bash
cd frontend && git mv src/App.tsx src/pages/BoardPage.tsx
```

В шапке файла: все `from "./…"` → `from "../…"`. Удалить импорты `BankBrowser`, `UploadModal`, `downloadBank` (оставить `downloadReport`), `type NodeCreate` (оставить `type NodeUpdate`). Из `../layout` убрать `BLOCK_ORDER`. Из `../types` убрать `BLOCK_COLOR`, `BLOCK_LABEL`, `nodeInTrack`, `type Block`, `type Track`; добавить `blockColor`, `blockLabel`, `blockOrder`, `type PoolConfig`. Добавить `import { href } from "../router";`.

- [ ] **Step 2: `buildNodes` — пул вместо трека**

Сигнатура: убрать параметр `trackInclude: string[],`; после `graph: QNode[],` добавить `pool: PoolConfig,`. В данных blockGroup-узла: `data: { block: bg.block, label: blockLabel(pool, bg.block), color: blockColor(pool, bg.block), width: bg.width, … }`. В subhead-узле: `data: { block: col.block, label: col.label, color: blockColor(pool, col.block), width: col.width, … }`. В question-узле: `data: { node: n, color: blockColor(pool, n.block), score: scores[n.id], … }`. Из условия `dimmed` убрать строку `!nodeInTrack(n, trackInclude) ||`.

- [ ] **Step 3: localStorage с префиксом пула**

`readHiddenIds`/`readDraftScores` получают параметр `pool: string` и читают ключи `hiddenIds:${pool}` / `draftScores:${pool}`; перед чтением — одноразовый перенос старого ключа:

```ts
// Ключи доски теперь с суффиксом пула, чтобы DE и SA не пересекались. Старый ключ без
// суффикса принадлежит бывшему единственному банку — переносим его в data-engineer один раз.
function legacyKey(base: string, pool: string): string {
  const key = `${base}:${pool}`;
  try {
    if (pool === "data-engineer" && localStorage.getItem(key) == null) {
      const old = localStorage.getItem(base);
      if (old != null) {
        localStorage.setItem(key, old);
        localStorage.removeItem(base);
      }
    }
  } catch { /* приват-режим */ }
  return key;
}
```

и `localStorage.getItem(legacyKey("hiddenIds", pool))`, `legacyKey("draftScores", pool)`. Удалить `const ALL_BLOCKS = …` и `const EMPTY_ADD = { … }`.

- [ ] **Step 4: Компонент**

`export default function App() {` → `export default function BoardPage({ pool, sessionFromUrl }: { pool: PoolConfig; sessionFromUrl: number | null }) {`.

Состояние: удалить `showBank`, `addOpen`, `addDraft`, `uploadOpen`, `tracks`, `activeTrack`. Заменить:
- `useState<Record<string, number>>(readDraftScores)` → `useState<Record<string, number>>(() => readDraftScores(pool.id))`;
- `useState<Set<string>>(readHiddenIds)` → `useState<Set<string>>(() => readHiddenIds(pool.id))`;
- `useState<Record<string, boolean>>(ALL_BLOCKS)` → `useState<Record<string, boolean>>(() => Object.fromEntries(blockOrder(pool).map((b) => [b, true])))`;
- в инициализаторе `sessionStart`: `localStorage.getItem("timerStart")` → `localStorage.getItem(legacyKey("timerStart", pool.id))`.

Эффекты персиста: удалить строку с `"track"`; `localStorage.setItem("hiddenIds", …)` → ключ `` `hiddenIds:${pool.id}` ``; `localStorage.setItem("draftScores", …)` → `` `draftScores:${pool.id}` ``; все `localStorage.setItem("timerStart", …)` (в эффекте по `currentId` и в `startSession`) и `localStorage.removeItem("draftScores")` в `startSession` → ключи с `:${pool.id}`.

Удалить `trackInclude` и `trackLabel` (`useMemo`). В `visibleIds` убрать `&& nodeInTrack(n, trackInclude)` и `trackInclude` из зависимостей. В `agendaRows` типы `{ kind: "head"; block: Block }` → `block: string`, `let last: Block | null` → `string | null`.

`loadGraph`:

```ts
  const loadGraph = useCallback(
    () =>
      api
        .graph(pool.id)
        .then((g) => {
          setGraph(g.nodes);
          setErrors(g.errors);
          setPlacement(swimlaneLayout(g.nodes, pool));
        })
        .catch((err) => setErrors([{ file: "API", error: String(err) }])),
    [pool],
  );
```

Удалить `createNode` (`useCallback`) и эффект `api.tracks()…`. `api.listSessions()` (три места: эффект `pastSessions`, `startSession`, эффект авто-подключения) → `api.listSessions(pool.id)`, в зависимости эффектов добавить `pool.id`.

`rfNodes`: `buildNodes(graph, pool, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, query.toLowerCase().trim(), unscoredOnly, hiddenIds, showHidden, guidesH, guidesV, theme === "dark")`; в зависимостях `trackInclude` → `pool`.

`setSessionParam`:

```ts
  // Привязать активную сессию к адресу (#/board/<pool>?session=<id>) — ссылкой можно поделиться.
  // replaceState не шлёт hashchange: роутер не перерисовывает доску, состояние остаётся.
  const setSessionParam = useCallback(
    (id: number | null) => window.history.replaceState(null, "", href.board(pool.id, id)),
    [pool.id],
  );
```

`api.createSession(name || "—", …)` → `api.createSession(pool.id, name || "—", candidateId ?? undefined, pickedInterviewerId ?? undefined)`; в зависимости `startSession` добавить `pool.id`. Эффект авто-подключения:

```ts
  useEffect(() => {
    api.listSessions(pool.id).then(setSessions).catch(() => void 0);
    if (sessionFromUrl) joinSession(sessionFromUrl);
  }, [joinSession, pool.id, sessionFromUrl]);
```

`toggleBlock = (b: Block)` → `(b: string)`. В `progress`: `for (const b of BLOCK_ORDER)` → `for (const b of blockOrder(pool))`, зависимости `+ pool`. В `anyFilterOn`: `BLOCK_ORDER.some(…)` → `blockOrder(pool).some(…)`.

- [ ] **Step 5: Шапка — два ряда**

Весь `<header className="topbar">…</header>` заменить на:

```tsx
      <header className="topbar">
        {/* ряд 1 — где мы: назад в меню, направление, прогресс, настройки */}
        <div className="topbar__row topbar__row--flow">
          <a className="topbar__back" href={href.home} title="Главное меню">← Меню</a>
          <h1 className="appname">{pool.label}</h1>
          <span className="muted">{graph.length} вопросов</span>
          <div className="progress" title="Оценено по текущему набору фильтров">
            <div className="progress__track">
              <div className="progress__fill" style={{ width: `${coverage.pct}%` }} />
            </div>
            <span className="progress__label">
              оценено {coverage.done} / {coverage.total} ({coverage.pct}%)
            </span>
          </div>
          <div className="settings topbar__settings">
            <button
              className={`iconbtn setbtn btn--quiet ${settingsOpen ? "setbtn--on" : ""}`}
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
              title="Настройки"
            >
              ⚙
            </button>
            {settingsOpen && (
              <SettingsMenu
                onClose={() => setSettingsOpen(false)}
                settings={{
                  design,
                  onSetDesign: setDesign,
                  theme,
                  onToggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
                  bgDots: bgVariant === "dots",
                  onToggleBgDots: () => setBgVariant((v) => (v === "dots" ? "off" : "dots")),
                  guidesV,
                  onToggleGuidesV: () => setGuidesV((v) => !v),
                  guidesH,
                  onToggleGuidesH: () => setGuidesH((v) => !v),
                  agendaOpen,
                  onToggleAgenda: () => setAgendaOpen((v) => !v),
                  showHidden,
                  onToggleHidden: () => setShowHidden((v) => !v),
                  hiddenCount: hiddenIds.size,
                  showTimer,
                  onToggleTimer: () => setShowTimer((v) => !v),
                  onShowHelp: () => setHelpOpen(true),
                  bankHref: href.bank(pool.id),
                }}
              />
            )}
          </div>
        </div>

        {/* ряд 2 — ход интервью: кандидат, сессия, результат */}
        <div className="topbar__row topbar__row--utility">
          <div className="session">
            …БЛОК `.session` БЕЗ ИЗМЕНЕНИЙ от `{session ? (` до кнопки «Завершить · Скачать отчёт» включительно…
          </div>
        </div>
      </header>
```

Из блока `.session` удалить кнопки `?` (`helpbtn`) и темы (`themebtn`) и весь `<div className="settings">…</div>` (он переехал в ряд 1). Ряд 3 (`topbar__row--content` с `.contentbar`) удалить целиком. Оба вызова `downloadReport(...)` → `downloadReport(session?.candidate ?? candidate, graph, scores, pool, notes, reportPeople)`.

- [ ] **Step 6: Остальной JSX**

Агенда: `style={{ color: BLOCK_COLOR[r.block] }}` → `blockColor(pool, r.block)`, `{BLOCK_LABEL[r.block]}` → `{blockLabel(pool, r.block)}`, `borderLeftColor: BLOCK_COLOR[r.node.block]` → `blockColor(pool, r.node.block)`. Миникарта: `nodeColor={(n) => n.type === "question" ? ((n.data as { color?: string })?.color ?? "#999") : "rgba(100,116,139,0.18)"}`. Фильтр «Направления» → заголовок `Блоки`, `BLOCK_ORDER.map((b) => …)` → `blockOrder(pool).map((b) => …)` с `blockColor(pool, b)` / `blockLabel(pool, b)`. `<DetailDrawer … />` — добавить `pool={pool}`. Удалить `{uploadOpen && <UploadModal …/>}`, `{showBank && <BankBrowser …/>}` и весь блок `{addOpen && (<div className="modal" …>…</div>)}`.

- [ ] **Step 7: Стили** — в `styles.css` добавить рядом с `.appname`:

```css
.topbar__back { color: var(--text-muted); text-decoration: none; font-size: 13px; white-space: nowrap; }
.topbar__back:hover { color: var(--text); }
.topbar__settings { margin-left: auto; }
```

и удалить правила `.topbar__row--content`, `.topbar__row--content .iconbtn`, `.contentbar`.

- [ ] **Step 8: Сборка**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep BoardPage || echo "BoardPage чистый"` (остальные ошибки — отсутствующие страницы, Task 15–16).

- [ ] **Step 9: Коммит**

```bash
git add -A frontend/src
git commit -m "feat(front): доска — страница пула с двухрядной шапкой, без селектора направления и ряда банка" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 14: Боковая панель настроек (`SettingsMenu` → drawer)

**Files:**
- Modify: `frontend/src/components/SettingsMenu.tsx` (полная замена)
- Modify: `frontend/src/styles.css` (`.settings__pop` → `.setdrawer`)

**Interfaces:**
- Produces: `DisplaySettings` + `theme: "light" | "dark"; onToggleTheme(); onShowHelp(); bankHref: string`. Разметка: `.setdrawer` (фиксирована слева), секции `.settings__group` с `.settings__title`, чипы `.tb__toggle`; тема — чип `.themebtn`; справка — `.setdrawer__act.helpbtn`; ссылка «Банк вопросов →» на страницу банка.

- [ ] **Step 1: Файл целиком**

```tsx
import { useEffect } from "react";

// Боковая панель настроек (⚙ в шапке доски), выезжает слева — справа живут фильтры
// и drawer вопроса. Шапка оставляет себе ход интервью; всё, что настраивают редко —
// оформление, тема, холст, панели, справка — собрано здесь. Работа с банком — отдельная
// страница (#/bank/<pool>), отсюда на неё только ссылка.
//
// `.tb__toggle`, `.themebtn`, `.helpbtn` сохранены — на них ходит smoke.mjs.
// Закрывается по ✕, Esc и клику вне; Esc глушится в capture-фазе (иначе снимет
// выделение вопроса), mousedown слушаем в capture-фазе (канва React Flow гасит всплытие)
// и не считаем «мимо» клики внутри .settings (панель + кнопка ⚙).

export type DisplaySettings = {
  design: string;
  onSetDesign: (id: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  bgDots: boolean;
  onToggleBgDots: () => void;
  guidesV: boolean;
  onToggleGuidesV: () => void;
  guidesH: boolean;
  onToggleGuidesH: () => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  hiddenCount: number;
  showTimer: boolean;
  onToggleTimer: () => void;
  onShowHelp: () => void;
  bankHref: string;
};

// Оформления доски — итог design-funnel (номера сквозные из воронки).
const DESIGNS: [string, string][] = [
  ["37", "Брутализм в цвете"],
  ["56", "Атлас"],
  ["57", "Полевой журнал"],
  ["58", "Изыскания"],
];

function Chip({ on, onClick, title, className = "", children }: {
  on: boolean; onClick: () => void; title?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <button className={`tb__toggle ${className} ${on ? "tb__toggle--on" : ""}`} onClick={onClick} aria-pressed={on} title={title}>
      {children}
    </button>
  );
}

export function SettingsMenu({ settings: s, onClose }: { settings: DisplaySettings; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(".settings")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onDown, { capture: true });
    };
  }, [onClose]);

  return (
    <div className="setdrawer" role="dialog" aria-label="Настройки" aria-modal="false">
      <div className="setdrawer__head">
        <strong>Настройки</strong>
        <button className="setdrawer__close" onClick={onClose} title="Закрыть (Esc)">✕</button>
      </div>

      <div className="settings__group">
        <div className="settings__title">Оформление</div>
        <div className="settings__chips" role="radiogroup" aria-label="Оформление доски">
          {DESIGNS.map(([id, label]) => (
            <button key={id} className={`tb__toggle ${s.design === id ? "tb__toggle--on" : ""}`}
              onClick={() => s.onSetDesign(id)} role="radio" aria-checked={s.design === id}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Тема</div>
        <div className="settings__chips">
          <Chip className="themebtn" on={s.theme === "dark"} onClick={s.onToggleTheme} title="Выбор запоминается">Тёмная тема</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Холст</div>
        <div className="settings__chips" role="group" aria-label="Отображение холста">
          <Chip on={s.bgDots} onClick={s.onToggleBgDots}>Точки на фоне</Chip>
          <Chip on={s.guidesV} onClick={s.onToggleGuidesV} title="Границы блоков">Вертикальные направляющие</Chip>
          <Chip on={s.guidesH} onClick={s.onToggleGuidesH} title="Уровни Base / Junior / Middle / Senior">Горизонтальные направляющие</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Панели</div>
        <div className="settings__chips" role="group" aria-label="Панели">
          <Chip on={s.agendaOpen} onClick={s.onToggleAgenda} title="Сайдбар со списком вопросов">Агенда</Chip>
          <Chip on={s.showHidden} onClick={s.onToggleHidden} title="Показывать вопросы, убранные с доски">
            Скрытые вопросы{s.hiddenCount ? ` (${s.hiddenCount})` : ""}
          </Chip>
          <Chip on={s.showTimer} onClick={s.onToggleTimer} title="Время на вопрос и на сессию в нижней панели">Таймер</Chip>
        </div>
      </div>

      <div className="settings__group">
        <div className="settings__title">Банк вопросов</div>
        <a className="setdrawer__act" href={s.bankHref}>Открыть банк направления →</a>
      </div>

      <div className="settings__group">
        <div className="settings__title">Справка</div>
        <button className="setdrawer__act helpbtn" onClick={() => { onClose(); s.onShowHelp(); }}>Горячие клавиши</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Стили** — в `styles.css` заменить блок `.settings__pop { … }` на:

```css
.setdrawer {
  position: fixed; left: 0; top: 0; bottom: 0; z-index: 45; width: 304px; max-width: 88vw;
  display: flex; flex-direction: column; gap: 18px; padding: 16px; overflow-y: auto;
  background: var(--surface); color: var(--text);
  border-right: 1px solid var(--border); box-shadow: 0 0 40px var(--shadow-strong);
}
.setdrawer__head { display: flex; align-items: center; justify-content: space-between; }
.setdrawer__close { padding: 2px 8px; line-height: 1; }
.setdrawer__act {
  display: block; width: 100%; text-align: left; padding: 8px 10px; text-decoration: none;
  border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font: inherit;
}
.setdrawer__act:hover { background: var(--hover); }
```

`.settings { position: relative; display: inline-flex; }` оставить.

- [ ] **Step 3: Проверить типы** — `npx tsc --noEmit -p tsconfig.json 2>&1 | grep SettingsMenu || echo "чисто"`.

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/components/SettingsMenu.tsx frontend/src/styles.css
git commit -m "feat(front): настройки — боковая панель с темой и справкой" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 15: Главное меню и страница банка

**Files:**
- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/components/AddQuestionModal.tsx` (форма «Новый вопрос» из бывшего `App.tsx`)
- Create: `frontend/src/pages/BankPage.tsx`
- Modify: `frontend/src/components/UploadModal.tsx` (+`pool`)
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `PoolConfig`, `href`, `BankBrowser` с `embedded`, `downloadBank(nodes, pool)`, `api.createNode({ pool, … })`, `api.importFile(pool, …)`.
- Produces:
  ```tsx
  <HomePage pools={PoolConfig[]} notice?={string} />
  <BankPage pool={PoolConfig} onChanged={() => void} />
  <AddQuestionModal pool={PoolConfig} onClose={() => void} onCreated={(id: string) => void} />
  <UploadModal pool={string} onClose onImported />
  ```

- [ ] **Step 1: `HomePage.tsx`**

```tsx
import { href } from "../router";
import type { PoolConfig } from "../types";

// Главное меню: направления как входы на доски + разделы (кандидаты, сессии, подключение).
// Пулов может не быть вовсе (content/ без pool.yaml) — говорим об этом, а не рисуем пустоту.
export function HomePage({ pools, notice }: { pools: PoolConfig[]; notice?: string }) {
  return (
    <div className="page home">
      <header className="pageshell">
        <h1 className="pageshell__title">Интервью · доска вопросов</h1>
      </header>
      <main className="page__body">
        {notice && <div className="errbar">{notice}</div>}

        <h2 className="home__h2">Направления</h2>
        {pools.length === 0 ? (
          <p className="muted">Нет ни одного пула: положите каталог с `pool.yaml` в `content/`.</p>
        ) : (
          <div className="home__pools">
            {pools.map((p) => (
              <a key={p.id} className="poolcard" href={href.board(p.id)} data-pool={p.id}>
                <div className="poolcard__label">{p.label}</div>
                {p.description && <div className="poolcard__desc">{p.description}</div>}
                <div className="poolcard__meta">
                  {p.counts?.nodes ?? 0} вопросов · {p.counts?.sessions ?? 0} сессий
                </div>
                <div className="poolcard__blocks">
                  {p.blocks.map((b) => (
                    <span key={b.id} className="poolcard__block" style={{ background: b.color }}>{b.label}</span>
                  ))}
                </div>
                <span className="poolcard__bank" onClick={(e) => { e.preventDefault(); window.location.hash = href.bank(p.id); }}>
                  банк вопросов →
                </span>
              </a>
            ))}
          </div>
        )}

        <h2 className="home__h2">Разделы</h2>
        <div className="home__sections">
          <a className="menucard" href={href.candidates}>
            <strong>Кандидаты</strong>
            <span>Справочник кандидатов и интервьюеров</span>
          </a>
          <a className="menucard" href={href.sessions}>
            <strong>Сессии</strong>
            <span>Все проведённые интервью, отчёты</span>
          </a>
          <a className="menucard" href={href.connect}>
            <strong>Подключение</strong>
            <span>Присоединиться к идущей live-сессии</span>
          </a>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: `AddQuestionModal.tsx`** — перенести JSX модалки из бывшего `App.tsx` (блок `{addOpen && (<div className="modal" …>…</div>)}`) в компонент со своим черновиком:

```tsx
import { useState } from "react";
import { api } from "../api";
import { DIFFS } from "../layout";
import { blockLabel, blockOrder, type PoolConfig } from "../types";

const EMPTY = { block: "", topic: "", difficulty: "middle", kind: "question", title: "", question: "", answer: "", tags: "" };

// Модалка «Новый вопрос» (question-management): POST /api/nodes в пул страницы банка.
export function AddQuestionModal({ pool, onClose, onCreated }: {
  pool: PoolConfig; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [d, setD] = useState({ ...EMPTY, block: blockOrder(pool)[0] ?? "" });
  const create = async () => {
    let res: { id: string };
    try {
      res = await api.createNode({
        pool: pool.id,
        block: d.block,
        topic: d.topic.trim(),
        difficulty: d.difficulty as "base" | "junior" | "middle" | "senior",
        kind: d.kind as "question" | "task",
        title: d.title.trim() || undefined,
        question: d.question,
        answer: d.answer,
        tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
    } catch {
      alert("Не удалось создать вопрос");
      return;
    }
    onCreated(res.id);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card addform" onClick={(e) => e.stopPropagation()}>
        <h3>Новый вопрос · {pool.label}</h3>
        <div className="addform__row">
          <label className="drawer__field">
            Блок
            <select value={d.block} onChange={(e) => setD({ ...d, block: e.target.value })}>
              {blockOrder(pool).map((b) => <option key={b} value={b}>{blockLabel(pool, b)}</option>)}
            </select>
          </label>
          <label className="drawer__field">
            Тема
            <input value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} placeholder="например, sql" />
          </label>
        </div>
        <div className="addform__row">
          <label className="drawer__field">
            Сложность
            <select value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value })}>
              {DIFFS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="drawer__field">
            Тип
            <select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>
              <option value="question">вопрос</option>
              <option value="task">задача</option>
            </select>
          </label>
        </div>
        <label className="drawer__field">Заголовок<input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="drawer__field">{d.kind === "task" ? "Задача" : "Вопрос"}
          <textarea rows={3} value={d.question} onChange={(e) => setD({ ...d, question: e.target.value })} /></label>
        <label className="drawer__field">{d.kind === "task" ? "Эталон / решение" : "Ответ"}
          <textarea rows={5} value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} /></label>
        <label className="drawer__field">Теги (через запятую)<input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></label>
        <div className="addform__btns">
          <button className="btn--primary" onClick={create} disabled={!d.topic.trim() || !d.question.trim()}>Создать</button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `UploadModal.tsx`** — props `{ pool: string; onClose; onImported }`; вызов `api.importFile(file.name, text)` (внутри `handleFiles`) → `api.importFile(pool, file.name, text)`.

- [ ] **Step 4: `BankPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { AddQuestionModal } from "../components/AddQuestionModal";
import { BankBrowser } from "../components/BankBrowser";
import { UploadModal } from "../components/UploadModal";
import { downloadBank } from "../report";
import type { PoolConfig, QNode } from "../types";
import { PageShell } from "./PageShell";

// Банк вопросов направления как страница: просмотр (BankBrowser embedded) + правки контента.
export function BankPage({ pool, onChanged }: { pool: PoolConfig; onChanged: () => void }) {
  const [nodes, setNodes] = useState<QNode[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(
    () => api.graph(pool.id).then((g) => setNodes(g.nodes)).catch(() => setNodes([])),
    [pool.id],
  );
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChanged(); };

  return (
    <PageShell
      title={`Банк вопросов · ${pool.label}`}
      actions={
        <>
          <button className="iconbtn addbtn" onClick={() => setAddOpen(true)}>Добавить вопрос</button>
          <button className="iconbtn uploadbtn" onClick={() => setUploadOpen(true)}>Загрузить файл</button>
          <button className="iconbtn bankbtn" onClick={() => downloadBank(nodes, pool)} disabled={!nodes.length}>Скачать HTML</button>
        </>
      }
    >
      <BankBrowser nodes={nodes} pool={pool} embedded />
      {addOpen && <AddQuestionModal pool={pool} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); changed(); }} />}
      {uploadOpen && <UploadModal pool={pool.id} onClose={() => setUploadOpen(false)} onImported={changed} />}
    </PageShell>
  );
}
```

- [ ] **Step 5: Стили** — добавить в `styles.css`:

```css
/* ---- главное меню ---- */
.home__h2 { margin: 18px 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
.home__pools { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.poolcard {
  display: flex; flex-direction: column; gap: 8px; padding: 16px; text-decoration: none; color: var(--text);
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
}
.poolcard:hover { background: var(--hover); }
.poolcard__label { font-size: 18px; font-weight: 800; color: var(--heading); }
.poolcard__desc { font-size: 13px; color: var(--text-muted); }
.poolcard__meta { font-size: 12px; color: var(--text-faint); }
.poolcard__blocks { display: flex; flex-wrap: wrap; gap: 4px; }
.poolcard__block { font-size: 11px; color: #fff; padding: 1px 7px; border-radius: 4px; }
.poolcard__bank { margin-top: 4px; font-size: 12px; color: var(--accent); }
.home__sections { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.menucard {
  display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; text-decoration: none; color: var(--text);
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
}
.menucard:hover { background: var(--hover); }
.menucard span { font-size: 13px; color: var(--text-muted); }
/* банк как страница: без fixed-оверлея */
.bankbrowser--embedded { position: static; inset: auto; height: auto; min-height: 60vh; }
```

Уточнить по факту, что `.bankbrowser` в `styles.css` задаёт `position: fixed; inset: 0` (строка ~500) — `--embedded` обязан это перебить; при другой структуре правило подправить, чтобы embedded-режим не перекрывал `.pageshell`.

- [ ] **Step 6: Типы** — `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "HomePage|BankPage|AddQuestionModal|UploadModal" || echo "чисто"`.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/pages/HomePage.tsx frontend/src/pages/BankPage.tsx frontend/src/components/AddQuestionModal.tsx frontend/src/components/UploadModal.tsx frontend/src/styles.css
git commit -m "feat(front): главное меню с направлениями и страница банка вопросов" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 16: Страницы кандидатов, сессий и подключения

**Files:**
- Create: `frontend/src/sessionUtils.ts` (`scoresOf`, `notesOf` — вынести из `BoardPage.tsx`, там импортировать)
- Create: `frontend/src/pages/CandidatesPage.tsx`, `SessionsPage.tsx`, `ConnectPage.tsx`
- Modify: `frontend/src/styles.css` (таблицы и формы страниц)

**Interfaces:**
- Consumes: `api.listCandidates/createCandidate/updateCandidate/listInterviewers/createInterviewer/listSessions/getSession/graph`, `downloadReport(candidate, nodes, scores, pool, notes, people)`, `href`.
- Produces: `<CandidatesPage pools/>`, `<SessionsPage pools/>`, `<ConnectPage pools/>`; `scoresOf(s)`, `notesOf(s)`.

- [ ] **Step 1: `sessionUtils.ts`** — перенести из `BoardPage.tsx` функции `scoresOf` и `notesOf` без изменений с `export`; в `BoardPage.tsx` заменить их определения на `import { notesOf, scoresOf } from "../sessionUtils";`.

- [ ] **Step 2: `CandidatesPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api";
import { href } from "../router";
import type { Candidate, Interviewer, PoolConfig, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

const EMPTY_C = { name: "", position: "", seniority: "", contact: "", note: "" };
const EMPTY_I = { name: "", role: "", email: "" };

// Справочник людей: кандидаты (с их сессиями по направлениям) и интервьюеры. Общие для всех пулов.
export function CandidatesPage({ pools }: { pools: PoolConfig[] }) {
  const [cands, setCands] = useState<Candidate[]>([]);
  const [ivs, setIvs] = useState<Interviewer[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [draft, setDraft] = useState(EMPTY_C);
  const [ivDraft, setIvDraft] = useState(EMPTY_I);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState(EMPTY_C);

  const load = () => {
    api.listCandidates().then(setCands).catch(() => setCands([]));
    api.listInterviewers().then(setIvs).catch(() => setIvs([]));
    api.listSessions().then(setSessions).catch(() => setSessions([]));
  };
  useEffect(load, []);

  const poolLabel = (id: string) => pools.find((p) => p.id === id)?.label ?? id;
  const clean = (o: typeof EMPTY_C) => ({
    name: o.name.trim(),
    position: o.position.trim() || undefined,
    seniority: o.seniority.trim() || undefined,
    contact: o.contact.trim() || undefined,
    note: o.note.trim() || undefined,
  });

  const addCandidate = async () => {
    if (!draft.name.trim()) return;
    await api.createCandidate(clean(draft));
    setDraft(EMPTY_C);
    load();
  };
  const saveEdit = async () => {
    if (editId == null || !edit.name.trim()) return;
    await api.updateCandidate(editId, clean(edit));
    setEditId(null);
    load();
  };
  const addInterviewer = async () => {
    if (!ivDraft.name.trim()) return;
    await api.createInterviewer({ name: ivDraft.name.trim(), role: ivDraft.role.trim() || undefined, email: ivDraft.email.trim() || undefined });
    setIvDraft(EMPTY_I);
    load();
  };

  return (
    <PageShell title="Кандидаты и интервьюеры">
      <h2 className="home__h2">Кандидаты · {cands.length}</h2>
      <div className="formrow">
        <input placeholder="Имя" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input placeholder="Позиция" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
        <input placeholder="Грейд" value={draft.seniority} onChange={(e) => setDraft({ ...draft, seniority: e.target.value })} />
        <input placeholder="Контакт" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
        <button className="btn--primary cand-add" onClick={addCandidate} disabled={!draft.name.trim()}>Добавить</button>
      </div>
      <table className="table">
        <thead><tr><th>Имя</th><th>Позиция</th><th>Грейд</th><th>Контакт</th><th>Сессии</th><th></th></tr></thead>
        <tbody>
          {cands.map((c) =>
            editId === c.id ? (
              <tr key={c.id} className="table__edit">
                <td><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                <td><input value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} /></td>
                <td><input value={edit.seniority} onChange={(e) => setEdit({ ...edit, seniority: e.target.value })} /></td>
                <td><input value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></td>
                <td />
                <td><button className="btn--primary" onClick={saveEdit}>Сохранить</button> <button onClick={() => setEditId(null)}>Отмена</button></td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.position ?? "—"}</td><td>{c.seniority ?? "—"}</td><td>{c.contact ?? "—"}</td>
                <td>
                  {sessions.filter((s) => s.candidate_id === c.id).map((s) => (
                    <a key={s.id} className="table__link" href={href.board(s.pool, s.id)}>{poolLabel(s.pool)} · {s.created_at.slice(0, 10)}</a>
                  ))}
                </td>
                <td><button onClick={() => { setEditId(c.id); setEdit({ name: c.name, position: c.position ?? "", seniority: c.seniority ?? "", contact: c.contact ?? "", note: c.note ?? "" }); }}>Изменить</button></td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <h2 className="home__h2">Интервьюеры · {ivs.length}</h2>
      <div className="formrow">
        <input placeholder="Имя" value={ivDraft.name} onChange={(e) => setIvDraft({ ...ivDraft, name: e.target.value })} />
        <input placeholder="Роль" value={ivDraft.role} onChange={(e) => setIvDraft({ ...ivDraft, role: e.target.value })} />
        <input placeholder="Email" value={ivDraft.email} onChange={(e) => setIvDraft({ ...ivDraft, email: e.target.value })} />
        <button className="btn--primary" onClick={addInterviewer} disabled={!ivDraft.name.trim()}>Добавить</button>
      </div>
      <table className="table">
        <thead><tr><th>Имя</th><th>Роль</th><th>Email</th></tr></thead>
        <tbody>{ivs.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.role ?? "—"}</td><td>{i.email ?? "—"}</td></tr>)}</tbody>
      </table>
    </PageShell>
  );
}
```

Проверить в `types.ts`, что `Candidate` содержит `position/seniority/contact/note` (опциональные строки) и `SessionMeta` — `candidate_id`, `pool`, `created_at`; если `SessionMeta` не несёт `candidate_id`, добавить `candidate_id?: number | null;`.

- [ ] **Step 3: `SessionsPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api";
import { downloadReport } from "../report";
import { href } from "../router";
import { notesOf, scoresOf } from "../sessionUtils";
import type { Interviewer, PoolConfig, Session, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

// Все сессии всех направлений: открыть на доске или скачать отчёт. «Оценено» — из детали
// сессии (одна подгрузка на строку; для локального инструмента это дёшево).
export function SessionsPage({ pools }: { pools: PoolConfig[] }) {
  const [rows, setRows] = useState<SessionMeta[]>([]);
  const [details, setDetails] = useState<Record<number, Session>>({});
  const [ivs, setIvs] = useState<Interviewer[]>([]);

  useEffect(() => {
    api.listSessions().then(async (list) => {
      setRows(list);
      const full = await Promise.all(list.map((s) => api.getSession(s.id).catch(() => null)));
      setDetails(Object.fromEntries(full.filter((s): s is Session => !!s).map((s) => [s.id, s])));
    }).catch(() => setRows([]));
    api.listInterviewers().then(setIvs).catch(() => setIvs([]));
  }, []);

  const poolOf = (id: string) => pools.find((p) => p.id === id);
  const report = async (s: SessionMeta) => {
    const pool = poolOf(s.pool);
    const full = details[s.id];
    if (!pool || !full) return;
    const nodes = (await api.graph(pool.id)).nodes;
    const iv = ivs.find((i) => i.id === full.interviewer_id);
    downloadReport(full.candidate, nodes, scoresOf(full), pool, notesOf(full), { interviewer: iv?.name ?? null, position: null, seniority: null });
  };

  return (
    <PageShell title="Сессии">
      <table className="table sessions">
        <thead><tr><th>Направление</th><th>Кандидат</th><th>Интервьюер</th><th>Дата</th><th>Оценено</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const pool = poolOf(s.pool);
            const scored = details[s.id] ? Object.keys(details[s.id].scores).length : null;
            return (
              <tr key={s.id} data-session={s.id}>
                <td>{pool?.label ?? s.pool}</td>
                <td>{s.candidate}</td>
                <td>{ivs.find((i) => i.id === s.interviewer_id)?.name ?? "—"}</td>
                <td>{s.created_at.slice(0, 16).replace("T", " ")}</td>
                <td>{scored == null ? "…" : `${scored} / ${pool?.counts?.nodes ?? "?"}`}</td>
                <td>
                  <a className="iconbtn" href={href.board(s.pool, s.id)}>Открыть</a>{" "}
                  <button className="iconbtn" onClick={() => report(s)} disabled={!details[s.id] || scored === 0}>Отчёт</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Сессий пока нет — начните интервью с доски направления.</p>}
    </PageShell>
  );
}
```

Проверить, что `SessionMeta` в `types.ts` содержит `interviewer_id?: number | null` (иначе добавить).

- [ ] **Step 4: `ConnectPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api";
import { href } from "../router";
import type { PoolConfig, SessionMeta } from "../types";
import { PageShell } from "./PageShell";

// Подключение к идущей сессии (второй интервьюер / HR): выбор из последних сессий →
// доска нужного направления с ?session=, где SSE подтянет оценки.
export function ConnectPage({ pools }: { pools: PoolConfig[] }) {
  const [rows, setRows] = useState<SessionMeta[]>([]);
  useEffect(() => { api.listSessions().then(setRows).catch(() => setRows([])); }, []);
  const label = (id: string) => pools.find((p) => p.id === id)?.label ?? id;
  return (
    <PageShell title="Подключиться к сессии">
      <p className="muted">Откроется доска направления с оценками этой сессии; дальнейшие оценки синхронизируются live.</p>
      <div className="home__sections">
        {rows.slice(0, 30).map((s) => (
          <a key={s.id} className="menucard" href={href.board(s.pool, s.id)}>
            <strong>{s.candidate}</strong>
            <span>{label(s.pool)} · {s.created_at.slice(0, 16).replace("T", " ")}</span>
          </a>
        ))}
      </div>
      {rows.length === 0 && <p className="muted">Нет сессий, к которым можно подключиться.</p>}
    </PageShell>
  );
}
```

- [ ] **Step 5: Стили** — добавить в `styles.css`:

```css
/* ---- таблицы и формы страниц ---- */
.formrow { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
.formrow input { padding: 6px 10px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text); }
.table { width: 100%; border-collapse: collapse; font-size: 14px; background: var(--surface); border: 1px solid var(--border); }
.table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
.table th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); }
.table__link { display: block; font-size: 12px; color: var(--accent); text-decoration: none; }
.table__edit input { width: 100%; padding: 4px 6px; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--surface); color: var(--text); }
a.iconbtn { text-decoration: none; display: inline-block; }
```

- [ ] **Step 6: Полная сборка фронта**

Run: `cd frontend && npm run build`
Expected: `✓ built` без ошибок типов — это первая точка, где весь фронт собирается.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src
git commit -m "feat(front): страницы кандидатов, сессий и подключения к live-сессии" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 17: Smoke, витринные скриншоты, уборка заглушек, документация

**Files:**
- Modify: `frontend/smoke.mjs`
- Modify: `frontend/shots.mjs`
- Modify: `backend/app/main.py`, `backend/tests/test_app.py` (удалить `/api/tracks`, `/api/weights` и их тесты)
- Modify: `README.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: Бэкенд — снять заглушки**

В `main.py` удалить ручки `get_weights` и `get_tracks` (с комментарием «PR 1: заглушки…»); из импортов убрать `block_weights`, если больше нигде не используется (в `make_interview` используется — оставить). В `test_app.py` удалить `test_api_tracks_stub_mirrors_pools` и `test_api_weights_stub_is_default_pool_weights`. Run: `cd backend && pytest -q` → зелёный.

- [ ] **Step 2: `smoke.mjs` — вход через меню**

После логина (блок «0. auth-identity …») перед «1. Граф отрисовался» вставить:

```js
// 0b. Главное меню (pools-main-menu): направления как входы; клик по DE открывает доску.
await page.waitForSelector(".poolcard", { timeout: 10000 });
const poolCards = await page.locator(".poolcard").count();
if (poolCards < 1) fail("main menu shows no pools");
const deCard = page.locator('.poolcard[data-pool="data-engineer"]');
if ((await deCard.count()) !== 1) fail("data-engineer pool card missing on main menu");
await deCard.click();
await page.waitForFunction(() => location.hash.startsWith("#/board/data-engineer"), null, { timeout: 5000 });
console.log(`OK: main menu lists ${poolCards} pool(s), DE opens the board`);
```

Хелперы `toggleSetting` и все `.settings__pop` → `.setdrawer`. Шаг 8 (тема):

```js
const before = await page.evaluate(() => document.documentElement.dataset.theme || "light");
await page.locator(".setbtn").click();
await page.waitForSelector(".setdrawer", { timeout: 3000 });
await page.locator(".setdrawer .themebtn").click();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
```

Шаги банка (12 — `.bankbtn`, 14 — `.uploadbtn`, 16 — `.bankscreenbtn`, 18 — `.addbtn`) теперь живут на странице банка. Перед шагом 12 вставить переход и после шага 18 — возврат:

```js
// Работа с банком — страница #/bank/<pool> (pools-main-menu).
await page.goto(URL + "#/bank/data-engineer", { waitUntil: "load" });
await page.waitForSelector(".bankbrowser--embedded", { timeout: 10000 });
```

и заменить: `page.locator(".contentbar .bankscreenbtn").click()` + ожидание `.bankbrowser` → просто `await page.waitForSelector(".bankbrowser--embedded")` (экран уже открыт; проверки поиска/раскрытия строк остаются); закрытие по Esc (шаг 16, «bank screen closes on Esc») удалить — страница не закрывается. После шага 18 (добавление вопроса; проверку «доска растёт» заменить на проверку `.bankrow` +1) вернуться на доску:

```js
await page.goto(URL + "#/board/data-engineer", { waitUntil: "load" });
await page.waitForSelector(".qnode", { timeout: 10000 });
```

Шаг 17 (структура шапки):

```js
// 17. pools-main-menu: шапка доски — два ряда, «← Меню», название направления, ⚙; банка в шапке нет.
const topRows = await page.locator(".topbar > .topbar__row").count();
if (topRows !== 2) fail(`expected 2 topbar rows, got ${topRows}`);
if ((await page.locator(".topbar .topbar__back").count()) !== 1) fail("back-to-menu link missing");
if (!(await page.locator(".topbar .appname").innerText()).includes("Дата-инженер")) fail("pool label missing in topbar");
if ((await page.locator(".topbar .setbtn").count()) !== 1) fail("settings button missing in topbar");
if ((await page.locator(".topbar .addbtn, .topbar .bankbtn, .topbar .themebtn").count()) !== 0) fail("bank/theme buttons must leave the topbar");
console.log(`OK: board topbar (${topRows} rows, back link, pool label, settings)`);
```

Новые шаги в конце (перед итоговым `ALL SMOKE CHECKS PASSED`):

```js
// 20. Сессии: созданная ранее сессия «Cmp Bot» видна на странице сессий с направлением.
await page.goto(URL + "#/sessions", { waitUntil: "load" });
await page.waitForSelector(".table.sessions", { timeout: 10000 });
const sessRows = await page.locator(".table.sessions tbody tr").count();
if (sessRows < 1) fail("sessions page is empty");
const sessText = await page.locator(".table.sessions").innerText();
if (!sessText.includes("Cmp Bot") || !sessText.includes("Дата-инженер")) fail(`sessions page missing candidate/pool: ${sessText.slice(0, 120)}`);
console.log(`OK: sessions page lists ${sessRows} session(s) with pool label`);

// 21. Кандидаты: справочник открывается, кандидат из сессии в списке.
await page.goto(URL + "#/candidates", { waitUntil: "load" });
await page.waitForSelector(".table", { timeout: 10000 });
if (!(await page.locator(".table").first().innerText()).includes("Cmp Bot")) fail("candidate missing on candidates page");
console.log("OK: candidates page lists session candidate");

// 22. Неизвестный пул в адресе → меню с пометкой, без падения.
await page.goto(URL + "#/board/nope", { waitUntil: "load" });
await page.waitForSelector(".poolcard", { timeout: 10000 });
if ((await page.locator(".errbar").count()) !== 1) fail("unknown pool should show a notice on the menu");
console.log("OK: unknown pool falls back to menu");
```

Если в контенте есть пул `system-analyst` (PR 3), добавить шаг:

```js
// 23. Второй пул рисует СВОИ колонки (независимый пул, не фильтр).
if (await page.locator('.poolcard[data-pool="system-analyst"]').count()) {
  await page.goto(URL + "#/board/system-analyst", { waitUntil: "load" });
  await page.waitForSelector(".bgroup__header", { timeout: 10000 });
  const heads = await page.locator(".bgroup__header").allInnerTexts();
  if (!heads.some((h) => h.includes("Требования"))) fail(`SA board lacks its own blocks: ${heads.join(" | ")}`);
  console.log(`OK: system-analyst board has its own blocks (${heads.length})`);
}
```

Шаг 5c (треки) уже удалён в Task 8. Проверка «`.iv-pick` присутствует» остаётся.

- [ ] **Step 3: `shots.mjs`**

В `open(theme, query)`: второй `goto` → `` await page.goto(`${BASE}/#/board/data-engineer${query}`, { waitUntil: "domcontentloaded" }); `` (query теперь начинается с `?session=`). Шаг банка: `await page.locator(".contentbar .bankscreenbtn").click();` → `await page.goto(BASE + "/#/bank/data-engineer", { waitUntil: "domcontentloaded" });` и ожидание `.bankbrowser--embedded`. Добавить кадр меню перед доской: `await page.goto(BASE + "/#/", …); await page.waitForSelector(".poolcard"); await shot(page, "00-menu.png");` и включить `00-menu.png` первым в README-таблицу (при следующей пересъёмке).

- [ ] **Step 4: Документация**

`README.md`: в «Быстрый старт» после строки про вход добавить «Открывается главное меню: направления (доски), Кандидаты, Сессии, Подключение; банк вопросов — по направлению». В «Управление во время интервью» убрать упоминания селекта «Направление» и кнопки темы в шапке («Тема — в ⚙ → Тема»). В таблице API убрать `/api/weights` (уже заменён в Task 7). `CLAUDE.md` «Архитектура/Фронт»: `App.tsx` → `pages/BoardPage.tsx` («доска пула: состояние, buildNodes, шапка, панель ⚙»), добавить `router.ts`/`Router.tsx` («hash-роутер: #/, #/board/<pool>, #/bank/<pool>, #/candidates, #/sessions, #/connect») и `pages/` (`HomePage`, `BankPage`, `CandidatesPage`, `SessionsPage`, `ConnectPage`); `types.ts` — «`PoolConfig` + `blockOrder/blockLabel/blockColor/subLabel` вместо констант». В «Граблях»: «Новый тип ноды на канве = регистрация в `nodeTypes` (BoardPage.tsx)». `AGENTS.md` — те же замены путей.

- [ ] **Step 5: Коммит**

```bash
git add frontend/smoke.mjs frontend/shots.mjs backend/app/main.py backend/tests/test_app.py README.md CLAUDE.md AGENTS.md
git commit -m "chore(pools): smoke и витрина через меню, заглушки tracks/weights удалены, документация" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
```

---

### Task 18: Проверка PR 2 — контейнер, smoke, матрица скриншотов, PR

- [ ] **Step 1: Бэкенд и фронт**

Run: `cd backend && . .venv/bin/activate && pytest -q && cd ../frontend && npm run build`
Expected: pytest зелёный, `✓ built`.

- [ ] **Step 2: Контейнер и smoke**

```bash
cd /Users/user/dev/projects/personal/interview-graph
docker compose build --no-cache 2>&1 | grep -E "^ Image|ERROR"
docker compose up -d
for i in $(seq 1 40); do st=$(docker inspect -f '{{.State.Health.Status}}' interview-graph 2>/dev/null || echo нет); [ "$st" = healthy ] && break; sleep 2; done; echo "health: $st"
echo "локально: $(basename $(ls frontend/dist/assets/*.js))"; echo "в контейнере: $(docker compose exec -T interview sh -c 'basename /app/frontend/dist/assets/*.js')"   # хеши должны совпасть
cd frontend && SMOKE_OWNER_EMAIL=admin SMOKE_OWNER_PASSWORD=admin npm run smoke 2>&1 | tail -3
```
Expected: `ALL SMOKE CHECKS PASSED ✓`.

- [ ] **Step 3: Матрица скриншотов** (playwright-скрипт во временном файле `frontend/.matrix.mjs`, удалить после):

Экраны: `#/`, `#/board/data-engineer` (общий вид по кнопке fitView и рабочий зум), `#/bank/data-engineer`, `#/sessions`, `#/candidates` × темы light/dark × вьюпорты 1280×800 и 390×844. Для каждого кадра: скриншот в scratchpad и проверка `document.body.scrollWidth <= document.documentElement.clientWidth` (нет горизонтального переполнения). Просмотреть кадры (Read) и посчитать контраст ключевых пар новых страниц (`.poolcard` текст/фон, `.table` текст/фон, `.pageshell__title`) по формуле WCAG — пороги 4.5 (текст), 3 (графика). Найденные дефекты чинить до PR, а не описывать.

- [ ] **Step 4: PR**

```bash
git push origin feature/pools-main-menu
gh pr create --base dev --head feature/pools-main-menu --title "Главное меню, доска как страница пула, банк/кандидаты/сессии (PR 2/3)" --body-file - <<'EOF'
Второй PR по спеку docs/superpowers/specs/2026-09-02-pools-and-main-menu-design.md.

Свой hash-роутер: #/ (меню с направлениями и разделами), #/board/<pool> (доска пула с двухрядной шапкой: «← Меню · направление · прогресс · ⚙» и ход интервью), #/bank/<pool> (банк: просмотр, добавить, загрузить, скачать), #/candidates, #/sessions, #/connect. Блоки, под-колонки и цвета берутся из pool.yaml; настройки — боковая панель ⚙ (оформление, тема, холст, панели, справка). Заглушки /api/tracks и /api/weights удалены. Локальное состояние доски — с префиксом пула.

Проверено: pytest, npm run build, smoke на контейнере (меню → доска → банк → сессии → кандидаты → неизвестный пул), матрица скриншотов обеих тем × 1280/390 без горизонтального переполнения.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7
EOF
```

---

# Часть 3 · PR 3 — стартовый пул «Системный аналитик»

### Task 19: `content/system-analyst/` — `pool.yaml` и стартовые вопросы

**Files:**
- Create: `content/system-analyst/pool.yaml`
- Create: 15 файлов `content/system-analyst/<block>/sa-*.md` (список ниже)
- Modify: `frontend/smoke.mjs` — шаг 23 из Task 17 срабатывает автоматически (пул появился)

**Interfaces:**
- Consumes: формат Markdown-ноды (`README.md` → «Формат Markdown»), теги — из 17 сквозных концептов (`AGENTS.md`).
- Produces: пул `system-analyst`, засеивается при старте (Task 5), виден в меню и на `#/board/system-analyst`.

- [ ] **Step 1: `pool.yaml`**

```yaml
# Стартовый пул «Системный аналитик»: каркас таксономии + сид из ~15 вопросов.
# Качество — стартовый набор, который правится через банк (#/bank/system-analyst).
id: system-analyst
label: Системный аналитик
description: Требования, моделирование процессов и данных, SQL, интеграции
blocks:
  - id: requirements
    label: Требования
    color: "#2563eb"
    weight: 35
    subblocks:
      - { id: elicitation,   label: Сбор }
      - { id: analysis,      label: Анализ и приоритизация }
      - { id: documentation, label: Документирование }
  - id: modeling
    label: Моделирование
    color: "#9333ea"
    weight: 25
    subblocks:
      - { id: process, label: Процессы (BPMN) }
      - { id: uml,     label: UML и структуры }
  - id: data
    label: Данные
    color: "#16a34a"
    weight: 25
    subblocks:
      - { id: sql,        label: SQL }
      - { id: data-model, label: Модель данных }
  - id: integration
    label: Интеграции
    color: "#d97706"
    weight: 15
```

- [ ] **Step 2: Вопросы** — каждый файл в формате:

```markdown
---
id: <id>
block: <block>
subblock: <subblock>          # у integration нет
kind: question
difficulty: <base|junior|middle|senior>
title: <заголовок>
topic: <topic>
weight: 5
tags: [<теги>]
---

## Вопрос
<текст>

## Ответ
<текст>
```

Состав (id · block/subblock · сложность · title · topic · теги · суть вопроса · опорные пункты ответа):

1. `sa-req-elicit-01` · requirements/elicitation · base · «Источники требований» · stakeholders · [domain] — откуда берутся требования (интервью, наблюдение, документы, конкуренты, инциденты); ответ: перечислить техники, когда какая уместна, риск «одного источника».
2. `sa-req-elicit-02` · requirements/elicitation · middle · «Интервью со стейкхолдером» · stakeholders · [domain, quality] — как готовиться и вести интервью, чтобы получить требования, а не пожелания; ответ: цели → открытые вопросы → примеры/кейсы → подтверждение резюме, «5 почему», фиксация ограничений.
3. `sa-req-analysis-01` · requirements/analysis · junior · «Функциональные и нефункциональные» · nfr · [architecture, quality] — различие, примеры NFR (производительность, доступность, безопасность), как NFR становятся измеримыми.
4. `sa-req-analysis-02` · requirements/analysis · senior · «Приоритизация при конфликте» · prioritization · [domain, architecture] — два стейкхолдера требуют противоположного; ответ: MoSCoW/WSJF/Kano как инструменты, но решение — через бизнес-цель и стоимость, эскалация с вариантами и последствиями.
5. `sa-req-doc-01` · requirements/documentation · junior · «User story и критерии приёмки» · user-stories · [quality] — формат «как … я хочу … чтобы …», критерии Given/When/Then, INVEST; когда story недостаточно.
6. `sa-req-doc-02` · requirements/documentation · middle · «Спецификация API для разработчиков» · api-spec · [architecture, quality] — что обязано быть в ТЗ на интеграцию: контракт (OpenAPI), коды ошибок, идемпотентность, лимиты, версии; ответ раскрывает каждую позицию.
7. `sa-model-process-01` · modeling/process · base · «Зачем BPMN» · bpmn · [domain] — что даёт схема процесса по сравнению с текстом, базовые элементы (события, задачи, шлюзы, дорожки).
8. `sa-model-process-02` · modeling/process · middle · «AS-IS → TO-BE» · bpmn · [domain, optimization] — как найти узкие места в текущем процессе и обосновать целевой; ответ: метрики (время цикла, ожидание, доработки), точки принятия решений, что автоматизировать первым.
9. `sa-model-uml-01` · modeling/uml · junior · «Диаграмма последовательности» · uml · [architecture] — когда нужна, что показывает (участники, сообщения, альтернативы), типичные ошибки (смешение уровней абстракции).
10. `sa-model-uml-02` · modeling/uml · senior · «Состояния сущности» · state-machine · [architecture, reliability] — заказ/заявка со сложным жизненным циклом; ответ: диаграмма состояний, инварианты переходов, кто владеет переходом, как отражать в БД и API.
11. `sa-data-sql-01` · data/sql · base · «JOIN и агрегаты для отчёта» · sql · [sql] — собрать отчёт из двух таблиц с группировкой; ответ: LEFT vs INNER, GROUP BY + HAVING, ловушка дублей при джойне «один-ко-многим».
12. `sa-data-sql-02` · data/sql · middle · «Проверка данных запросом» · sql · [sql, quality] — как SQL-запросами убедиться, что миграция/интеграция прошла корректно; ответ: сверка количеств, контрольные суммы, поиск сирот (LEFT JOIN … IS NULL), дубликатов по ключу.
13. `sa-data-model-01` · data/data-model · middle · «Нормализация и когда её нарушать» · data-modeling · [data-modeling] — 1НФ–3НФ на примере, осознанная денормализация для отчётов/чтения.
14. `sa-data-model-02` · data/data-model · senior · «Модель данных для новой фичи» · data-modeling · [data-modeling, architecture] — спроектировать сущности/связи под описанный сценарий (подписки с тарифами и историей); ответ: сущности, ключи, историчность (SCD2 / effective dates), что не класть в JSON.
15. `sa-integration-01` · integration · middle · «Синхронно или через очередь» · integration-style · [architecture, reliability] — выбор между REST-вызовом и событием; ответ: связность, гарантия доставки, идемпотентность потребителя, что делать при отказе второй стороны.

Каждый ответ — 6–12 предложений с конкретикой (термины, примеры), без воды; тон — как в существующих DE-вопросах (см. `content/data-engineer/databases/pg-joins-01.md`). Правки контента — через `python-frontmatter` (`frontmatter.dumps(post)`), а не ручным редактированием YAML (грабля из CLAUDE.md).

- [ ] **Step 3: Проверка импорта**

Run: `cd backend && . .venv/bin/activate && python -c "
from pathlib import Path
from app.pools import load_pools
from app.importer import load_pool_content
p = load_pools(Path('../content'))['system-analyst']
nodes, errors = load_pool_content(p)
print(len(nodes), 'нод;', 'ошибки:', errors)
"`
Expected: `15 нод; ошибки: []`. Затем `pytest -q` (тест `test_api_pools_*` по-прежнему зелёный).

- [ ] **Step 4: Контейнер, smoke (шаг 23), скриншоты SA-доски в обеих темах**

```bash
docker compose build --no-cache 2>&1 | grep -E "^ Image|ERROR" && docker compose up -d
docker compose logs interview | grep "seeded" | grep system-analyst     # seeded 15 nodes into pool system-analyst
cd frontend && SMOKE_OWNER_EMAIL=admin SMOKE_OWNER_PASSWORD=admin npm run smoke 2>&1 | grep -E "system-analyst|PASSED"
```

Снять `#/board/system-analyst` (light/dark, 1280) и `#/` с двумя карточками направлений; убедиться, что четыре колонки SA («Требования · Моделирование · Данные · Интеграции») и под-колонки читаются, плашки — на 700-ряде своих цветов.

- [ ] **Step 5: PR**

```bash
git add content/system-analyst
git commit -m "feat(content): стартовый пул «Системный аналитик» — pool.yaml и 15 вопросов" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7"
git push origin feature/pools-main-menu
gh pr create --base dev --head feature/pools-main-menu --title "Пул «Системный аналитик»: каркас и стартовый набор (PR 3/3)" --body-file - <<'EOF'
Третий PR по спеку docs/superpowers/specs/2026-09-02-pools-and-main-menu-design.md.

content/system-analyst/pool.yaml (Требования · Моделирование · Данные · Интеграции, свои под-колонки и веса) и 15 стартовых вопросов от base до senior с префиксом sa-. Пул засеивается при старте, появляется в меню и открывается как самостоятельная доска со своей таксономией — не фильтр над DE.

Качество вопросов — стартовый сид под правку через банк, не экспертный банк.

Проверено: импорт без ошибок, pytest, контейнер засеял пул, smoke (шаг «второй пул рисует свои колонки»), скриншоты SA-доски в обеих темах.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UCqjvFMuw2kws1B3cEWGm7
EOF
```

---

## Самопроверка плана по спеку

- **§1 Контент** — Task 2 (перенос + `pool.yaml` DE), Task 19 (SA). Правило «pool не пишется во frontmatter» — Task 3 (`data["pool"] = pool_id`). Уникальность id / префикс `sa-` — Task 19.
- **§2 Бэкенд** — `pools.py` Task 1; `models`/`importer` Task 3; `db` Task 4; `seed` + `/api/pools` + `graph?pool` + interview Task 5; сессии/импорт/ноды Task 6; удаление `tracks/weights` Task 17.
- **§3 Фронт** — типы/api Task 9; раскладка Task 10; компоненты/отчёт/плашки Task 11; роутер Task 12; доска + шапка + localStorage-префиксы Task 13; панель ⚙ Task 14; меню/банк Task 15; кандидаты/сессии/подключение Task 16.
- **§4 Инструменты** — скиллы и доки Task 7 и Task 17; smoke/shots Task 8 и Task 17.
- **§5 Проверка** — тесты в каждой задаче, матрица в Task 18, smoke-шаги 0b/17/20–23.
- **§6 Порядок** — PR 1 = Task 1–8, PR 2 = Task 9–18, PR 3 = Task 19.
- **Согласованность имён:** `load_pool_content(pool: PoolCfg)` (Task 3) используется в Task 5 (seed) и Task 19; `_pool_or_404` (Task 5) — в Task 6; `blockOrder/blockLabel/blockColor/subLabel` (Task 9) — в Task 10, 11, 13, 15; `href` (Task 12) — в Task 13–16; `BankBrowser` с `embedded` (Task 11) — в Task 15; `scoresOf/notesOf` из `sessionUtils` (Task 16) — в BoardPage и SessionsPage; `SettingsMenu.settings.bankHref/onShowHelp/theme/onToggleTheme` (Task 14) — в Task 13.
- **Известное допущение:** `count_sessions` (Task 4) вызывается в `/api/pools` (Task 5) — сигнатура `(tenant_id, pool)` в обоих местах.
