import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type NodeUpdate } from "../api";
import { BandsNode } from "../components/BandsNode";
import { BlockGroupNode } from "../components/BlockGroupNode";
import { LangSwitch } from "../components/LangSwitch";
import { SettingsMenu } from "../components/SettingsMenu";
import { useT } from "../i18n";
import { DetailDrawer } from "../components/DetailDrawer";
import { GuidesNode } from "../components/GuidesNode";
import { QuestionNode } from "../components/QuestionNode";
import { ShortcutsHelp } from "../components/ShortcutsHelp";
import { SubHeadNode } from "../components/SubHeadNode";
import { downloadReport } from "../report";
import {
  CARD_H,
  CARD_W,
  DIFFS,
  LABEL_W,
  subOf,
  swimlaneLayout,
  type Placement,
} from "../layout";
import {
  blockColor,
  blockLabel,
  blockOrder,
  DIFF_COLOR,
  type Difficulty,
  type ImportErr,
  type PoolConfig,
  type QNode,
  type Session,
} from "../types";
import { href } from "../router";
import { notesOf, scoresOf } from "../sessionUtils";

const nodeTypes = {
  question: QuestionNode,
  blockGroup: BlockGroupNode,
  subhead: SubHeadNode,
  bands: BandsNode,
  guides: GuidesNode,
};
const NO_EDGES: Edge[] = [];

// M:SS из миллисекунд (для таймеров вопроса/сессии).
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Совпадение ноды с поисковым запросом (подстрока в title/question/topic/tags).
function matchesQuery(n: QNode, q: string): boolean {
  if (!q) return true;
  return `${n.title ?? ""} ${n.question} ${n.topic} ${n.tags.join(" ")}`.toLowerCase().includes(q);
}

// Настройки отображения холста (фон + направляющие), сохраняются в localStorage.
// База — без сетки; точки — единственный альтернативный вариант (переключается иконкой).
type BgVariant = "off" | "dots";

function buildNodes(
  graph: QNode[],
  pool: PoolConfig,
  p: Placement,
  scores: Record<string, number>,
  currentId: string | null,
  selectedId: string | null,
  activeBlocks: Record<string, boolean>,
  activeDiffs: Record<string, boolean>,
  activeTags: Record<string, boolean>,
  activeKinds: Record<string, boolean>,
  query: string,
  unscoredOnly: boolean,
  hiddenIds: Set<string>,
  showHidden: boolean,
  guidesH: boolean,
  guidesV: boolean,
  dark: boolean,
): Node[] {
  const nodes: Node[] = [];
  const anyTag = Object.values(activeTags).some(Boolean);

  nodes.push({
    id: "bg-bands",
    type: "bands",
    position: { x: -LABEL_W, y: 0 },
    data: { bands: p.bands, width: p.width, labelW: LABEL_W, height: p.height, dark },
    draggable: false,
    selectable: false,
    zIndex: -5,
  });

  if (guidesH || guidesV) {
    nodes.push({
      id: "bg-guides",
      type: "guides",
      position: { x: 0, y: 0 },
      data: { columns: p.columns, bands: p.bands, width: p.width, height: p.height, guidesH, guidesV },
      draggable: false,
      selectable: false,
      zIndex: -4,
    });
  }

  for (const bg of p.blockGroups) {
    const blockNodes = graph.filter((n) => n.block === bg.block);
    const done = blockNodes.filter((n) => scores[n.id] != null).length;
    nodes.push({
      id: `bg-${bg.block}`,
      type: "blockGroup",
      position: { x: bg.x, y: 0 },
      data: {
        block: bg.block,
        label: blockLabel(pool, bg.block),
        color: blockColor(pool, bg.block),
        width: bg.width,
        height: bg.height,
        count: blockNodes.length,
        done,
        split: bg.split,
        dark,
      },
      draggable: false,
      selectable: false,
      zIndex: -6,
    });
  }

  for (const col of p.columns) {
    if (!col.label) continue;
    const colNodes = graph.filter((n) => n.block === col.block && subOf(n) === col.subblock);
    const done = colNodes.filter((n) => scores[n.id] != null).length;
    nodes.push({
      id: `sh-${col.block}-${col.subblock}`,
      type: "subhead",
      position: { x: col.x, y: 0 },
      data: {
        block: col.block,
        label: col.label,
        color: blockColor(pool, col.block),
        width: col.width,
        count: colNodes.length,
        done,
        dark,
      },
      draggable: false,
      selectable: false,
      zIndex: -3,
    });
  }

  for (const n of graph) {
    const pos = p.positions[n.id];
    if (!pos) continue;
    const tagOk = !anyTag || n.tags.some((t) => activeTags[t]);
    // hide-local: скрытый вопрос гасится (если не показываем скрытые); при показе — помечается.
    const hidden = hiddenIds.has(n.id);
    const dimmed =
      activeBlocks[n.block] === false ||
      !activeDiffs[n.difficulty] ||
      !activeKinds[n.kind] ||
      !tagOk ||
      !matchesQuery(n, query) ||
      (unscoredOnly && scores[n.id] != null) ||
      (hidden && !showHidden);
    nodes.push({
      id: n.id,
      type: "question",
      position: pos,
      // Явные размеры (= размер карточки) нужны минимапе React Flow, иначе ноды не рисуются.
      width: CARD_W,
      height: CARD_H,
      data: {
        node: n,
        color: blockColor(pool, n.block),
        score: scores[n.id],
        current: n.id === currentId,
        dimmed,
        hidden: hidden && showHidden,
      },
      selected: n.id === selectedId,
      draggable: false,
      selectable: !dimmed,
      style: dimmed ? { pointerEvents: "none" } : undefined,
      zIndex: n.id === currentId ? 5 : n.id === selectedId ? 4 : 1,
    });
  }
  return nodes;
}

