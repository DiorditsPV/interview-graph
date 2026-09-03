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
import {
  ArrowLeft,
  BookOpen,
  CircleHelp,
  Download,
  Ellipsis,
  Play,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type NodeUpdate } from "../api";
import { BandsNode } from "../components/BandsNode";
import { BlockGroupNode } from "../components/BlockGroupNode";
import { LangSwitch } from "../components/LangSwitch";
import { FinishModal, decisionLabel } from "../components/FinishModal";
import { SettingsMenu } from "../components/SettingsMenu";
import { nWord, useT } from "../i18n";
import { DetailDrawer } from "../components/DetailDrawer";
import { GuidesNode } from "../components/GuidesNode";
import { QuestionNode } from "../components/QuestionNode";
import { ShortcutsHelp } from "../components/ShortcutsHelp";
import { SubHeadNode } from "../components/SubHeadNode";
import { downloadBank, downloadReport } from "../report";
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

// Dropdown'ы toolbar'а (экспорт, •••) закрываются кликом мимо и Esc. Esc глушим в capture-фазе:
// иначе глобальный хоткей доски снимет текущий вопрос. mousedown — тоже capture: канва React Flow
// гасит всплытие. «Мимо» — всё вне корня dropdown'а (`within`: кнопка + меню).
function useDismiss(open: boolean, close: () => void, within: string) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el && el.closest(within)) return;
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onDown, { capture: true });
    };
  }, [open, close, within]);
}

