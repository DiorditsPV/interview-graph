#!/usr/bin/env python3
"""Пересобрать Q_IDEAS.txt: [x]-реестр из /api/graph (ground truth), сохранив [ ]-идеи.

Только stdlib. Нужен поднятый сервер. Запуск из любого места:
    python3 .claude/skills/interview-ideas/regen_ledger.py
Переменные окружения: API_URL (по умолч. http://127.0.0.1:8000/api), POOL=... (по умолч. data-engineer).
"""
import json
import os
import pathlib
import urllib.request

POOL = os.environ.get("POOL", "data-engineer")   # id пула (content/<pool>/)
API_BASE = os.environ.get("API_URL", "http://127.0.0.1:8000/api").rstrip("/")
GRAPH_URL = f"{API_BASE}/graph?pool={POOL}"
ROOT = pathlib.Path(__file__).resolve().parents[3]  # .../interview
QFILE = ROOT / "Q_IDEAS.txt"

DR = {"base": 0, "junior": 1, "middle": 2, "senior": 3}
GROUPS = [
    (("frameworks", "airflow"), "Airflow (frameworks/airflow):"),
    (("frameworks", "pyspark"), "PySpark (frameworks/pyspark):"),
    (("frameworks", "dbt"), "dbt (frameworks/dbt):"),
    (("frameworks", "streaming"), "Kafka / Streaming (frameworks/streaming):"),
    (("databases", "sql"), "SQL (databases/sql):"),
    (("databases", "dbms"), "СУБД и движки (databases/dbms):"),
    (("databases", "storage"), "Хранилища (databases/storage):"),
    (("databases", "formats"), "Форматы (databases/formats):"),
    (("python", ""), "Python (python):"),
    (("platform", ""), "Платформа (platform):"),
]


def gk(n):
    return (n["block"], n.get("subblock") or "")


def main():
    ns = json.load(urllib.request.urlopen(GRAPH_URL))["nodes"]
    out = [
        "Реестр вопросов интервью и идеи для новых.",
        "",
        "Легенда: [x] — сгенерирован (в скобках id ноды), [ ] — идея.",
        "Названия [x] сведены с заголовками (title) самих вопросов.",
        "",
    ]
    seen = set()
    for key, header in GROUPS:
        g = [n for n in ns if gk(n) == key]
        if not g:
            continue
        g.sort(key=lambda n: (DR.get(n["difficulty"], 9), n["id"]))
        out.append(header)
        for n in g:
            seen.add(n["id"])
            mark = " [задача]" if n["kind"] == "task" else ""
            out.append(f'- [x] {n.get("title") or n["id"]}{mark} — {n["difficulty"]} ({n["id"]})')
        out.append("")

    rest = [n for n in ns if n["id"] not in seen]
    if rest:
        out.append("Прочее:")
        for n in sorted(rest, key=lambda n: n["id"]):
            out.append(
                f'- [x] {n.get("title") or n["id"]} — {n["difficulty"]} ({n["id"]}) '
                f'[{n["block"]}/{n.get("subblock") or "-"}]'
            )
        out.append("")

    # сохранить текущие [ ]-идеи (строки + их заголовки-группы)
    old = QFILE.read_text(encoding="utf-8").splitlines() if QFILE.exists() else []
    pend = []
    for i, line in enumerate(old):
        if not line.strip().startswith("- [ ]"):
            continue
        j = i - 1
        while j >= 0 and not old[j].strip():
            j -= 1
        header = old[j] if j >= 0 else ""
        if header and not header.strip().startswith(("- [", "Легенда", "Реестр")):
            if header not in pend:
                pend += ["", header]
        pend.append(line)

    if pend:
        out.append("=== Идеи (ещё не сгенерированы) ===")
        out += [x for x in pend if x.strip()]
    else:
        out += [
            "Идеи (ещё не сгенерированы):",
            "- [ ] (добавляйте сюда новые идеи; после генерации помечайте [x] с id)",
        ]

    QFILE.write_text("\n".join(out) + "\n", encoding="utf-8")
    pending = sum(1 for l in pend if l.strip().startswith("- [ ]"))
    print(f"{QFILE}: {len(seen)} ledger entries, {pending} pending ideas")


if __name__ == "__main__":
    main()
