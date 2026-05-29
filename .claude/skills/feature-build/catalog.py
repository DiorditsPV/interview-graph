#!/usr/bin/env python3
"""Пересобрать FEATURES.md из спек `.claude/features/*.md`. Только stdlib.

Каждая спека — источник истины по фиче. catalog.py табулирует их frontmatter
(slug, title, status, verify, review, branch, created) в корневой FEATURES.md.
Запуск:  python3 .claude/skills/feature-build/catalog.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]
FEAT_DIR = ROOT / ".claude" / "features"
OUT = ROOT / "FEATURES.md"

ORDER = {"done": 0, "building": 1, "designed": 2}


def parse_frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    meta = {}
    if not m:
        return meta
    for line in m.group(1).splitlines():
        mm = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if mm:
            meta[mm.group(1).strip()] = mm.group(2).strip().strip("'\"")
    return meta


def main():
    rows = []
    if FEAT_DIR.exists():
        for f in sorted(FEAT_DIR.glob("*.md")):
            meta = parse_frontmatter(f.read_text(encoding="utf-8"))
            slug = meta.get("slug", f.stem)
            rows.append(
                {
                    "slug": slug,
                    "title": meta.get("title", slug),
                    "status": meta.get("status", "designed"),
                    "verify": meta.get("verify", "—"),
                    "review": meta.get("review", "—"),
                    "branch": meta.get("branch", f"feature/{slug}"),
                    "created": meta.get("created", "—"),
                    "spec": f".claude/features/{f.name}",
                }
            )
    rows.sort(key=lambda r: (ORDER.get(r["status"], 9), r["slug"]))

    lines = [
        "# FEATURES.md — каталог сгенерированных фич (для ревью)",
        "",
        "Автообновляется `feature-build` (`.claude/skills/feature-build/catalog.py`, читает "
        "`.claude/features/*.md`). Каждая строка — ветка-кандидат. Посмотреть: "
        "`git switch feature/<slug>`. Понравилось → merge в `main`.",
        "",
        "| ветка | slug | описание | status | verify | review | дата | спека |",
        "|---|---|---|---|---|---|---|---|",
    ]
    if rows:
        for r in rows:
            lines.append(
                f"| `{r['branch']}` | {r['slug']} | {r['title']} | {r['status']} | "
                f"{r['verify']} | {r['review']} | {r['created']} | {r['spec']} |"
            )
    else:
        lines.append("| _(пусто — заполнится по мере автогенерации)_ | | | | | | | |")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{OUT}: {len(rows)} feature(s)")


if __name__ == "__main__":
    main()
