import { useEffect, useState } from "react";

// Свой hash-роутер: адреса вида #/board/data-engineer?session=12. Без зависимости —
// нам нужны семь маршрутов, глубокие ссылки и F5; history API не нужен
// (бэкенд раздаёт статику одним index.html, hash его не трогает).

// Префилл экрана настройки интервью (из фильтров доски): разделы, под-колонки по разделу, уровни.
export interface SetupInit {
  blocks?: string[] | null;
  subs?: Record<string, string[]> | null;
  diffs?: string[] | null;
}

export type Route =
  | { name: "home"; start: string | null } // start — пул: старый deep-link #/?start=<pool> → настройка интервью
  | { name: "setup"; pool: string; init: SetupInit }
  | { name: "board"; pool: string; session: number | null }
  | { name: "bank"; pool: string }
  | { name: "candidates" }
  | { name: "sessions" }
  | { name: "connect" };

const list = (v: string | null): string[] | null => (v ? v.split(",").filter(Boolean) : null);

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart);
  if (segs.length === 0) return { name: "home", start: query.get("start") };
  if (segs[0] === "setup" && segs[1]) {
    // subs=frameworks:airflow|pyspark;databases:sql
    const subs: Record<string, string[]> = {};
    for (const part of (query.get("subs") ?? "").split(";").filter(Boolean)) {
      const [b, s] = part.split(":");
      if (b && s) subs[b] = s.split("|").filter(Boolean);
    }
    return {
      name: "setup",
      pool: decodeURIComponent(segs[1]),
      init: { blocks: list(query.get("blocks")), subs: Object.keys(subs).length ? subs : null, diffs: list(query.get("diffs")) },
    };
  }
  if (segs[0] === "board" && segs[1]) {
    const s = query.get("session");
    return { name: "board", pool: decodeURIComponent(segs[1]), session: s ? Number(s) : null };
  }
  if (segs[0] === "bank" && segs[1]) return { name: "bank", pool: decodeURIComponent(segs[1]) };
  if (segs[0] === "candidates") return { name: "candidates" };
  if (segs[0] === "sessions") return { name: "sessions" };
  if (segs[0] === "connect") return { name: "connect" };
  return { name: "home", start: null }; // неизвестный путь → меню
}

function setupQuery(init?: SetupInit): string {
  if (!init) return "";
  const q = new URLSearchParams();
  if (init.blocks?.length) q.set("blocks", init.blocks.join(","));
  if (init.subs && Object.keys(init.subs).length) {
    q.set("subs", Object.entries(init.subs).map(([b, s]) => `${b}:${s.join("|")}`).join(";"));
  }
  if (init.diffs?.length) q.set("diffs", init.diffs.join(","));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const href = {
  home: "#/",
  // Настройка интервью; start — прежнее имя той же точки входа (ссылки в закладках и smoke).
  setup: (pool: string, init?: SetupInit) => `#/setup/${encodeURIComponent(pool)}${setupQuery(init)}`,
  start: (pool: string) => `#/setup/${encodeURIComponent(pool)}`,
  board: (pool: string, session?: number | null) =>
    `#/board/${encodeURIComponent(pool)}${session != null ? `?session=${session}` : ""}`,
  bank: (pool: string) => `#/bank/${encodeURIComponent(pool)}`,
  candidates: "#/candidates",
  sessions: "#/sessions",
  connect: "#/connect",
};

export function navigate(to: string): void {
  window.location.hash = to;
}

/** Текущий маршрут; перерисовка на hashchange. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