// Ключи доски теперь с суффиксом пула, чтобы DE и SA не пересекались. Старый ключ без
// суффикса принадлежит бывшему единственному банку — переносим его в data-engineer один раз.
function legacyKey(base: string, pool: string): string {
  const key = `${base}:${pool}`;
  try {
    if (pool === "data-engineer" && localStorage.getItem(key) == null) {
      const old = localStorage.getItem(base);
      if (old != null) {
        localStorage.setItem(key, old);
        localStorage.removeItem(base);
      }
    }
  } catch { /* приват-режим */ }
  return key;
}

// hide-local: набор локально скрытых id (в localStorage). Читаем безопасно.
function readHiddenIds(pool: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(legacyKey("hiddenIds", pool)) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

// draft-autosave: черновик оценок (без активной сессии) — устойчивость к refresh/крашу.
function readDraftScores(pool: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(legacyKey("draftScores", pool)) || "{}");
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "number") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

const ALL_DIFFS: Record<string, boolean> = Object.fromEntries(DIFFS.map((d) => [d, true]));
const KINDS = ["question", "task"] as const;
const KIND_LABEL: Record<string, string> = { question: "вопрос", task: "задача" };
const KIND_COLOR: Record<string, string> = { question: "#2563eb", task: "#9333ea" };
const ALL_KINDS: Record<string, boolean> = { question: true, task: true };

