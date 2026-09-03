// Генерация самодостаточного HTML-отчёта по результатам интервью.
// Открывается в браузере, печатается в PDF. Светлый (документ для шаринга/печати).

import { DIFFS, subOf } from "./layout";
import { getLang, t } from "./i18n";
import { blockColor, blockLabel, blockOrder, subLabel, DIFF_COLOR, type PoolConfig, type QNode, type Session } from "./types";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const scoreColor = (s: number) => (s <= 2 ? "#dc2626" : s === 3 ? "#d97706" : "#16a34a");

function dots(score: number): string {
  const c = scoreColor(score);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += `<span style="color:${i <= score ? c : "#d1d5db"}">●</span>`;
  }
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// people-schema: люди в шапке отчёта (интервьюер + позиция/грейд кандидата).
export interface ReportPeople {
  interviewer?: string | null;
  position?: string | null;
  seniority?: string | null;
}

export function buildReportHtml(
  candidate: string,
  nodes: QNode[],
  scores: Record<string, number>,
  pool: PoolConfig,
  notes?: Record<string, string>,
  people?: ReportPeople,
  session?: Session | null,
): string {
  const now = new Date();
  // Сессия с планом: отчёт только по набору интервью (знаменатель — план, а не весь банк).
  if (session?.plan?.order) {
    const inPlan = new Set(session.plan.order);
    nodes = nodes.filter((n) => inPlan.has(n.id));
  }
  const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const scored = nodes.filter((n) => scores[n.id] != null);
  const vals = scored.map((n) => scores[n.id]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  const blocks: string[] = [...blockOrder(pool)];
  for (const n of nodes) if (!blocks.includes(n.block)) blocks.push(n.block);

  // Сводка по блокам: охват и средний балл.
  const blockStat = blocks
    .map((b) => {
      const all = nodes.filter((n) => n.block === b);
      const done = all.filter((n) => scores[n.id] != null);
      const a = done.length ? done.reduce((s, n) => s + scores[n.id], 0) / done.length : null;
      return { b, total: all.length, done: done.length, avg: a };
    })
    .filter((s) => s.total > 0);

  const drank = (d: string) => DIFFS.indexOf(d as any);

  const sections = blocks
    .map((b) => {
      const list = scored
        .filter((n) => n.block === b)
        .sort(
          (a, c) =>
            drank(a.difficulty) - drank(c.difficulty) ||
            (subOf(a)).localeCompare(subOf(c)) ||
            a.id.localeCompare(c.id),
        );
      if (!list.length) return "";
      const rows = list
        .map((n) => {
          const s = scores[n.id];
          const sub = n.subblock ? `<span class="sub">${esc(subLabel(pool, n.block, n.subblock))}</span> ` : "";
          const tags = n.tags.length
            ? `<div class="tags">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
            : "";
          const kind = n.kind === "task" ? `<span class="kind">${t("задача")}</span>` : "";
          const nText = notes?.[n.id]?.trim();
          const noteHtml = nText ? `<div class="qnote">📝 ${esc(nText)}</div>` : "";
          return `<tr>
  <td class="c-diff"><span class="diff" style="color:${DIFF_COLOR[n.difficulty]}">${esc(n.difficulty)}</span></td>
  <td class="c-q">${sub}<span class="qt">${esc(n.title || n.question)}</span> ${kind}
    <div class="topic">${esc(n.topic)}</div>${tags}${noteHtml}</td>
  <td class="c-score"><span class="dots">${dots(s)}</span> <b style="color:${scoreColor(s)}">${s}/5</b></td>
</tr>`;
        })
        .join("\n");
      return `<section>
  <h2 style="border-left-color:${blockColor(pool, b)}">${esc(blockLabel(pool, b))}</h2>
  <table><thead><tr><th>${t("Сложность")}</th><th>${t("Вопрос")}</th><th>${t("Оценка")}</th></tr></thead>
  <tbody>${rows}</tbody></table>
</section>`;
    })
    .join("\n");

  const summaryChips = blockStat
    .map(
      (s) =>
        `<div class="bchip" style="border-left-color:${blockColor(pool, s.b)}">
      <div class="bchip__name">${esc(blockLabel(pool, s.b))}</div>
      <div class="bchip__val">${s.avg != null ? s.avg.toFixed(1) : "—"} <span>·  ${s.done}/${s.total}</span></div>
    </div>`,
    )
    .join("");

  const body =
    scored.length === 0
      ? `<div class="empty">${t("Нет оценённых вопросов — выставьте оценки и скачайте отчёт снова.")}</div>`
      : sections;

  // Итог сессии (инкремент 2): решение, комментарий, сильные/слабые разделы по средним оценкам.
  const decisionText = (d: string | null | undefined) =>
    d === "hire" ? t("Нанимать") : d === "no_hire" ? t("Не нанимать") : d === "hold" ? t("Подумать") : "";
  const strong = blockStat.filter((b) => b.avg != null && b.done > 0 && b.avg >= 4);
  const weak = blockStat.filter((b) => b.avg != null && b.done > 0 && b.avg <= 2.5);
  const list = (items: typeof blockStat) =>
    items.length
      ? items.map((b) => `<li><span class="dot" style="background:${blockColor(pool, b.b)}"></span>${esc(blockLabel(pool, b.b))} <span class="muted">· ${b.avg!.toFixed(1)}</span></li>`).join("")
      : `<li class="muted">—</li>`;
  const verdictHtml = session?.status === "finished"
    ? `<div class="verdict verdict--${esc(session.decision ?? "none")}">
      <div class="verdict__head"><span class="lbl">${t("Итог интервью")}</span><span class="verdict__decision">${esc(decisionText(session.decision))}</span></div>
      ${session.summary ? `<div class="verdict__summary">${esc(session.summary)}</div>` : ""}
      <div class="verdict__cols">
        <div><div class="lbl">${t("Сильные разделы")}</div><ul>${list(strong)}</ul></div>
        <div><div class="lbl">${t("Слабые разделы")}</div><ul>${list(weak)}</ul></div>
      </div>
    </div>`
    : "";

  return `<!doctype html>
<html lang="${getLang()}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t("Результаты интервью")}${candidate ? " — " + esc(candidate) : ""}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background: #f1f5f9; margin: 0; padding: 24px; }
  .sheet { max-width: 920px; margin: 0 auto; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.1); overflow: hidden; }
  .head { background: #0f172a; color: #fff; padding: 22px 30px; }
  .head h1 { margin: 0 0 6px; font-size: 21px; }
  .head .sub { opacity: .82; font-size: 13px; }
  .summary { display: flex; gap: 22px; flex-wrap: wrap; align-items: center; padding: 18px 30px; border-bottom: 1px solid #e5e7eb; }
  .stat { display: flex; flex-direction: column; }
  .stat .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; }
  .stat .num { font-size: 26px; font-weight: 700; line-height: 1.1; }
  .bchips { display: flex; gap: 10px; flex-wrap: wrap; margin-left: auto; }
  .bchip { border-left: 4px solid; background: #f8fafc; border-radius: 8px; padding: 6px 12px; }
  .bchip__name { font-size: 11px; color: #6b7280; }
  .bchip__val { font-size: 17px; font-weight: 700; }
  .bchip__val span { font-size: 12px; font-weight: 500; color: #9ca3af; }
  section { padding: 6px 30px 8px; }
  h2 { font-size: 15px; border-left: 4px solid #999; padding-left: 10px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; padding: 4px 10px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 13px; }
  .c-diff { width: 84px; } .c-score { width: 130px; white-space: nowrap; }
  .diff { font-size: 11px; text-transform: uppercase; font-weight: 700; }
  .sub { font-size: 11px; color: #6b7280; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
  /* Заголовок вопроса — как в экспорте банка (14/700): на 13/600 строки из одних строчных
     («Topics, partitions, consumer groups») читались мельче соседних с заглавными. */
  .qt { font-weight: 700; font-size: 14px; line-height: 1.35; }
  .kind { font-size: 10px; color: #92400e; background: #fef3c7; padding: 1px 6px; border-radius: 4px; }
  .topic { font-size: 11px; color: #9ca3af; margin-top: 2px; }
  .qnote { font-size: 12px; color: #374151; background: #fffbeb; border-left: 2px solid #f59e0b; padding: 3px 7px; margin-top: 5px; border-radius: 3px; white-space: pre-wrap; }
  .tags { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 3px; }
  .tag { font-size: 9px; color: #4338ca; background: #eef2ff; padding: 1px 5px; border-radius: 4px; }
  .dots { letter-spacing: 1px; font-size: 12px; }
  .empty { padding: 40px 30px; text-align: center; color: #9ca3af; }
  .foot { padding: 14px 30px 22px; font-size: 11px; color: #9ca3af; }
  .verdict { margin: 0 30px 6px; padding: 14px 16px; border: 1px solid #e5e7eb; border-left: 4px solid #9ca3af; border-radius: 8px; background: #f8fafc; }
  .verdict--hire { border-left-color: #16a34a; } .verdict--no_hire { border-left-color: #b91c1c; } .verdict--hold { border-left-color: #d97706; }
  .verdict__head { display: flex; align-items: baseline; gap: 12px; }
  .verdict .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; }
  .verdict__decision { font-size: 18px; font-weight: 700; }
  .verdict--hire .verdict__decision { color: #15803d; } .verdict--no_hire .verdict__decision { color: #b91c1c; } .verdict--hold .verdict__decision { color: #b45309; }
  .verdict__summary { margin-top: 8px; font-size: 13px; white-space: pre-wrap; }
  .verdict__cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
  .verdict__cols ul { margin: 4px 0 0; padding: 0; list-style: none; font-size: 13px; }
  .verdict__cols li { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .verdict .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
  .verdict .muted { color: #9ca3af; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <h1>${t("Результаты интервью")}</h1>
      <div class="sub">${t("Кандидат")}: <b>${esc(candidate || "—")}</b>${
        people?.position || people?.seniority
          ? ` (${esc([people?.position, people?.seniority].filter(Boolean).join(", "))})`
          : ""
      } · ${dateStr} · ${t("направление")}: <b>${esc(pool.label)}</b>${
        people?.interviewer ? ` · ${t("интервьюер")}: <b>${esc(people.interviewer)}</b>` : ""
      }</div>
    </div>
    <div class="summary">
      <div class="stat"><span class="lbl">${t("Оценено")}</span><span class="num">${scored.length}<span style="font-size:15px;color:#9ca3af">/${nodes.length}</span></span></div>
      <div class="stat"><span class="lbl">${t("Средний балл")}</span><span class="num" style="color:${scored.length ? scoreColor(Math.round(avg)) : "#9ca3af"}">${scored.length ? avg.toFixed(1) : "—"}</span></div>
      <div class="bchips">${summaryChips}</div>
    </div>
    ${verdictHtml}
    ${body}
    <div class="foot">${t("Сгенерировано локальным сервисом «Интервью · граф вопросов»")} · ${dateStr}</div>
  </div>
</body></html>`;
}

// ---- Экспорт всего банка вопросов (полные формулировки + ответы, без оценок) ----
export function buildBankHtml(nodes: QNode[], pool: PoolConfig): string {
  const now = new Date();
  const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const blocks: string[] = [...blockOrder(pool)];
  for (const n of nodes) if (!blocks.includes(n.block)) blocks.push(n.block);

  const drank = (d: string) => DIFFS.indexOf(d as any);

  const summaryChips = blocks
    .map((b) => ({ b, total: nodes.filter((n) => n.block === b).length }))
    .filter((s) => s.total > 0)
    .map(
      (s) =>
        `<div class="bchip" style="border-left-color:${blockColor(pool, s.b)}">
      <div class="bchip__name">${esc(blockLabel(pool, s.b))}</div>
      <div class="bchip__val">${s.total}</div>
    </div>`,
    )
    .join("");

  const sections = blocks
    .map((b) => {
      const list = nodes
        .filter((n) => n.block === b)
        .sort(
          (a, c) =>
            subOf(a).localeCompare(subOf(c)) ||
            drank(a.difficulty) - drank(c.difficulty) ||
            a.id.localeCompare(c.id),
        );
      if (!list.length) return "";
      const cards = list
        .map((n) => {
          const sub = n.subblock ? `<span class="sub">${esc(subLabel(pool, n.block, n.subblock))}</span> ` : "";
          const kind = n.kind === "task" ? `<span class="kind">${t("задача")}</span>` : "";
          const tags = n.tags.length
            ? `<div class="tags">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
            : "";
          const starter = n.starterCode
            ? `<div class="lbl">${t("Заготовка кода")}</div><pre class="code">${esc(n.starterCode)}</pre>`
            : "";
          const rubric =
            n.rubric && n.rubric.length
              ? `<div class="lbl">${t("Критерии")}</div><ul class="rubric">${n.rubric.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
              : "";
          return `<article class="card">
  <div class="card__head">
    <span class="diff" style="color:${DIFF_COLOR[n.difficulty]}">${esc(n.difficulty)}</span>
    ${sub}${kind}
  </div>
  <div class="qt">${esc(n.title || n.question)}</div>
  <div class="topic">${esc(n.topic)}</div>
  <div class="lbl">${t("Вопрос")}</div><div class="text">${esc(n.question)}</div>
  ${n.answer ? `<div class="lbl">${t("Ответ")}</div><div class="text">${esc(n.answer)}</div>` : ""}
  ${starter}${rubric}${tags}
</article>`;
        })
        .join("\n");
      return `<section>
  <h2 style="border-left-color:${blockColor(pool, b)}">${esc(blockLabel(pool, b))} <span class="cnt">${list.length}</span></h2>
  ${cards}
</section>`;
    })
    .join("\n");

  const body = nodes.length === 0 ? `<div class="empty">${t("Банк пуст.")}</div>` : sections;

  return `<!doctype html>
<html lang="${getLang()}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t("Банк вопросов · интервью")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background: #f1f5f9; margin: 0; padding: 24px; }
  .sheet { max-width: 920px; margin: 0 auto; background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.1); overflow: hidden; }
  .head { background: #0f172a; color: #fff; padding: 22px 30px; }
  .head h1 { margin: 0 0 6px; font-size: 21px; }
  .head .sub { opacity: .82; font-size: 13px; }
  .summary { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 16px 30px; border-bottom: 1px solid #e5e7eb; }
  .bchip { border-left: 4px solid; background: #f8fafc; border-radius: 8px; padding: 6px 12px; }
  .bchip__name { font-size: 11px; color: #6b7280; }
  .bchip__val { font-size: 17px; font-weight: 700; }
  section { padding: 6px 30px 8px; }
  h2 { font-size: 15px; border-left: 4px solid #999; padding-left: 10px; margin: 18px 0 10px; }
  h2 .cnt { font-size: 12px; font-weight: 500; color: #9ca3af; }
  .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; margin: 0 0 10px; break-inside: avoid; }
  .card__head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .diff { font-size: 11px; text-transform: uppercase; font-weight: 700; }
  .sub { font-size: 11px; color: #6b7280; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
  .kind { font-size: 10px; color: #92400e; background: #fef3c7; padding: 1px 6px; border-radius: 4px; }
  .qt { font-weight: 700; font-size: 14px; }
  .topic { font-size: 11px; color: #9ca3af; margin: 2px 0 6px; }
  .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; margin: 8px 0 2px; }
  .text { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  .code { background: #0d1117; color: #e6edf3; padding: 10px; border-radius: 8px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; }
  .rubric { margin: 2px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
  .tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 3px; }
  .tag { font-size: 9px; color: #4338ca; background: #eef2ff; padding: 1px 5px; border-radius: 4px; }
  .empty { padding: 40px 30px; text-align: center; color: #9ca3af; }
  .foot { padding: 14px 30px 22px; font-size: 11px; color: #9ca3af; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; } .card { break-inside: avoid; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <h1>${t("Банк вопросов")}</h1>
      <div class="sub">${t("{n} вопросов", { n: nodes.length })} · ${dateStr}</div>
    </div>
    <div class="summary">${summaryChips}</div>
    ${body}
    <div class="foot">${t("Сгенерировано локальным сервисом «Интервью · граф вопросов»")} · ${dateStr}</div>
  </div>
</body></html>`;
}

export function downloadBank(nodes: QNode[], pool: PoolConfig): void {
  const html = buildBankHtml(nodes, pool);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview_bank_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadReport(
  candidate: string,
  nodes: QNode[],
  scores: Record<string, number>,
  pool: PoolConfig,
  notes?: Record<string, string>,
  people?: ReportPeople,
  session?: Session | null,
): void {
  const html = buildReportHtml(candidate, nodes, scores, pool, notes, people, session);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const safe = (candidate || t("кандидат")).trim().replace(/[^\p{L}\p{N}_-]+/gu, "_") || t("кандидат");
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview_${safe}_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
