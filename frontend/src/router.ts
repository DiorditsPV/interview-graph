import { useEffect, useState } from "react";

// Свой hash-роутер: адреса вида #/board/data-engineer?session=12. Без зависимости —
// нам нужны ровно шесть маршрутов, глубокие ссылки и F5; history API не нужен
// (бэкенд раздаёт статику одним index.html, hash его не трогает).

export type Route =
  | { name: "home" }
  | { name: "board"; pool: string; session: number | null }
  | { name: "bank"; pool: string }
  | { name: "candidates" }
  | { name: "sessions" }
  | { name: "connect" };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart);
  if (segs.length === 0) return { name: "home" };
  if (segs[0] === "board" && segs[1]) {
    const s = query.get("session");
    return { name: "board", pool: decodeURIComponent(segs[1]), session: s ? Number(s) : null };
  }
  if (segs[0] === "bank" && segs[1]) return { name: "bank", pool: decodeURIComponent(segs[1]) };
  if (segs[0] === "candidates") return { name: "candidates" };
  if (segs[0] === "sessions") return { name: "sessions" };
  if (segs[0] === "connect") return { name: "connect" };
  return { name: "home" }; // неизвестный путь → меню
}

export const href = {
  home: "#/",
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