export default function BoardPage({ pool, sessionFromUrl }: { pool: PoolConfig; sessionFromUrl: number | null }) {
  const t = useT();
  const [graph, setGraph] = useState<QNode[]>([]);
  const [errors, setErrors] = useState<ImportErr[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(() => readDraftScores(pool.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // hide-local: скрытые с доски вопросы (клиентски) + тумблер показа.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHiddenIds(pool.id));
  const [showHidden, setShowHidden] = useState(false);
  // Сессия стартует с главной (StartSessionForm) и приходит сюда по ?session=<id>;
  // своей строки кандидата у доски больше нет.
  const [session, setSession] = useState<Session | null>(null);
  const [live, setLive] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [sessionStart, setSessionStart] = useState<number | null>(() => {
    const v = localStorage.getItem(legacyKey("timerStart", pool.id));
    return v ? Number(v) : null;
  });
  const [questionStart, setQuestionStart] = useState<number>(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [activeBlocks, setActiveBlocks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(blockOrder(pool).map((b) => [b, true])),
  );
  const [activeDiffs, setActiveDiffs] = useState<Record<string, boolean>>(ALL_DIFFS);
  const [activeTags, setActiveTags] = useState<Record<string, boolean>>({});
  const [activeKinds, setActiveKinds] = useState<Record<string, boolean>>(ALL_KINDS);
  const [query, setQuery] = useState("");
  const [unscoredOnly, setUnscoredOnly] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (localStorage.getItem("theme") as "light" | "dark") ||
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const [bgVariant, setBgVariant] = useState<BgVariant>(
    () => (localStorage.getItem("bgVariant") === "dots" ? "dots" : "off"),
  );
  const [guidesH, setGuidesH] = useState<boolean>(() => localStorage.getItem("guidesH") === "1");
  const [guidesV, setGuidesV] = useState<boolean>(() => localStorage.getItem("guidesV") === "1");
  const [agendaOpen, setAgendaOpen] = useState<boolean>(() => localStorage.getItem("agendaOpen") === "1");
  // Таймер в HUD по умолчанию скрыт: во время интервью он тикает в поле зрения и давит.
  const [showTimer, setShowTimer] = useState<boolean>(() => localStorage.getItem("showTimer") === "1");
  // Оформление доски (итог design-funnel): дефолт — 37 «Брутализм в цвете»,
  // альтернативы переключаются в ⚙. Применяется атрибутом data-design (design-themes.css).
  const [design, setDesign] = useState<string>(() => {
    const v = localStorage.getItem("design");
    return v && ["37", "56", "57", "58"].includes(v) ? v : "37";
  });
  // Панель фильтров лежит поверх канвы: без сворачивания она съедает правую треть доски.
  const [filtersOpen, setFiltersOpen] = useState<boolean>(
    () => localStorage.getItem("filtersOpen") !== "0",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => localStorage.setItem("bgVariant", bgVariant), [bgVariant]);
  useEffect(() => localStorage.setItem("guidesH", guidesH ? "1" : "0"), [guidesH]);
  useEffect(() => localStorage.setItem("guidesV", guidesV ? "1" : "0"), [guidesV]);
  useEffect(() => localStorage.setItem("agendaOpen", agendaOpen ? "1" : "0"), [agendaOpen]);
  useEffect(() => localStorage.setItem("showTimer", showTimer ? "1" : "0"), [showTimer]);
  useEffect(() => {
    document.documentElement.dataset.design = design;
    localStorage.setItem("design", design);
  }, [design]);
  useEffect(() => localStorage.setItem("filtersOpen", filtersOpen ? "1" : "0"), [filtersOpen]);
  // hide-local: персист набора скрытых id.
  useEffect(
    () => localStorage.setItem(`hiddenIds:${pool.id}`, JSON.stringify([...hiddenIds])),
    [hiddenIds, pool.id],
  );
  // draft-autosave: persist черновика оценок, пока нет активной сессии (в сессии — БД источник правды).
  useEffect(() => {
    if (session) return;
    try {
      localStorage.setItem(`draftScores:${pool.id}`, JSON.stringify(scores));
    } catch {
      /* ignore quota errors */
    }
  }, [scores, session, pool.id]);

  // hide-local: скрыть/вернуть вопрос на доску (клиентски, не трогает банк/БД).
  const toggleHide = useCallback((id: string) => {
    setHiddenIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Таймеры: сброс «времени на вопрос» при смене текущего; старт «времени сессии» при первом выборе.
  useEffect(() => {
    if (!currentId) return;
    setQuestionStart(Date.now());
    setSessionStart((s) => {
      if (s != null) return s;
      const t = Date.now();
      localStorage.setItem(`timerStart:${pool.id}`, String(t));
      return t;
    });
  }, [currentId, pool.id]);
  useEffect(() => {
    if (!currentId && sessionStart == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [currentId, sessionStart]);

  const instance = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const nodeMap = useMemo(() => Object.fromEntries(graph.map((n) => [n.id, n])), [graph]);
  const allTags = useMemo(
    () => Array.from(new Set(graph.flatMap((n) => n.tags))).sort(),
    [graph],
  );
  // Видимый срез (активные фильтры) — для навигации «Дальше».
  const visibleIds = useMemo(() => {
    const anyTag = Object.values(activeTags).some(Boolean);
    const s = new Set<string>();
    for (const n of graph) {
      const tagOk = !anyTag || n.tags.some((t) => activeTags[t]);
      if (activeBlocks[n.block] !== false && activeDiffs[n.difficulty] && activeKinds[n.kind] && tagOk) {
        s.add(n.id);
      }
    }
    return s;
  }, [graph, activeBlocks, activeDiffs, activeKinds, activeTags]);

  // Строки агенды в порядке клавиатурной навигации, с заголовком при смене блока.
  const agendaRows = useMemo(() => {
    if (!placement) return [] as ({ kind: "head"; block: string } | { kind: "item"; node: QNode })[];
    const rows: ({ kind: "head"; block: string } | { kind: "item"; node: QNode })[] = [];
    let last: string | null = null;
    for (const id of placement.order.flat()) {
      const n = nodeMap[id];
      if (!n) continue;
      if (n.block !== last) {
        rows.push({ kind: "head", block: n.block });
        last = n.block;
      }
      rows.push({ kind: "item", node: n });
    }
    return rows;
  }, [placement, nodeMap]);

  const loadGraph = useCallback(
    () =>
      api
        .graph(pool.id)
        .then((g) => {
          setGraph(g.nodes);
          setErrors(g.errors);
          setPlacement(swimlaneLayout(g.nodes, pool));
        })
        .catch((err) => setErrors([{ file: "API", error: String(err) }])),
    [pool],
  );

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // question-management: удалить вопрос из банка (DELETE → перечитать граф → снять выбор/оценку).
  const deleteNode = useCallback(
    async (id: string) => {
      try {
        await api.deleteNode(id);
      } catch {
        alert(t("Не удалось удалить вопрос"));
        return;
      }
      await loadGraph();
      setSelectedId((s) => (s === id ? null : s));
      setCurrentId((c) => (c === id ? null : c));
      setScores((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [loadGraph],
  );

  // question-management: правка структурных полей вопроса (PUT → перечитать граф).
  const updateNode = useCallback(
    async (id: string, fields: NodeUpdate) => {
      try {
        await api.updateNode(id, fields);
      } catch {
        alert(t("Не удалось сохранить изменения"));
        return;
      }
      await loadGraph();
    },
    [loadGraph],
  );

  const rfNodes = useMemo(
    () =>
      placement
        ? buildNodes(graph, pool, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, query.toLowerCase().trim(), unscoredOnly, hiddenIds, showHidden, guidesH, guidesV, theme === "dark")
        : [],
    [graph, pool, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, query, unscoredOnly, hiddenIds, showHidden, guidesH, guidesV, theme],
  );

  const centerOn = useCallback(
    (id: string) => {
      const pos = placement?.positions[id];
      if (pos && instance.current) {
        instance.current.setCenter(pos.x + CARD_W / 2, pos.y + CARD_H / 2, { zoom: 1, duration: 400 });
      }
    },
    [placement],
  );

  const applyScore = useCallback(
    (nodeId: string, score: number) => {
      setScores((s) => ({ ...s, [nodeId]: score }));
      if (session) api.setScore(session.id, nodeId, score, notes[nodeId]).catch(() => void 0);
    },
    [session, notes],
  );

  // Заметка интервьюера на ноду: персистится вместе с оценкой (схема scores: score+note).
  const setNote = useCallback(
    (nodeId: string, text: string) => {
      setNotes((s) => ({ ...s, [nodeId]: text }));
      if (session && scores[nodeId] != null) {
        api.setScore(session.id, nodeId, scores[nodeId], text).catch(() => void 0);
      }
    },
    [session, scores],
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type !== "question") return;
    setSelectedId(node.id);
    setCurrentId(node.id);
  }, []);

  const moveCurrent = useCallback(
    (id: string) => {
      setCurrentId(id);
      centerOn(id);
    },
    [centerOn],
  );

  // «Дальше»: следующий НЕОЦЕНЁННЫЙ вопрос по порядку сетки (с переносом по кругу).
  const nextQuestion = useCallback(() => {
    if (!placement) return;
    // только видимый срез (активные фильтры)
    const flat = placement.order.flat().filter((id) => visibleIds.has(id));
    if (!flat.length) return;
    const start = currentId ? flat.indexOf(currentId) : -1;
    for (let k = 1; k <= flat.length; k++) {
      const id = flat[(start + k + flat.length) % flat.length];
      if (id && id !== currentId && scores[id] == null) {
        moveCurrent(id);
        return;
      }
    }
    moveCurrent(flat[(start + 1 + flat.length) % flat.length]);
  }, [placement, currentId, scores, moveCurrent, visibleIds]);

  // Клавиатура: 1-5 — оценка, Enter — открыть, стрелки — навигация, n — далее, Esc — снять текущий.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      // «?» открывает шпаргалку. Пока она открыта, ShortcutsHelp перехватывает клавиши в capture-фазе
      // (stopImmediatePropagation), поэтому сюда они не доходят и захват клавиатуры обеспечен там.
      if (e.key === "?") {
        setHelpOpen(true);
        return;
      }
      if (!placement) return;
      if (e.key >= "1" && e.key <= "5") {
        if (currentId) applyScore(currentId, Number(e.key));
        return;
      }
      if (e.key === "Enter") {
        if (currentId) setSelectedId(currentId);
        return;
      }
      if (e.key === "n") {
        nextQuestion();
        return;
      }
      if (e.key === "Escape" && !selectedId) {
        setCurrentId(null);
        return;
      }
      if (!e.key.startsWith("Arrow")) return;
      e.preventDefault();
      if (!currentId) {
        const id = placement.order[0]?.[0];
        if (id) moveCurrent(id);
        return;
      }
      const col = placement.colOf[currentId] ?? 0;
      const row = placement.rowOf[currentId] ?? 0;
      let target: string | undefined;
      if (e.key === "ArrowDown") target = placement.order[col]?.[Math.min(row + 1, placement.order[col].length - 1)];
      else if (e.key === "ArrowUp") target = placement.order[col]?.[Math.max(row - 1, 0)];
      else if (e.key === "ArrowRight") {
        for (let c = col + 1; c < placement.order.length; c++) {
          const arr = placement.order[c];
          if (arr?.length) {
            target = arr[Math.min(row, arr.length - 1)];
            break;
          }
        }
      } else if (e.key === "ArrowLeft") {
        for (let c = col - 1; c >= 0; c--) {
          const arr = placement.order[c];
          if (arr?.length) {
            target = arr[Math.min(row, arr.length - 1)];
            break;
          }
        }
      }
      if (target) moveCurrent(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement, currentId, selectedId, applyScore, moveCurrent, nextQuestion]);

  // Привязать активную сессию к адресу (#/board/<pool>?session=<id>) — ссылкой можно поделиться.
  // replaceState не шлёт hashchange: роутер не перерисовывает доску, состояние остаётся.
  const setSessionParam = useCallback(
    (id: number | null) => window.history.replaceState(null, "", href.board(pool.id, id)),
    [pool.id],
  );

  // Подключиться к уже существующей сессии (другой интервьюер / HR): подтянуть оценки.
  const joinSession = useCallback(
    async (id: number) => {
      try {
        const s = await api.getSession(id);
        setSession(s);
        setScores(scoresOf(s));
        setNotes(notesOf(s));
        setSessionParam(id);
      } catch {
        setSessionParam(null);
      }
    },
    [setSessionParam],
  );

  const leaveSession = useCallback(() => {
    setSession(null);
    setLive(false);
    setSessionParam(null);
  }, [setSessionParam]);

  // Авто-подключение по ?session=<id> при загрузке (старт с главной и «Открыть» со страницы сессий).
  useEffect(() => {
    if (sessionFromUrl) joinSession(sessionFromUrl);
  }, [joinSession, sessionFromUrl]);

  // Live-синхронизация: подписка на SSE-поток активной сессии. Входящие снимки
  // сливаются объединением, чтобы не затирать только что выставленную локальную оценку.
  useEffect(() => {
    if (!session) return;
    const es = new EventSource(api.eventsUrl(session.id));
    const merge = (e: MessageEvent) => {
      try {
        const snap = JSON.parse(e.data) as Session;
        setScores((prev) => ({ ...prev, ...scoresOf(snap) }));
        setNotes((prev) => ({ ...prev, ...notesOf(snap) }));
      } catch {
        /* ignore malformed frame */
      }
    };
    es.addEventListener("snapshot", merge as EventListener);
    es.addEventListener("update", merge as EventListener);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => {
      es.close();
      setLive(false);
    };
  }, [session]);

  const toggleBlock = (b: string) => setActiveBlocks((s) => ({ ...s, [b]: !s[b] }));
  const toggleDiff = (d: Difficulty) => setActiveDiffs((s) => ({ ...s, [d]: !s[d] }));
  const toggleTag = (t: string) => setActiveTags((s) => ({ ...s, [t]: !s[t] }));
  const clearTags = () => setActiveTags({});
  const toggleKind = (k: string) => setActiveKinds((s) => ({ ...s, [k]: !s[k] }));

  const scored = Object.keys(scores).length;
  const avg = scored > 0 ? (Object.values(scores).reduce((a, b) => a + b, 0) / scored).toFixed(1) : "—";
  // Позиция/грейд кандидата и имя интервьюера — для шапки отчёта; грузим по факту сессии.
  const [reportPeople, setReportPeople] = useState<{ interviewer: string | null; position: string | null; seniority: string | null }>(
    { interviewer: null, position: null, seniority: null },
  );
  useEffect(() => {
    if (!session) {
      setReportPeople({ interviewer: null, position: null, seniority: null });
      return;
    }
    let alive = true; // ответ по уже сменившейся сессии не должен перетереть актуальный
    Promise.all([api.listCandidates().catch(() => []), api.listInterviewers().catch(() => [])]).then(([cs, ivs]) => {
      if (!alive) return;
      const cand = cs.find((c) => c.id === session.candidate_id);
      const iv = ivs.find((i) => i.id === session.interviewer_id);
      setReportPeople({ interviewer: iv?.name ?? null, position: cand?.position ?? null, seniority: cand?.seniority ?? null });
    });
    return () => {
      alive = false;
    };
  }, [session]);
  const progress = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const b of blockOrder(pool)) out[b] = { done: 0, total: 0 };
    for (const n of graph) {
      out[n.block] ??= { done: 0, total: 0 };
      out[n.block].total++;
      if (scores[n.id] != null) out[n.block].done++;
    }
    return out;
  }, [graph, scores, pool]);

  const anyTagActive = Object.values(activeTags).some(Boolean);
  // Свёрнутая панель не должна прятать факт, что доска отфильтрована, — отсюда точка-индикатор.
  const anyFilterOn =
    anyTagActive ||
    query.trim() !== "" ||
    unscoredOnly ||
    blockOrder(pool).some((b) => !activeBlocks[b]) ||
    DIFFS.some((d) => !activeDiffs[d]) ||
    KINDS.some((k) => !activeKinds[k]);
  // Прогресс по ТЕКУЩЕМУ отфильтрованному набору. Условие "проходит фильтры" держать в
  // синхроне с предикатом `dimmed` в buildNodes (block/diff/kind/tag).
  const coverage = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const n of graph) {
      const tagOk = !anyTagActive || n.tags.some((t) => activeTags[t]);
      if (activeBlocks[n.block] !== false && activeDiffs[n.difficulty] && activeKinds[n.kind] && tagOk) {
        total++;
        if (scores[n.id] != null) done++;
      }
    }
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [graph, scores, activeBlocks, activeDiffs, activeKinds, activeTags, anyTagActive]);
  const currentNode = currentId ? nodeMap[currentId] : null;
  const selectedNode = selectedId ? nodeMap[selectedId] : null;

  return (
    <div className="app">
      <header className="topbar">
        {/* ряд 1 — где мы: назад в меню, направление, прогресс, настройки */}
        <div className="topbar__row topbar__row--flow">
          <a className="topbar__back" href={href.home} title={t("Главное меню")}>{t("← Меню")}</a>
          <h1 className="appname">{pool.label}</h1>
          <span className="muted">{t("{n} вопросов", { n: graph.length })}</span>
          <div className="progress" title={t("Оценено по текущему набору фильтров")}>
            <div className="progress__track">
              <div className="progress__fill" style={{ width: `${coverage.pct}%` }} />
            </div>
            <span className="progress__label">
              {t("оценено {done} / {total} ({pct}%)", { done: coverage.done, total: coverage.total, pct: coverage.pct })}
            </span>
          </div>
          <LangSwitch />
          <div className="settings topbar__settings">
            <button
              className={`iconbtn setbtn btn--quiet ${settingsOpen ? "setbtn--on" : ""}`}
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
              title={t("Настройки")}
            >
              ⚙
            </button>
            {settingsOpen && (
              <SettingsMenu
                onClose={() => setSettingsOpen(false)}
                settings={{
                  design,
                  onSetDesign: setDesign,
                  theme,
                  onToggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
                  bgDots: bgVariant === "dots",
                  onToggleBgDots: () => setBgVariant((v) => (v === "dots" ? "off" : "dots")),
                  guidesV,
                  onToggleGuidesV: () => setGuidesV((v) => !v),
                  guidesH,
                  onToggleGuidesH: () => setGuidesH((v) => !v),
                  agendaOpen,
                  onToggleAgenda: () => setAgendaOpen((v) => !v),
                  showHidden,
                  onToggleHidden: () => setShowHidden((v) => !v),
                  hiddenCount: hiddenIds.size,
                  showTimer,
                  onToggleTimer: () => setShowTimer((v) => !v),
                  onShowHelp: () => setHelpOpen(true),
                  bankHref: href.bank(pool.id),
                }}
              />
            )}
          </div>
        </div>

        {/* ряд 2 — ход интервью: кандидат, сессия, результат */}
        <div className="topbar__row topbar__row--utility">
        <div className="session">
          {session ? (
            <>
              <span className="session__active">
                👤 {session.candidate}
                {" · "}{t("оценено {scored} · средн. {avg}", { scored, avg })}
              </span>
              <span
                className={`livedot ${live ? "livedot--on" : ""}`}
                title={live ? t("Live: изменения синхронизируются с HR") : t("Подключение к live…")}
              >
                ● {live ? "LIVE" : "…"}
              </span>
              <button className="iconbtn" onClick={leaveSession} title={t("Выйти из сессии")}>
                {t("Выйти")}
              </button>
            </>
          ) : (
            <>
              <span className="session__none muted">{t("Просмотр без сессии")}</span>
              <a className="session__start" href={href.start(pool.id)}>{t("Начать интервью →")}</a>
            </>
          )}
          <span className="session__sep" aria-hidden="true" />
          <button
            className="iconbtn dlbtn"
            onClick={() => downloadReport(session?.candidate ?? "", graph, scores, pool, notes, reportPeople)}
            disabled={scored === 0}
            title={scored === 0 ? t("Сначала выставьте оценки") : t("Скачать результаты (HTML)")}
          >
            {t("Скачать")}
          </button>
          {graph.length > 0 && scored === graph.length && (
            <button
              className="cta-done"
              onClick={() => downloadReport(session?.candidate ?? "", graph, scores, pool, notes, reportPeople)}
              title={t("Все вопросы оценены — скачать итоговый отчёт")}
            >
              {t("Завершить · Скачать отчёт")}
            </button>
          )}
        </div>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="errbar">
          {t("⚠ Ошибки импорта ({n}):", { n: errors.length })}{" "}
          {errors.map((e, i) => (
            <span key={i} className="erritem">
              {e.file}: {e.error}
            </span>
          ))}
        </div>
      )}

      <div className="main">
        {agendaOpen && placement && (
          <aside className="interview">
            <h4>{t("Агенда")} · {agendaRows.filter((r) => r.kind === "item").length}</h4>
            {agendaRows.map((r, i) =>
              r.kind === "head" ? (
                <div key={`h-${r.block}-${i}`} className="iv-block" style={{ color: blockColor(pool, r.block) }}>
                  {blockLabel(pool, r.block)}
                </div>
              ) : (
                <button
                  key={r.node.id}
                  className={[
                    "ivbtn",
                    r.node.id === currentId ? "ivbtn--current" : "",
                    scores[r.node.id] != null ? "ivbtn--scored" : "",
                  ].join(" ")}
                  style={{ borderLeftColor: blockColor(pool, r.node.block) }}
                  onClick={() => moveCurrent(r.node.id)}
                  title={r.node.question}
                >
                  {scores[r.node.id] != null && <span className="ivbtn__check">✓</span>}
                  {r.node.title || r.node.topic}
                </button>
              ),
            )}
          </aside>
        )}
        <div className="canvas">
          {rfNodes.length === 0 ? (
            <div className="loading">{t("Загрузка графа…")}</div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={NO_EDGES}
              nodeTypes={nodeTypes}
              colorMode={theme}
              onNodeClick={onNodeClick}
              onInit={(inst) => {
                instance.current = inst;
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              // Читаемый дефолт: верхний-левый угол доски при зуме 0.5 (карточки ~140px,
              // читаются при открытии). Не fitView — тот ужимает все 61 карту до ~62px.
              // Все board-координаты ≥10 → первый .qnode остаётся в кадре (x,y ≥ 0).
              defaultViewport={{ x: 20, y: 20, zoom: 0.5 }}
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
            >
              {bgVariant === "dots" && <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />}
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) =>
                  n.type === "question"
                    ? ((n.data as { color?: string })?.color ?? "#999")
                    : "rgba(100,116,139,0.18)"
                }
                pannable
                zoomable
              />

              <Panel position="top-right">
                <div
                  className={`filterpanel ${filtersOpen ? "" : "filterpanel--closed"}`}
                  role="region"
                  aria-label={t("Фильтры вопросов")}
                >
                  <div className="fp__bar">
                    <button
                      className="fp__toggle"
                      onClick={() => setFiltersOpen((v) => !v)}
                      aria-expanded={filtersOpen}
                      title={filtersOpen ? t("Свернуть фильтры") : t("Развернуть фильтры")}
                    >
                      {t("Фильтры")}
                      <span className="fp__chevron">{filtersOpen ? "▸" : "◂"}</span>
                    </button>
                    {!filtersOpen && anyFilterOn && <span className="fp__badge" title={t("Фильтры активны")} />}
                  </div>
                  {filtersOpen && (
                  <>
                  <input
                    className="fp__search"
                    placeholder={t("Поиск по вопросам…")}
                    aria-label={t("Поиск по вопросам")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="fp__group">
                    <h2 className="fp__title">{t("Блоки")}</h2>
                    {blockOrder(pool).map((b) => (
                      <button
                        key={b}
                        className={`fp__chip ${activeBlocks[b] ? "" : "fp__chip--off"}`}
                        style={{
                          borderColor: blockColor(pool, b),
                          color: activeBlocks[b] ? "#fff" : blockColor(pool, b),
                          background: activeBlocks[b] ? blockColor(pool, b) : "transparent",
                        }}
                        onClick={() => toggleBlock(b)}
                      >
                        {blockLabel(pool, b)} {progress[b].done}/{progress[b].total}
                      </button>
                    ))}
                  </div>
                  <div className="fp__group">
                    <h2 className="fp__title">{t("Сложность")}</h2>
                    {DIFFS.map((d) => (
                      <button
                        key={d}
                        className={`fp__chip ${activeDiffs[d] ? "" : "fp__chip--off"}`}
                        style={{
                          borderColor: DIFF_COLOR[d],
                          color: activeDiffs[d] ? "#fff" : DIFF_COLOR[d],
                          background: activeDiffs[d] ? DIFF_COLOR[d] : "transparent",
                        }}
                        onClick={() => toggleDiff(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="fp__group">
                    <h2 className="fp__title">{t("Тип")}</h2>
                    {KINDS.map((k) => (
                      <button
                        key={k}
                        className={`fp__chip ${activeKinds[k] ? "" : "fp__chip--off"}`}
                        style={{
                          borderColor: KIND_COLOR[k],
                          color: activeKinds[k] ? "#fff" : KIND_COLOR[k],
                          background: activeKinds[k] ? KIND_COLOR[k] : "transparent",
                        }}
                        onClick={() => toggleKind(k)}
                      >
                        {t(KIND_LABEL[k])}
                      </button>
                    ))}
                  </div>
                  <div className="fp__group">
                    <h2 className="fp__title">{t("Прогресс")}</h2>
                    <button
                      className={`fp__chip ${unscoredOnly ? "" : "fp__chip--off"}`}
                      style={{
                        borderColor: "#16a34a",
                        color: unscoredOnly ? "#fff" : "#16a34a",
                        background: unscoredOnly ? "#16a34a" : "transparent",
                      }}
                      onClick={() => setUnscoredOnly((v) => !v)}
                    >
                      {t("Только неоценённые")}
                    </button>
                  </div>
                  <div className="fp__group fp__group--tags">
                    <div className="fp__title">
                      <button
                        className="fp__collapse"
                        onClick={() => setTagsCollapsed((v) => !v)}
                        title={tagsCollapsed ? t("Развернуть теги") : t("Свернуть теги")}
                      >
                        {tagsCollapsed ? "▸" : "▾"} {t("Теги")}
                      </button>
                      {anyTagActive && (
                        <button className="fp__clear" onClick={clearTags}>
                          {t("сбросить")}
                        </button>
                      )}
                    </div>
                    {!tagsCollapsed &&
                      allTags.map((t) => (
                        <button
                          key={t}
                          className={`fp__tag ${activeTags[t] ? "fp__tag--on" : ""}`}
                          onClick={() => toggleTag(t)}
                        >
                          {t}
                        </button>
                      ))}
                  </div>
                  </>
                  )}
                </div>
              </Panel>

              {currentNode && (
                <Panel position="bottom-center">
                  <div className="hud">
                    <span className="hud__diff" data-diff={currentNode.difficulty}>
                      {currentNode.difficulty}
                    </span>
                    <span className="hud__title" title={currentNode.question}>
                      {currentNode.title || currentNode.question}
                    </span>
                    {showTimer && (
                      <span className="hud__timer" title={t("Время на вопрос · вся сессия")}>
                        ⏱ {mmss(now - questionStart)}
                        {sessionStart != null && ` · ${mmss(now - sessionStart)}`}
                      </span>
                    )}
                    <span className="hud__progress">
                      {scored}/{graph.length} · {currentNode.topic}
                    </span>
                    <span className="hud__score">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <button
                          key={i}
                          className={
                            scores[currentId!] != null && i <= scores[currentId!]
                              ? "scorebtn scorebtn--on"
                              : "scorebtn"
                          }
                          onClick={() => applyScore(currentId!, i)}
                        >
                          ●
                        </button>
                      ))}
                    </span>
                    <button onClick={() => setSelectedId(currentId)}>{t("Открыть")}</button>
                    <button className="btn--primary" onClick={nextQuestion}>
                      {t("Дальше →")}
                    </button>
                    <button className="hud__cancel" onClick={() => setCurrentId(null)} title={t("Снять выбор (Esc)")}>
                      ✕
                    </button>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          )}
        </div>

        <DetailDrawer
          node={selectedNode}
          pool={pool}
          score={selectedId ? scores[selectedId] : undefined}
          note={selectedId ? notes[selectedId] : undefined}
          fullscreen={fullscreen}
          hidden={selectedId ? hiddenIds.has(selectedId) : false}
          onToggleHide={toggleHide}
          onScore={applyScore}
          onNote={setNote}
          onDelete={deleteNode}
          onUpdate={updateNode}
          onToggleFullscreen={() => setFullscreen((f) => !f)}
          onClose={() => {
            setSelectedId(null);
            setFullscreen(false);
          }}
        />
      </div>
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
