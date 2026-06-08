#!/usr/bin/env bash
# Автономный цикл РАЗРАБОТКИ приложения interview (interview-graph).
# Фича (GitHub Issue) → /autoplan → реализация на feature-ветке → гейт → ветка-кандидат.
# НЕ пушит, НЕ мёржит, НЕ деплоит, НЕ коммитит в dev/main. Полностью без вопросов пользователю.
#
# Использование: ./.claude/run-autodev.sh [N]   (N циклов, по умолчанию 1)
set -euo pipefail

REPO="/Users/pdiordits/dev/projects/work-tools/interview"
cd "$REPO"

CYCLES="${1:-1}"
DELAY_SEC=10            # пауза между циклами
MAX_OPEN_BRANCHES=3     # STOP: накопились непромёрженные кандидаты

# OPENCLAW_SESSION=1 — load-bearing: gstack-скиллы авто-пропускают интерактивные промпты
# (auto-skips interactive prompts). Без него /autoplan, /review, /qa могут спросить и подвесить headless-цикл.
export OPENCLAW_SESSION=1

# Доступные задачи = открытые issue (не эпики) без ветки feature/<номер>-*.
eligible_issues() {
  local c=0 n
  while read -r n; do
    [ -z "$n" ] && continue
    git branch --list "feature/$n-*" | grep -q . || c=$((c + 1))
  done < <(gh issue list --state open --label autodev-ready --json number \
            -q '.[].number' 2>/dev/null)
  echo "$c"
}
open_branches() { git branch --list 'feature/*' | wc -l | tr -d ' '; }

PROMPT='Ты ведёшь ОДИН автономный цикл разработки приложения interview (это КОД, не контент-вопросы).
Конфиг и инварианты — в .claude/feature-flow.md (прочитай первым). OPENCLAW_SESSION=1: gstack-скиллы
без вопросов — авто-выбирай рекомендованное, не жди ответов.

Шаги:
1. git switch dev; дерево чистое (если dirty — STOP с отчётом).
2. Возьми задачу: gh issue list --state open --label autodev-ready. Выбери первый такой issue без ветки
   feature/<номер>-* (git branch --list). Если таких нет — выведи ровно: AUTODEV_STOP: no-tasks и заверши.
   slug = "<номер>-<краткий-kebab-тайтл>".
3. Создай ветку feature/<slug> от dev. Отметь взятие: gh issue comment <номер> "autodev: взято в работу, ветка feature/<slug>".
4. Спроектируй план реализации фичи через /autoplan (без интерактивных /plan-*-review, /office-hours).
5. Реализуй фичу по issue: код backend (FastAPI/Pydantic/SQLite) и/или frontend (React/TS/Vite).
   Помни: новое поле ноды = models.py + frontend/src/types.ts + миграция контента. Контент (если трогаешь) —
   через python-frontmatter; при необходимости — interview-refactor/interview-balance.
6. Гейт: /review, затем /qa, затем interview-verify (Verify-команды из feature-flow.md). Зелёно = "ALL SMOKE CHECKS PASSED ✓".
7. По успеху: закоммить реализацию на ветке feature/<slug> (НЕ пушить). gh issue comment <номер> с веткой +
   итогом verify/review. Issue НЕ закрывай (закроется при merge человеком). Выведи: AUTODEV_OK: <slug>.
8. По провалу Verify: откати дерево (git restore / git checkout -- .), вернись на dev, удали ветку feature/<slug>,
   gh issue comment <номер> "autodev: провал — <причина>". Выведи: AUTODEV_FAIL: <slug> <причина>.

Инварианты: НЕ пушить (ни dev, ни main — обе автодеплоят на push), НЕ мёржить, НЕ деплоить, НЕ коммитить в dev/main.
Код фичи — только на feature/<slug>. Идемпотентность — по существованию ветки feature/<номер>-*. STOP — в feature-flow.md.'

for ((i = 1; i <= CYCLES; i++)); do
  echo "=== autodev cycle $i/$CYCLES ==="

  if [ "$(eligible_issues)" -eq 0 ]; then
    echo "STOP: нет подходящих open issues (все взяты в работу или эпики)"; break
  fi
  if [ "$(open_branches)" -ge "$MAX_OPEN_BRANCHES" ]; then
    echo "STOP: >= $MAX_OPEN_BRANCHES открытых feature/* — нужно ревью человеком"; break
  fi

  OUT="$(claude -p "$PROMPT" 2>&1)" || true
  echo "$OUT"

  if echo "$OUT" | grep -q 'AUTODEV_STOP: no-tasks'; then
    echo "STOP: agent reports no tasks"; break
  fi
  if echo "$OUT" | grep -q 'AUTODEV_FAIL:'; then
    FAILS=$((${FAILS:-0} + 1))
    if [ "$FAILS" -ge 2 ]; then echo "STOP: 2 Verify failures in a row"; break; fi
  else
    FAILS=0
  fi

  [ "$i" -lt "$CYCLES" ] && sleep "$DELAY_SEC"
done

echo "=== autodev done ==="
