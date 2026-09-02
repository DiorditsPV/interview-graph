#!/usr/bin/env python3
"""Покрытие банка вопросов: матрица subblock×difficulty, доли блоков vs веса, пробелы.

Только stdlib. Нужен поднятый сервер. Запуск:
    python3 .claude/skills/interview-balance/coverage.py
Env: API_URL (по умолч. http://127.0.0.1:8000/api), POOL (по умолч. data-engineer).
"""
import json
import os
import urllib.request
from collections import Counter, defaultdict

POOL = os.environ.get("POOL", "data-engineer")   # id пула (content/<pool>/)
API_BASE = os.environ.get("API_URL", "http://127.0.0.1:8000/api").rstrip("/")
GRAPH_URL = f"{API_BASE}/graph?pool={POOL}"
DIFFS = ["base", "junior", "middle", "senior"]


def main():
    ns = json.load(urllib.request.urlopen(GRAPH_URL))["nodes"]
    try:
        pools = json.load(urllib.request.urlopen(f"{API_BASE}/pools"))
        pool = next((p for p in pools if p["id"] == POOL), None)
    except Exception:
        pool = None
    weights = {b["id"]: b["weight"] for b in pool["blocks"]} if pool else {}

    print(f"Пул {POOL}: всего нод {len(ns)}\n")

    # матрица subblock × difficulty
    cell = defaultdict(Counter)
    for n in ns:
        cell[(n["block"], n.get("subblock") or "-")][n["difficulty"]] += 1
    print("subblock                |", " ".join(f"{d:>6}" for d in DIFFS), "| итого")
    print("-" * 64)
    gaps = []
    for key in sorted(cell):
        row = cell[key]
        tot = sum(row.values())
        cells = " ".join(f"{row.get(d, 0):>6}" for d in DIFFS)
        print(f"{key[0][:10]:10}/{key[1][:10]:10} | {cells} | {tot:>4}")
        for d in ("base", "senior"):
            if row.get(d, 0) == 0:
                gaps.append(f"{key[0]}/{key[1]}: нет вопроса уровня {d}")

    # доли блоков vs веса
    by_block = Counter(n["block"] for n in ns)
    print("\nБлок        | нод | факт.% | вес% | дельта")
    print("-" * 46)
    total = len(ns) or 1
    for b in sorted(by_block, key=lambda b: -by_block[b]):
        fact = 100 * by_block[b] / total
        w = weights.get(b)
        delta = f"{fact - w:+.0f}" if w is not None else "—"
        print(f"{b:11} | {by_block[b]:>3} | {fact:5.0f}% | {('%d%%' % w) if w is not None else '  — ':>4} | {delta}")

    if gaps:
        print("\nПробелы (пустые ячейки base/senior):")
        for g in gaps:
            print("  •", g)
    else:
        print("\nПробелов по base/senior нет.")


if __name__ == "__main__":
    main()
