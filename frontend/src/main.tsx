import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";

import "@xyflow/react/dist/style.css";
import "highlight.js/styles/github-dark.css";
import "./styles.css";
// ВРЕМЕННО (design-funnel): предпросмотр финалистов редизайна, см. design-preview.css.
import "./design-preview.css";

// --- ВРЕМЕННО (design-funnel): выбор направления на живой доске -------------
// Приоритет: ?design=NN из адреса → сохранённый выбор → прод. Пустой ?design=
// сбрасывает. Переключатель в левом нижнем углу; удалить вместе с design-preview.css.
const DESIGNS: Record<string, string> = {
  "37": "Брутализм в цвете", "56": "Атлас", "57": "Полевой журнал", "58": "Изыскания",
};
function applyDesign(id: string | null) {
  if (id && DESIGNS[id]) document.documentElement.dataset.design = id;
  else delete document.documentElement.dataset.design;
  try { localStorage.setItem("design", id ?? ""); } catch { /* приват-режим */ }
  document.querySelectorAll<HTMLButtonElement>(".dp-bar button").forEach((b) => {
    b.classList.toggle("on", (b.dataset.d || null) === (id && DESIGNS[id] ? id : null));
  });
}
{
  const fromUrl = new URLSearchParams(location.search).get("design");
  let saved: string | null = null;
  try { saved = localStorage.getItem("design"); } catch { /* приват-режим */ }
  const initial = fromUrl !== null ? fromUrl : saved;

  const bar = document.createElement("div");
  bar.className = "dp-bar";
  bar.title = "Предпросмотр направлений редизайна (временно)";
  for (const [id, name] of [["", "прод"], ...Object.entries(DESIGNS)]) {
    const b = document.createElement("button");
    b.textContent = id || "прод";
    b.title = name;
    if (id) b.dataset.d = id;
    b.onclick = () => applyDesign(id || null);
    bar.appendChild(b);
  }
  document.body.appendChild(bar);
  applyDesign(initial);
}
// ---------------------------------------------------------------------------

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
