// Генерация самодостаточного HTML-отчёта по результатам интервью.
// Открывается в браузере, печатается в PDF. Светлый (документ для шаринга/печати).

import { BLOCK_ORDER, DIFFS, SUB_LABEL, subOf } from "./layout";
import { BLOCK_COLOR, BLOCK_LABEL, DIFF_COLOR, type Block, type QNode } from "./types";

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
  trackLabel?: string,
  notes?: Record<string, string>,
  people?: ReportPeople,
): string {
  const now = new Date();
  const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const scored = nodes.filter((n) => scores[n.id] != null);
  const vals = scored.map((n) => scores[n.id]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  const blocks: Block[] = [...BLOCK_ORDER];
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
          const sub = n.subblock ? `<span class="sub">${esc(SUB_LABEL[n.subblock] ?? n.subblock)}</span> ` : "";
          const tags = n.tags.length
            ? `<div class="tags">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
            : "";
          const kind = n.kind === "task" ? `<span class="kind">задача</span>` : "";
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
  <h2 style="border-left-color:${BLOCK_COLOR[b]}">${esc(BLOCK_LABEL[b] ?? b)}</h2>
  <table><thead><tr><th>Сложность</th><th>Вопрос</th><th>Оценка</th></tr></thead>
  <tbody>${rows}</tbody></table>
</section>`;
    })
    .join("\n");

  const summaryChips = blockStat
    .map(
      (s) =>
        `<div class="bchip" style="border-left-color:${BLOCK_COLOR[s.b]}">
      <div class="bchip__name">${esc(BLOCK_LABEL[s.b] ?? s.b)}</div>
      <div class="bchip__val">${s.avg != null ? s.avg.toFixed(1) : "—"} <span>·  ${s.done}/${s.total}</span></div>
    </div>`,
    )
    .join("");

  const body =
    scored.length === 0
      ? `<div class="empty">Нет оценённых вопросов — выставьте оценки и скачайте отчёт снова.</div>`
      : sections;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Результаты интервью${candidate ? " — " + esc(candidate) : ""}</title>
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
  .qt { font-weight: 600; }
  .kind { font-size: 10px; color: #92400e; background: #fef3c7; padding: 1px 6px; border-radius: 4px; }
  .topic { font-size: 11px; color: #9ca3af; margin-top: 2px; }
  .qnote { font-size: 12px; color: #374151; background: #fffbeb; border-left: 2px solid #f59e0b; padding: 3px 7px; margin-top: 5px; border-radius: 3px; white-space: pre-wrap; }
  .tags { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 3px; }
  .tag { font-size: 9px; color: #4338ca; background: #eef2ff; padding: 1px 5px; border-radius: 4px; }
  .dots { letter-spacing: 1px; font-size: 12px; }
  .empty { padding: 40px 30px; text-align: center; color: #9ca3af; }
  .foot { padding: 14px 30px 22px; font-size: 11px; color: #9ca3af; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <h1>Результаты интервью</h1>
      <div class="sub">Кандидат: <b>${esc(candidate || "—")}</b>${
        people?.position || people?.seniority
          ? ` (${esc([people?.position, people?.seniority].filter(Boolean).join(", "))})`
          : ""
      } · ${dateStr}${trackLabel ? ` · направление: <b>${esc(trackLabel)}</b>` : ""}${
        people?.interviewer ? ` · интервьюер: <b>${esc(people.interviewer)}</b>` : ""
      }</div>
    </div>
    <div class="summary">
      <div class="stat"><span class="lbl">Оценено</span><span class="num">${scored.length}<span style="font-size:15px;color:#9ca3af">/${nodes.length}</span></span></div>
      <div class="stat"><span class="lbl">Средний балл</span><span class="num" style="color:${scored.length ? scoreColor(Math.round(avg)) : "#9ca3af"}">${scored.length ? avg.toFixed(1) : "—"}</span></div>
      <div class="bchips">${summaryChips}</div>
    </div>
    ${body}
    <div class="foot">Сгенерировано локальным сервисом «Интервью · граф вопросов» · ${dateStr}</div>
  </div>
</body></html>`;
}

// ---- Экспорт всего банка вопросов (полные формулировки + ответы, без оценок) ----
export function buildBankHtml(nodes: QNode[]): string {
  const now = new Date();
  const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const blocks: Block[] = [...BLOCK_ORDER];
  for (const n of nodes) if (!blocks.includes(n.block)) blocks.push(n.block);

  const drank = (d: string) => DIFFS.indexOf(d as any);

  const summaryChips = blocks
    .map((b) => ({ b, total: nodes.filter((n) => n.block === b).length }))
    .filter((s) => s.total > 0)
    .map(
      (s) =>
        `<div class="bchip" style="border-left-color:${BLOCK_COLOR[s.b]}">
      <div class="bchip__name">${esc(BLOCK_LABEL[s.b] ?? s.b)}</div>
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
          const sub = n.subblock ? `<span class="sub">${esc(SUB_LABEL[n.subblock] ?? n.subblock)}</span> ` : "";
          const kind = n.kind === "task" ? `<span class="kind">задача</span>` : "";
          const tags = n.tags.length
            ? `<div class="tags">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
            : "";
          const starter = n.starterCode
            ? `<div class="lbl">Заготовка кода</div><pre class="code">${esc(n.starterCode)}</pre>`
            : "";
          const rubric =
            n.rubric && n.rubric.length
              ? `<div class="lbl">Критерии</div><ul class="rubric">${n.rubric.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
              : "";
          return `<article class="card">
  <div class="card__head">
    <span class="diff" style="color:${DIFF_COLOR[n.difficulty]}">${esc(n.difficulty)}</span>
    ${sub}${kind}
  </div>
  <div class="qt">${esc(n.title || n.question)}</div>
  <div class="topic">${esc(n.topic)}</div>
  <div class="lbl">Вопрос</div><div class="text">${esc(n.question)}</div>
  ${n.answer ? `<div class="lbl">Ответ</div><div class="text">${esc(n.answer)}</div>` : ""}
  ${starter}${rubric}${tags}
</article>`;
        })
        .join("\n");
      return `<section>
  <h2 style="border-left-color:${BLOCK_COLOR[b]}">${esc(BLOCK_LABEL[b] ?? b)} <span class="cnt">${list.length}</span></h2>
  ${cards}
</section>`;
    })
    .join("\n");

  const body = nodes.length === 0 ? `<div class="empty">Банк пуст.</div>` : sections;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Банк вопросов · интервью</title>
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
      <h1>Банк вопросов</h1>
      <div class="sub">${nodes.length} вопросов · ${dateStr}</div>
    </div>
    <div class="summary">${summaryChips}</div>
    ${body}
    <div class="foot">Сгенерировано локальным сервисом «Интервью · граф вопросов» · ${dateStr}</div>
  </div>
</body></html>`;
}

export function downloadBank(nodes: QNode[]): void {
  const html = buildBankHtml(nodes);
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
  trackLabel?: string,
  notes?: Record<string, string>,
  people?: ReportPeople,
): void {
  const html = buildReportHtml(candidate, nodes, scores, trackLabel, notes, people);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const safe = (candidate || "кандидат").trim().replace(/[^\p{L}\p{N}_-]+/gu, "_") || "кандидат";
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview_${safe}_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