// Иконки toolbar'а — только outline Lucide с единым stroke-width (как на главной).
const ICON = { strokeWidth: 1.75 } as const;

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
  planIds: Set<string> | null,
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
    // План интервью (сессия с plan): вопросы вне набора гаснут и не выбираются, как отфильтрованные.
    const dimmed =
      (planIds != null && !planIds.has(n.id)) ||
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
  const [finishOpen, setFinishOpen] = useState(false); // итог интервью (решение + комментарий)
  // Dropdown'ы toolbar'а: «Экспорт» и «•••».
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  // Панель фильтров — popover у правого края канвы, открывается кнопкой toolbar'а; по умолчанию
  // закрыта (поверх канвы она съедает правую треть доски), выбор запоминается.
  const [filtersOpen, setFiltersOpen] = useState<boolean>(
    () => localStorage.getItem("filtersOpen") === "1",
  );
  const closeExport = useCallback(() => setExportOpen(false), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismiss(exportOpen, closeExport, ".tbdrop--export");
  useDismiss(moreOpen, closeMore, ".tbdrop--more");

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
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Стартовый viewport: зум 0.5 (карточки читаются), доска — по центру канвы. Если доска шире
  // или выше канвы, прижимаем её к левому/верхнему краю с отступом, чтобы первая карточка была
  // в кадре. Доска в board-координатах занимает x ∈ [-LABEL_W, width], y ∈ [0, height].
  const centerBoard = useCallback(() => {
    const inst = instance.current;
    const el = canvasRef.current;
    if (!inst || !el || !placement) return;
    const zoom = 0.5;
    const bw = (LABEL_W + placement.width) * zoom;
    const bh = placement.height * zoom;
    // Открытая панель фильтров лежит поверх канвы справа — центрируем в свободной части.
    const panel = filtersOpen ? el.querySelector<HTMLElement>(".filterpanel") : null;
    const cw = el.clientWidth - (panel ? panel.offsetWidth + 24 : 0);
    const ch = el.clientHeight;
    const x = (bw < cw - 40 ? (cw - bw) / 2 : 20) + LABEL_W * zoom;
    const y = bh < ch - 40 ? (ch - bh) / 2 : 20;
    inst.setViewport({ x, y, zoom });
  }, [placement, filtersOpen]);
  useEffect(() => {
    centerBoard();
  }, [centerBoard]);
  useEffect(() => {
    window.addEventListener("resize", centerBoard);
    return () => window.removeEventListener("resize", centerBoard);
  }, [centerBoard]);
  const nodeMap = useMemo(() => Object.fromEntries(graph.map((n) => [n.id, n])), [graph]);
  const allTags = useMemo(
    () => Array.from(new Set(graph.flatMap((n) => n.tags))).sort(),
    [graph],
  );
  // План интервью: порядок вопросов сессии (sessions.plan.order). null — сессия без плана / нет сессии:
  // доска ведёт по всей матрице, как раньше.
  const planOrder = useMemo(() => session?.plan?.order ?? null, [session]);
  const planIds = useMemo(() => (planOrder ? new Set(planOrder) : null), [planOrder]);

  // Видимый срез (активные фильтры и план) — для навигации «Дальше».
  const visibleIds = useMemo(() => {
    const anyTag = Object.values(activeTags).some(Boolean);
    const s = new Set<string>();
    for (const n of graph) {
      const tagOk = !anyTag || n.tags.some((t) => activeTags[t]);
      const inPlan = planIds == null || planIds.has(n.id);
      if (inPlan && activeBlocks[n.block] !== false && activeDiffs[n.difficulty] && activeKinds[n.kind] && tagOk) {
        s.add(n.id);
      }
    }
    return s;
  }, [graph, activeBlocks, activeDiffs, activeKinds, activeTags, planIds]);

  // Порядок обхода: план сессии, иначе порядок сетки (колонка за колонкой).
  const walkOrder = useMemo(
    () => planOrder ?? (placement ? placement.order.flat() : []),
    [planOrder, placement],
  );

  // Строки агенды в порядке обхода, с заголовком при смене блока.
  const agendaRows = useMemo(() => {
    if (!placement) return [] as ({ kind: "head"; block: string } | { kind: "item"; node: QNode })[];
    const rows: ({ kind: "head"; block: string } | { kind: "item"; node: QNode })[] = [];
    let last: string | null = null;
    for (const id of walkOrder) {
      const n = nodeMap[id];
      if (!n) continue;
      if (n.block !== last) {
        rows.push({ kind: "head", block: n.block });
        last = n.block;
      }
      rows.push({ kind: "item", node: n });
    }
    return rows;
  }, [placement, nodeMap, walkOrder]);

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
        ? buildNodes(graph, pool, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, query.toLowerCase().trim(), unscoredOnly, hiddenIds, showHidden, guidesH, guidesV, theme === "dark", planIds)
        : [],
    [graph, pool, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, query, unscoredOnly, hiddenIds, showHidden, guidesH, guidesV, theme, planIds],
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

  // «Дальше»: следующий НЕОЦЕНЁННЫЙ вопрос по порядку обхода (план или сетка), с переносом по кругу.
  const nextQuestion = useCallback(() => {
    if (!placement) return;
    // только видимый срез (активные фильтры и план)
    const flat = walkOrder.filter((id) => visibleIds.has(id));
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
  }, [placement, currentId, scores, moveCurrent, visibleIds, walkOrder]);

  // Сессия с планом: стартуем с первого неоценённого вопроса плана, как только доска готова.
  useEffect(() => {
    if (!planOrder || !placement || currentId) return;
    const first = planOrder.find((id) => scores[id] == null && placement.positions[id]) ?? planOrder[0];
    if (first && placement.positions[first]) moveCurrent(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planOrder, placement]);

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
    setUnscoredOnly(false); // чип «Только неоценённые» есть только в сессии — фильтр не должен остаться висеть
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
  // В сессии с планом прогресс считается по плану, а не по фильтрам.
  const coverage = useMemo(() => {
    let total = 0;
    let done = 0;
    if (planOrder) {
      for (const id of planOrder) {
        total++;
        if (scores[id] != null) done++;
      }
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }
    for (const n of graph) {
      const tagOk = !anyTagActive || n.tags.some((t) => activeTags[t]);
      if (activeBlocks[n.block] !== false && activeDiffs[n.difficulty] && activeKinds[n.kind] && tagOk) {
        total++;
        if (scores[n.id] != null) done++;
      }
    }
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [graph, scores, activeBlocks, activeDiffs, activeKinds, activeTags, anyTagActive, planOrder]);
  const currentNode = currentId ? nodeMap[currentId] : null;
  const selectedNode = selectedId ? nodeMap[selectedId] : null;

  const nQuestions = `${graph.length} ${nWord(graph.length, ["вопрос", "вопроса", "вопросов"], ["question", "questions"])}`;
  const doReport = () => downloadReport(session?.candidate ?? "", graph, scores, pool, notes, reportPeople, session);
  // Завершение: статус finished + решение и комментарий; сессия остаётся открытой для просмотра/правки итога.
  const finishSession = async (decision: "hire" | "no_hire" | "hold", summary: string) => {
    if (!session) return;
    try {
      const s = await api.finishSession(session.id, { decision, summary });
      setSession(s);
      setFinishOpen(false);
    } catch {
      alert(t("Не удалось завершить интервью"));
    }
  };

  return (
    <div className="app">
      {/* Toolbar (ТЗ 10–14): один ряд — слева «где мы» (назад, направление, число вопросов), справа
          действия (фильтры, экспорт, старт, язык, •••). Ход интервью — второй ряд, и только когда
          сессия активна; общего процента прохождения вне сессии нет. */}
      <header className="topbar">
        <div className="topbar__row topbar__row--main">
          <div className="topbar__left">
            <a className="topbar__back" href={href.home} title={t("Главное меню")}>
              <ArrowLeft size={16} {...ICON} aria-hidden="true" />
              {t("Направления")}
            </a>
            <h1 className="appname">{pool.label}</h1>
            <span className="topbar__count">{nQuestions}</span>
          </div>
          <div className="topbar__right">
            <button
              className="tbbtn filtersbtn"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-pressed={filtersOpen}
              title={t("Фильтры вопросов")}
            >
              <SlidersHorizontal size={16} {...ICON} aria-hidden="true" />
              {t("Фильтры")}
              {anyFilterOn && <span className="filtersbtn__dot" title={t("Фильтры активны")} />}
            </button>
            <div className="tbdrop tbdrop--export">
              <button
                className="tbbtn exportbtn"
                onClick={() => setExportOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
              >
                <Download size={16} {...ICON} aria-hidden="true" />
                {t("Экспорт")}
              </button>
              {exportOpen && (
                <div className="tbmenu exportmenu" role="menu">
                  {/* Только реально доступные форматы — их два, оба HTML. */}
                  <button
                    className="tbmenu__item dlbtn"
                    role="menuitem"
                    disabled={scored === 0}
                    title={scored === 0 ? t("Сначала выставьте оценки") : undefined}
                    onClick={() => { setExportOpen(false); doReport(); }}
                  >
                    {t("Отчёт по сессии (HTML)")}
                  </button>
                  <button
                    className="tbmenu__item bankbtn"
                    role="menuitem"
                    onClick={() => { setExportOpen(false); downloadBank(graph, pool); }}
                  >
                    {t("Банк вопросов (HTML)")}
                  </button>
                </div>
              )}
            </div>
            {/* В сессии мы уже находимся — старт нового интервью из toolbar'а не предлагаем. */}
            {!session && (
              <a
                className="tbbtn session__start btn--primary"
                // Настройка интервью получает текущие фильтры доски: выбранная область → набор вопросов.
                href={href.setup(pool.id, {
                  blocks: blockOrder(pool).filter((b) => activeBlocks[b] !== false),
                  diffs: DIFFS.filter((d) => activeDiffs[d]),
                })}
              >
                <Play size={15} strokeWidth={2} aria-hidden="true" />
                {t("Начать интервью →")}
              </a>
            )}
            <LangSwitch />
            <div className="tbdrop tbdrop--more">
              <button
                className="tbbtn tbbtn--icon morebtn"
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label={t("Ещё")}
                title={t("Ещё")}
              >
                <Ellipsis size={18} {...ICON} />
              </button>
              {moreOpen && (
                <div className="tbmenu moremenu" role="menu">
                  <button
                    className="tbmenu__item setbtn"
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); setSettingsOpen(true); }}
                  >
                    <Settings size={16} {...ICON} aria-hidden="true" />
                    {t("Настройки")}
                  </button>
                  <button
                    className="tbmenu__item helpbtn"
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); setHelpOpen(true); }}
                  >
                    <CircleHelp size={16} {...ICON} aria-hidden="true" />
                    {t("Шпаргалка клавиш")}
                  </button>
                  <a className="tbmenu__item bankLink" role="menuitem" href={href.bank(pool.id)}>
                    <BookOpen size={16} {...ICON} aria-hidden="true" />
                    {t("Открыть вопросы")}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ряд 2 — ход интервью: только в активной сессии (кандидат, прогресс, live, выход) */}
        {session && (
          <div className="topbar__row topbar__row--session">
            <div className="session">
              <span className="session__active">
                {t("Кандидат: {name} · Сессия #{id}", { name: session.candidate, id: session.id })}
              </span>
              <div className="progress" title={t("Оценено по текущему набору фильтров")}>
                <div className="progress__track">
                  <div className="progress__fill" style={{ width: `${coverage.pct}%` }} />
                </div>
                <span className="progress__label">
                  {t("оценено {done} / {total} ({pct}%)", { done: coverage.done, total: coverage.total, pct: coverage.pct })}
                </span>
              </div>
              <span
                className={`livedot ${live ? "livedot--on" : ""}`}
                title={live ? t("Live: изменения синхронизируются с HR") : t("Подключение к live…")}
              >
                ● {live ? "LIVE" : "…"}
              </span>
              <div className="session__actions">
                {session.status === "finished" && (
                  <span className={`session__status badge badge--${session.decision ?? "done"}`} title={session.summary ?? ""}>
                    {t("Завершена")} · {decisionLabel(t, session.decision)}
                  </span>
                )}
                {/* «Завершить» доступно всегда: итог можно подвести и по части плана; у завершённой — правка итога. */}
                <button
                  className={`tbbtn cta-done ${session.status !== "finished" && coverage.total > 0 && coverage.done === coverage.total ? "btn--primary" : ""}`}
                  onClick={() => setFinishOpen(true)}
                  title={session.status === "finished" ? t("Итог") : t("Завершить интервью")}
                >
                  {session.status === "finished" ? t("Итог") : t("Завершить")}
                </button>
                <button className="tbbtn btn--quiet session__leave" onClick={leaveSession} title={t("Выйти из сессии")}>
                  <X size={15} {...ICON} aria-hidden="true" />
                  {t("Выйти")}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {finishOpen && session && (
        <FinishModal
          session={session}
          scored={coverage.done}
          total={coverage.total}
          onClose={() => setFinishOpen(false)}
          onFinish={finishSession}
        />
      )}

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
        <div className="canvas" ref={canvasRef}>
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
                centerBoard();
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              // Первый кадр до centerBoard: зум 0.5 (карточки ~140px, читаются при открытии).
              // Не fitView — тот ужимает все 61 карту до ~62px.
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

              {filtersOpen && (
                <Panel position="top-right">
                  <div className="filterpanel" role="region" aria-label={t("Фильтры вопросов")}>
                    <div className="fp__head">
                      <h2 className="fp__heading">{t("Фильтры")}</h2>
                      <button
                        className="fp__close"
                        onClick={() => setFiltersOpen(false)}
                        aria-label={t("Закрыть фильтры")}
                        title={t("Закрыть фильтры")}
                      >
                        <X size={16} {...ICON} aria-hidden="true" />
                      </button>
                    </div>
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
                    {/* Прогресс-фильтр — только в сессии (ТЗ 13): без неё оценки — черновик, не ход интервью. */}
                    {session && (
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
                    )}
                    <div className="fp__group fp__group--tags">
                      <div className="fp__title">
                        {t("Теги")}
                        {anyTagActive && (
                          <button className="fp__clear" onClick={clearTags}>
                            {t("сбросить")}
                          </button>
                        )}
                      </div>
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          className={`fp__tag ${activeTags[tag] ? "fp__tag--on" : ""}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </Panel>
              )}

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
                      {planOrder
                        ? `${Math.max(0, planOrder.indexOf(currentNode.id)) + 1}/${planOrder.length}`
                        : `${scored}/${graph.length}`}
                      {" · "}
                      {currentNode.topic}
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
      {/* Панель ⚙ (открывается из •••): fixed-drawer слева; обёртка .settings нужна её проверке «клик мимо». */}
      {settingsOpen && (
        <div className="settings">
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
        </div>
      )}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
