// Сверка словаря i18n: каждый литерал t("…") в src должен иметь ключ в src/i18n/en.ts.
// Ключ словаря — русская строка ровно как в коде, tsc опечатку не ловит: отсутствующий ключ
// означает тихую непереведённость. Запуск: npm run i18n:check (падает с кодом 1 при расхождении).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("./src/", import.meta.url).pathname;
const DICT = join(SRC, "i18n", "en.ts");

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const used = new Set();
const CALL = /\bt\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
for (const p of walk(SRC)) {
  if (p === DICT) continue;
  for (const m of readFileSync(p, "utf8").matchAll(CALL)) used.add(m[1] ?? m[2]);
}

const keys = new Set([...readFileSync(DICT, "utf8").matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)].map((m) => m[1]));
const missing = [...used].filter((k) => !keys.has(k)).sort();
if (missing.length) {
  console.error(`i18n: нет перевода для ${missing.length} ключ(ей):\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(`i18n: ${used.size} ключей в коде, ${keys.size} в словаре — ok`);
