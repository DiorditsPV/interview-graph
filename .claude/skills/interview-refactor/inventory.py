#!/usr/bin/env python3
"""Инвентарь вопросов: block · subblock · difficulty · kind · tags · id · title.

Только stdlib. Нужен поднятый сервер. Запуск:
    python3 .claude/skills/interview-refactor/inventory.py
Env: API_URL (по умолч. http://127.0.0.1:8000/api/graph).
Полный текст конкретной ноды смотри отдельно: cat content/<block>/<id>.md
"""
import json
import os
import urllib.request

API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000/api/graph")
DR = {"base": 0, "junior": 1, "middle": 2, "senior": 3}


def main():
    ns = json.load(urllib.request.urlopen(API_URL))["nodes"]
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
