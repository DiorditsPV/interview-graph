#!/usr/bin/env python3
"""Проверка импорта контента + краткая статистика. Только stdlib, нужен сервер.

Запуск:  python3 .claude/skills/interview-verify/check_import.py
Env: API_URL (по умолч. http://127.0.0.1:8000/api/graph).
Выход: код 0 если 0 ошибок импорта и нет нод без тегов, иначе 1.
"""
import json
import os
import sys
import urllib.request
from collections import Counter

API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000/api/graph")


def main():
    try:
        d = json.load(urllib.request.urlopen(API_URL))
    except Exception as e:
        print(f"FAIL: не достучался до {API_URL}: {e}")
        return 1
    ns = d["nodes"]
    errs = d.get("errors", [])
    tags = Counter(t for n in ns for t in n.get("tags", []))
    empty = [n["id"] for n in ns if not n.get("tags")]

    print(f"nodes: {len(ns)} | import errors: {len(errs)} | distinct tags: {len(tags)}")
    for e in errs:
        print("  ERR", e)
    print("empty-tag nodes:", empty or "none")
    if len(tags) > 20:
        print(f"WARN: тегов {len(tags)} > 20 — стоит свести (interview-ideas/refactor)")

    ok = not errs and not empty
    print("RESULT:", "OK" if ok else "PROBLEMS")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
