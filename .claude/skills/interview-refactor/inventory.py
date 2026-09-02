#!/usr/bin/env python3
"""Инвентарь вопросов: block · subblock · difficulty · kind · tags · id · title.

Только stdlib. Нужен поднятый сервер. Запуск:
    python3 .claude/skills/interview-refactor/inventory.py
Env: API_URL (по умолч. http://127.0.0.1:8000/api), POOL (по умолч. data-engineer).
Полный текст конкретной ноды смотри отдельно: cat content/<pool>/<block>/<id>.md
"""
import json
import os
import urllib.request

POOL = os.environ.get("POOL", "data-engineer")   # id пула (content/<pool>/)
API_BASE = os.environ.get("API_URL", "http://127.0.0.1:8000/api").rstrip("/")
GRAPH_URL = f"{API_BASE}/graph?pool={POOL}"
DR = {"base": 0, "junior": 1, "middle": 2, "senior": 3}


def main():
    ns = json.load(urllib.request.urlopen(GRAPH_URL))["nodes"]
    ns.sort(key=lambda x: (x["block"], x.get("subblock") or "", DR.get(x["difficulty"], 9), x["id"]))
    print(f"{len(ns)} нод\n")
    cur = None
    for n in ns:
        key = (n["block"], n.get("subblock") or "-")
        if key != cur:
            cur = key
            print(f"\n== {key[0]} / {key[1]} ==")
        tags = ",".join(n.get("tags", []))
        print(f"  {n['difficulty']:6} {n['kind']:8} {n['id']:24} [{tags}]  {n.get('title')}")


if __name__ == "__main__":
    main()
