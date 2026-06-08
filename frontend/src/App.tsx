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
import { api, type NodeCreate, type NodeUpdate } from "./api";
import { BandsNode } from "./components/BandsNode";
import { BankBrowser } from "./components/BankBrowser";
import { BlockGroupNode } from "./components/BlockGroupNode";
import { CompareModal } from "./components/CompareModal";
import { DetailDrawer } from "./components/DetailDrawer";
import { GuidesNode } from "./components/GuidesNode";
import { QuestionNode } from "./components/QuestionNode";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { SubHeadNode } from "./components/SubHeadNode";
import { UploadModal } from "./components/UploadModal";
import { downloadBank, downloadReport } from "./report";
import {
  BLOCK_ORDER,
  CARD_H,
  CARD_W,
  DIFFS,
  LABEL_W,
  subOf,
  swimlaneLayout,
  type Placement,
} from "./layout";
import {
  BLOCK_COLOR,
  BLOCK_LABEL,
  DIFF_COLOR,
  nodeInTrack,
  type Block,
  type Candidate,
  type Difficulty,
  type ImportErr,
  type Interviewer,
  type QNode,
  type Session,
  type SessionMeta,
  type SessionSummary,
  type Track,
} from "./types";

// Снимок сессии с сервера → плоская карта оценок, которой оперирует UI.
function scoresOf(s: { scores: Session["scores"] }): Record<string, number> {
  return Object.fromEntries(Object.entries(s.scores).map(([id, v]) => [id, v.score]));
}

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
  p: Placement,
  scores: Record<string, number>,
  currentId: string | null,
  selectedId: string | null,
  activeBlocks: Record<string, boolean>,
  activeDiffs: Record<string, boolean>,
  activeTags: Record<string, boolean>,
  activeKinds: Record<string, boolean>,
  trackInclude: string[],
  query: string,
  unscoredOnly: boolean,
  hiddenIds: Set<string>,
  showHidden: boolean,
  guidesH: boolean,
  guidesV: boolean,
): Node[] {
  const nodes: Node[] = [];
  const anyTag = Object.values(activeTags).some(Boolean);

  nodes.push({
    id: "bg-bands",
    type: "bands",
    position: { x: -LABEL_W, y: 0 },
    data: { bands: p.bands, width: p.width, labelW: LABEL_W, height: p.height },
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
      data: { block: bg.block, width: bg.width, height: bg.height, count: blockNodes.length, done, split: bg.split },
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
      data: { block: col.block, label: col.label, width: col.width, count: colNodes.length, done },
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
      !activeBlocks[n.block] ||
      !activeDiffs[n.difficulty] ||
      !activeKinds[n.kind] ||
      !tagOk ||
      !nodeInTrack(n, trackInclude) ||
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
      data: { node: n, score: scores[n.id], current: n.id === currentId, dimmed, hidden: hidden && showHidden },
      selected: n.id === selectedId,
      draggable: false,
      selectable: !dimmed,
      style: dimmed ? { pointerEvents: "none" } : undefined,
      zIndex: n.id === currentId ? 5 : n.id === selectedId ? 4 : 1,
    });
  }
  return nodes;
}

// hide-local: набор локально скрытых id (в localStorage). Читаем безопасно.
function readHiddenIds(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem("hiddenIds") || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

// draft-autosave: черновик оценок (без активной сессии) — устойчивость к refresh/крашу.
function readDraftScores(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem("draftScores") || "{}");
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "number") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

const ALL_BLOCKS: Record<string, boolean> = Object.fromEntries(BLOCK_ORDER.map((b) => [b, true]));
const ALL_DIFFS: Record<string, boolean> = Object.fromEntries(DIFFS.map((d) => [d, true]));
const KINDS = ["question", "task"] as const;
const KIND_LABEL: Record<string, string> = { question: "вопрос", task: "задача" };
const KIND_COLOR: Record<string, string> = { question: "#2563eb", task: "#9333ea" };
const ALL_KINDS: Record<string, boolean> = { question: true, task: true };
// question-management: пустой черновик формы добавления вопроса.
const EMPTY_ADD = {
  block: "databases",
  topic: "",
  difficulty: "middle",
  kind: "question",
  title: "",
  question: "",
  answer: "",
  tags: "",
};

export default function App() {
  const [graph, setGraph] = useState<QNode[]>([]);
  const [errors, setErrors] = useState<ImportErr[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(readDraftScores);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showBank, setShowBank] = useState(false);
  // hide-local: скрытые с доски вопросы (клиентски) + тумблер показа.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(readHiddenIds);
  const [showHidden, setShowHidden] = useState(false);
  // question-management: модалка добавления вопроса + её черновик.
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(EMPTY_ADD);
  const [session, setSession] = useState<Session | null>(null);
  const [candidate, setCandidate] = useState("");
  // people-schema: кандидаты/интервьюеры как сущности БД + выбор при старте сессии.
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [pickedCandidateId, setPickedCandidateId] = useState<number | null>(null);
  const [pickedInterviewerId, setPickedInterviewerId] = useState<number | null>(null);
  const [candPosition, setCandPosition] = useState("");
  const [candSeniority, setCandSeniority] = useState("");
  const [pastSessions, setPastSessions] = useState<SessionSummary[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [live, setLive] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [sessionStart, setSessionStart] = useState<number | null>(() => {
    const v = localStorage.getItem("timerStart");
    return v ? Number(v) : null;
  });
  const [questionStart, setQuestionStart] = useState<number>(() => Date.now());
  const [compareOpen, setCompareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [activeBlocks, setActiveBlocks] = useState<Record<string, boolean>>(ALL_BLOCKS);
  const [activeDiffs, setActiveDiffs] = useState<Record<string, boolean>>(ALL_DIFFS);
  const [activeTags, setActiveTags] = useState<Record<string, boolean>>({});
  const [activeKinds, setActiveKinds] = useState<Record<string, boolean>>(ALL_KINDS);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeTrack, setActiveTrack] = useState<string>(
    () => localStorage.getItem("track") || "data-engineer",
  );
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => localStorage.setItem("bgVariant", bgVariant), [bgVariant]);
  useEffect(() => localStorage.setItem("guidesH", guidesH ? "1" : "0"), [guidesH]);
  useEffect(() => localStorage.setItem("guidesV", guidesV ? "1" : "0"), [guidesV]);
  useEffect(() => localStorage.setItem("track", activeTrack), [activeTrack]);
  useEffect(() => localStorage.setItem("agendaOpen", agendaOpen ? "1" : "0"), [agendaOpen]);
  // hide-local: персист набора скрытых id.
  useEffect(() => localStorage.setItem("hiddenIds", JSON.stringify([...hiddenIds])), [hiddenIds]);
  // draft-autosave: persist черновика оценок, пока нет активной сессии (в сессии — БД источник правды).
  useEffect(() => {
    if (session) return;
    try {
      localStorage.setItem("draftScores", JSON.stringify(scores));
    } catch {
      /* ignore quota errors */
    }
  }, [scores, session]);

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
      localStorage.setItem("timerStart", String(t));
      return t;
    });
  }, [currentId]);
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
  const trackInclude = useMemo(
    () => tracks.find((t) => t.id === activeTrack)?.include ?? [],
    [tracks, activeTrack],
  );
  const trackLabel = useMemo(
    () => tracks.find((t) => t.id === activeTrack)?.label,
    [tracks, activeTrack],
  );
  // Видимый срез (трек + активные фильтры) — для навигации «Дальше».
  const visibleIds = useMemo(() => {
    const anyTag = Object.values(activeTags).some(Boolean);
    const s = new Set<string>();
    for (const n of graph) {
      const tagOk = !anyTag || n.tags.some((t) => activeTags[t]);
      if (
        activeBlocks[n.block] &&
        activeDiffs[n.difficulty] &&
        activeKinds[n.kind] &&
        tagOk &&
        nodeInTrack(n, trackInclude)
      ) {
        s.add(n.id);
      }
    }
    return s;
  }, [graph, activeBlocks, activeDiffs, activeKinds, activeTags, trackInclude]);

  // Строки агенды в порядке клавиатурной навигации, с заголовком при смене блока.
  const agendaRows = useMemo(() => {
    if (!placement) return [] as ({ kind: "head"; block: Block } | { kind: "item"; node: QNode })[];
    const rows: ({ kind: "head"; block: Block } | { kind: "item"; node: QNode })[] = [];
    let last: Block | null = null;
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
        .graph()
        .then((g) => {
          setGraph(g.nodes);
          setErrors(g.errors);
          setPlacement(swimlaneLayout(g.nodes));
        })
        .catch((err) => setErrors([{ file: "API", error: String(err) }])),
    [],
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
        alert("Не удалось удалить вопрос");
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
        alert("Не удалось сохранить изменения");
        return;
      }
      await loadGraph();
    },
    [loadGraph],
  );

  // question-management: создать вопрос из формы шапки (POST → перечитать граф → выбрать новый).
  const createNode = useCallback(async () => {
    const payload: NodeCreate = {
      block: addDraft.block as Block,
      topic: addDraft.topic.trim(),
      difficulty: addDraft.difficulty as Difficulty,
      kind: addDraft.kind as "question" | "task",
      title: addDraft.title.trim() || undefined,
      question: addDraft.question,
      answer: addDraft.answer,
      tags: addDraft.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    let res: { id: string };
    try {
      res = await api.createNode(payload);
    } catch {
      alert("Не удалось создать вопрос");
      return;
    }
    await loadGraph();
    setAddOpen(false);
    setAddDraft(EMPTY_ADD);
    setSelectedId(res.id);
  }, [addDraft, loadGraph]);

  useEffect(() => {
    api.tracks().then(setTracks).catch(() => setTracks([]));
  }, []);

  useEffect(() => {
    api.listSessions().then(setPastSessions).catch(() => setPastSessions([]));
  }, []);

  const rfNodes = useMemo(
    () =>
      placement
        ? buildNodes(graph, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, trackInclude, query.toLowerCase().trim(), unscoredOnly, hiddenIds, showHidden, guidesH, guidesV)
        : [],
    [graph, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, trackInclude, query, unscoredOnly, hiddenIds, showHidden, guidesH, guidesV],
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
    // только видимый срез (трек + фильтры)
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

  // Привязать активную сессию к URL (?session=<id>) — ссылкой можно поделиться с HR.
  const setSessionParam = useCallback((id: number | null) => {
    const url = new URL(window.location.href);
    if (id == null) url.searchParams.delete("session");
    else url.searchParams.set("session", String(id));
    window.history.replaceState(null, "", url.toString());
  }, []);

  const startSession = useCallback(async () => {
    // people-schema: либо выбран существующий кандидат (pickedCandidateId), либо вводим имя.
    let candidateId = pickedCandidateId;
    let name = candidate.trim();
    if (candidateId != null) {
      name = candidates.find((c) => c.id === candidateId)?.name ?? name;
    }
    if (candidateId == null && !name) return;
    // draft-autosave: именованная сессия персистит в БД — локальный черновик больше не нужен.
    localStorage.removeItem("draftScores");
    // Новое имя без выбранной карточки → завести кандидата (с опц. позицией/грейдом).
    if (candidateId == null && name) {
      try {
        const created = await api.createCandidate({
          name,
          position: candPosition.trim() || undefined,
          seniority: candSeniority.trim() || undefined,
        });
        candidateId = created.id;
        setCandidates((cs) => [...cs, created]);
      } catch {
        /* при сбое создания кандидата всё равно стартуем сессию по свободному имени */
      }
    }
    const s = await api.createSession(
      name || "—",
      candidateId ?? undefined,
      pickedInterviewerId ?? undefined,
    );
    setSession(s);
    setScores(scoresOf(s));
    setSessionParam(s.id);
    // Обновляем оба списка сессий (loadsess-резюме и live-пикер).
    api.listSessions().then((ls) => {
      setPastSessions(ls);
      setSessions(ls);
    }).catch(() => void 0);
    const t = Date.now();
    setSessionStart(t);
    localStorage.setItem("timerStart", String(t));
  }, [
    candidate,
    candidates,
    pickedCandidateId,
    pickedInterviewerId,
    candPosition,
    candSeniority,
    setSessionParam,
  ]);

  // Подключиться к уже существующей сессии (другой интервьюер / HR): подтянуть оценки.
  const joinSession = useCallback(
    async (id: number) => {
      try {
        const s = await api.getSession(id);
        setSession(s);
        setScores(scoresOf(s));
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

  // Список сессий для пикера + авто-подключение по ?session=<id> при загрузке.
  useEffect(() => {
    api.listSessions().then(setSessions).catch(() => void 0);
    const fromUrl = new URLSearchParams(window.location.search).get("session");
    if (fromUrl) joinSession(Number(fromUrl));
  }, [joinSession]);

  // people-schema: подтянуть кандидатов и интервьюеров; преселект дефолтного интервьюера.
  useEffect(() => {
    api.listCandidates().then(setCandidates).catch(() => void 0);
    api
      .listInterviewers()
      .then((iv) => {
        setInterviewers(iv);
        setPickedInterviewerId((cur) => cur ?? (iv.length ? iv[0].id : null));
      })
      .catch(() => void 0);
  }, []);

  // Live-синхронизация: подписка на SSE-поток активной сессии. Входящие снимки
  // сливаются объединением, чтобы не затирать только что выставленную локальную оценку.
  useEffect(() => {
    if (!session) return;
    const es = new EventSource(api.eventsUrl(session.id));
    const merge = (e: MessageEvent) => {
      try {
        const snap = JSON.parse(e.data) as Session;
        setScores((prev) => ({ ...prev, ...scoresOf(snap) }));
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

  // Загрузить прошлую сессию: восстановить оценки на доске.
  const loadSession = useCallback(async (id: number) => {
    if (!id) return;
    const s = await api.getSession(id);
    setSession(s);
    setScores(Object.fromEntries(Object.entries(s.scores).map(([nid, v]) => [nid, v.score])));
  }, []);

  const toggleBlock = (b: Block) => setActiveBlocks((s) => ({ ...s, [b]: !s[b] }));
  const toggleDiff = (d: Difficulty) => setActiveDiffs((s) => ({ ...s, [d]: !s[d] }));
  const toggleTag = (t: string) => setActiveTags((s) => ({ ...s, [t]: !s[t] }));
  const clearTags = () => setActiveTags({});
  const toggleKind = (k: string) => setActiveKinds((s) => ({ ...s, [k]: !s[k] }));

  const scored = Object.keys(scores).length;
  const avg = scored > 0 ? (Object.values(scores).reduce((a, b) => a + b, 0) / scored).toFixed(1) : "—";
  // people-schema: интервьюер + позиция/грейд кандидата для шапки отчёта.
  const reportPeople = useMemo(() => {
    const iv = interviewers.find((i) => i.id === session?.interviewer_id) ?? interviewers.find((i) => i.id === pickedInterviewerId);
    const cand = candidates.find((c) => c.id === (session?.candidate_id ?? pickedCandidateId));
    return {
      interviewer: iv?.name ?? null,
      position: cand?.position ?? null,
      seniority: cand?.seniority ?? null,
    };
  }, [interviewers, candidates, session, pickedInterviewerId, pickedCandidateId]);
  const progress = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const b of BLOCK_ORDER) out[b] = { done: 0, total: 0 };
    for (const n of graph) {
      out[n.block] ??= { done: 0, total: 0 };
      out[n.block].total++;
      if (scores[n.id] != null) out[n.block].done++;
    }
    return out;
  }, [graph, scores]);

  const anyTagActive = Object.values(activeTags).some(Boolean);
  // Прогресс по ТЕКУЩЕМУ отфильтрованному набору. Условие "проходит фильтры" держать в
  // синхроне с предикатом `dimmed` в buildNodes (block/diff/kind/tag).
  const coverage = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const n of graph) {
      const tagOk = !anyTagActive || n.tags.some((t) => activeTags[t]);
      if (activeBlocks[n.block] && activeDiffs[n.difficulty] && activeKinds[n.kind] && tagOk) {
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
        {/* topbar-redeclutter, ряд 1 — поток интервью: направление, прогресс, сессия */}
        <div className="topbar__row topbar__row--flow">
        <h1 className="appname">Интервью · граф вопросов</h1>
        <span className="muted">{graph.length} нод</span>

        <div className="tb__field">
          <span className="tb__lbl">Направление</span>
          <select
            className="tb__select"
            value={activeTrack}
            onChange={(e) => setActiveTrack(e.target.value)}
            title="Направление интервью — фокусирует доску на релевантных вопросах"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="progress" title="Оценено по текущему набору фильтров">
          <div className="progress__track">
            <div className="progress__fill" style={{ width: `${coverage.pct}%` }} />
          </div>
          <span className="progress__label">
            оценено {coverage.done} / {coverage.total} ({coverage.pct}%)
          </span>
        </div>
        </div>

        {/* topbar-redeclutter, ряд 2 — служебное: отображение холста, контент/аналитика, переключатели */}
        <div className="topbar__row topbar__row--utility">
        <div className="toolbar" role="group" aria-label="Отображение холста">
          <button
            className={`tb__toggle ${bgVariant === "dots" ? "tb__toggle--on" : ""}`}
            onClick={() => setBgVariant((v) => (v === "dots" ? "off" : "dots"))}
            aria-pressed={bgVariant === "dots"}
            title={
              bgVariant === "dots"
                ? "Точки на фоне включены — нажмите, чтобы убрать"
                : "Точки на фоне выключены — нажмите, чтобы показать"
            }
          >
            Точки
          </button>
          <button
            className={`tb__toggle ${guidesV ? "tb__toggle--on" : ""}`}
            onClick={() => setGuidesV((v) => !v)}
            title="Вертикальные направляющие (границы блоков)"
          >
            Верт.
          </button>
          <button
            className={`tb__toggle ${guidesH ? "tb__toggle--on" : ""}`}
            onClick={() => setGuidesH((v) => !v)}
            title="Горизонтальные направляющие (уровни Base/Junior/Middle/Senior)"
          >
            Гор.
          </button>
          <button
            className={`tb__toggle ${agendaOpen ? "tb__toggle--on" : ""}`}
            onClick={() => setAgendaOpen((v) => !v)}
            title="Сайдбар-агенда: список вопросов с переходом"
          >
            Агенда
          </button>
          <button
            className={`tb__toggle ${showHidden ? "tb__toggle--on" : ""}`}
            onClick={() => setShowHidden((v) => !v)}
            title={`Скрытые вопросы (${hiddenIds.size}) — показать/спрятать`}
          >
            Скрытые{hiddenIds.size ? ` (${hiddenIds.size})` : ""}
          </button>
        </div>

        <div className="session">
          {session ? (
            <>
              <span className="session__active">
                👤 {session.candidate}
                {(() => {
                  const iv = interviewers.find((i) => i.id === session.interviewer_id);
                  return iv ? ` · 🎤 ${iv.name}` : "";
                })()}
                {" · "}оценено {scored} · средн. {avg}
              </span>
              <span
                className={`livedot ${live ? "livedot--on" : ""}`}
                title={live ? "Live: изменения синхронизируются с HR" : "Подключение к live…"}
              >
                ● {live ? "LIVE" : "…"}
              </span>
              <button className="iconbtn" onClick={leaveSession} title="Выйти из сессии">
                Выйти
              </button>
            </>
          ) : (
            <>
              {candidates.length > 0 && (
                <select
                  className="cand-pick"
                  value={pickedCandidateId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    setPickedCandidateId(v);
                    if (v != null) setCandidate("");
                  }}
                  title="Выбрать существующего кандидата"
                >
                  <option value="">Новый кандидат…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.seniority ? ` · ${c.seniority}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {pickedCandidateId == null && (
                <>
                  <input
                    placeholder="Кандидат…"
                    value={candidate}
                    onChange={(e) => setCandidate(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startSession()}
                  />
                  <input
                    className="cand-pos"
                    placeholder="Позиция (опц.)"
                    value={candPosition}
                    onChange={(e) => setCandPosition(e.target.value)}
                  />
                  <input
                    className="cand-sen"
                    placeholder="Грейд (опц.)"
                    value={candSeniority}
                    onChange={(e) => setCandSeniority(e.target.value)}
                  />
                </>
              )}
              {interviewers.length > 0 && (
                <select
                  className="iv-pick"
                  value={pickedInterviewerId ?? ""}
                  onChange={(e) =>
                    setPickedInterviewerId(e.target.value ? Number(e.target.value) : null)
                  }
                  title="Кто проводит интервью"
                >
                  {interviewers.map((iv) => (
                    <option key={iv.id} value={iv.id}>
                      {iv.name}
                      {iv.role ? ` · ${iv.role}` : ""}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn--primary" onClick={startSession}>Начать сессию</button>
              {pastSessions.length > 0 && (
                <select
                  className="loadsess"
                  value=""
                  onChange={(e) => e.target.value && loadSession(Number(e.target.value))}
                  title="Загрузить прошлую сессию (восстановить оценки)"
                >
                  <option value="">Загрузить сессию…</option>
                  {pastSessions.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.candidate} · {ps.created_at.slice(0, 16).replace("T", " ")}
                    </option>
                  ))}
                </select>
              )}
              {sessions.length > 0 && (
                <select
                  className="session__pick"
                  value=""
                  onChange={(e) => e.target.value && joinSession(Number(e.target.value))}
                  title="Подключиться к существующей сессии (live)"
                >
                  <option value="">Подключиться…</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.candidate} · {s.created_at.slice(0, 10)}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <button
            className="iconbtn addbtn"
            onClick={() => setAddOpen(true)}
            title="Добавить вопрос в банк"
          >
            Добавить вопрос
          </button>
          <button
            className="iconbtn uploadbtn"
            onClick={() => setUploadOpen(true)}
            title="Загрузить вопросы (.md/.json)"
          >
            Загрузить
          </button>
          <button
            className="iconbtn"
            onClick={() => setShowBank(true)}
            disabled={graph.length === 0}
            title="Открыть экран со всеми вопросами банка"
          >
            Все вопросы
          </button>
          <button
            className="iconbtn dlbtn"
            onClick={() => downloadReport(session?.candidate ?? candidate, graph, scores, trackLabel, notes, reportPeople)}
            disabled={scored === 0}
            title={scored === 0 ? "Сначала выставьте оценки" : "Скачать результаты (HTML)"}
          >
            Скачать
          </button>
          {graph.length > 0 && scored === graph.length && (
            <button
              className="cta-done"
              onClick={() => downloadReport(session?.candidate ?? candidate, graph, scores, trackLabel, notes, reportPeople)}
              title="Все вопросы оценены — скачать итоговый отчёт"
            >
              Завершить · Скачать отчёт
            </button>
          )}
          <button
            className="iconbtn cmpbtn"
            onClick={() => setCompareOpen(true)}
            title="Сравнить кандидатов по блокам"
          >
            Сравнить
          </button>
          <button
            className="iconbtn bankbtn"
            onClick={() => downloadBank(graph)}
            disabled={graph.length === 0}
            title="Скачать весь банк вопросов (HTML)"
          >
            Банк
          </button>
          <button
            className="iconbtn helpbtn"
            onClick={() => setHelpOpen(true)}
            title="Горячие клавиши (?)"
          >
            ?
          </button>
          <button
            className="iconbtn themebtn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title="Переключить тему (светлая/тёмная)"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="errbar">
          ⚠ Ошибки импорта ({errors.length}):{" "}
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
            <h4>Агенда · {agendaRows.filter((r) => r.kind === "item").length}</h4>
            {agendaRows.map((r, i) =>
              r.kind === "head" ? (
                <div key={`h-${r.block}-${i}`} className="iv-block" style={{ color: BLOCK_COLOR[r.block] }}>
                  {BLOCK_LABEL[r.block]}
                </div>
              ) : (
                <button
                  key={r.node.id}
                  className={[
                    "ivbtn",
                    r.node.id === currentId ? "ivbtn--current" : "",
                    scores[r.node.id] != null ? "ivbtn--scored" : "",
                  ].join(" ")}
                  style={{ borderLeftColor: BLOCK_COLOR[r.node.block] }}
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
            <div className="loading">Загрузка графа…</div>
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
                    ? BLOCK_COLOR[(n.data as any)?.node?.block as Block] ?? "#999"
                    : "rgba(100,116,139,0.18)"
                }
                pannable
                zoomable
              />

              <Panel position="top-right">
                <div className="filterpanel" role="region" aria-label="Фильтры вопросов">
                  <input
                    className="fp__search"
                    placeholder="Поиск по вопросам…"
                    aria-label="Поиск по вопросам"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="fp__group">
                    <h2 className="fp__title">Направления</h2>
                    {BLOCK_ORDER.map((b) => (
                      <button
                        key={b}
                        className={`fp__chip ${activeBlocks[b] ? "" : "fp__chip--off"}`}
                        style={{
                          borderColor: BLOCK_COLOR[b],
                          color: activeBlocks[b] ? "#fff" : BLOCK_COLOR[b],
                          background: activeBlocks[b] ? BLOCK_COLOR[b] : "transparent",
                        }}
                        onClick={() => toggleBlock(b)}
                      >
                        {BLOCK_LABEL[b]} {progress[b].done}/{progress[b].total}
                      </button>
                    ))}
                  </div>
                  <div className="fp__group">
                    <h2 className="fp__title">Сложность</h2>
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
                    <h2 className="fp__title">Тип</h2>
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
                        {KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                  <div className="fp__group">
                    <h2 className="fp__title">Прогресс</h2>
                    <button
                      className={`fp__chip ${unscoredOnly ? "" : "fp__chip--off"}`}
                      style={{
                        borderColor: "#16a34a",
                        color: unscoredOnly ? "#fff" : "#16a34a",
                        background: unscoredOnly ? "#16a34a" : "transparent",
                      }}
                      onClick={() => setUnscoredOnly((v) => !v)}
                    >
                      Только неоценённые
                    </button>
                  </div>
                  <div className="fp__group fp__group--tags">
                    <div className="fp__title">
                      <button
                        className="fp__collapse"
                        onClick={() => setTagsCollapsed((v) => !v)}
                        title={tagsCollapsed ? "Развернуть теги" : "Свернуть теги"}
                      >
                        {tagsCollapsed ? "▸" : "▾"} Теги
                      </button>
                      {anyTagActive && (
                        <button className="fp__clear" onClick={clearTags}>
                          сбросить
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
                    <span className="hud__timer" title="Время на вопрос · вся сессия">
                      ⏱ {mmss(now - questionStart)}
                      {sessionStart != null && ` · ${mmss(now - sessionStart)}`}
                    </span>
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
                    <button onClick={() => setSelectedId(currentId)}>Открыть</button>
                    <button className="btn--primary" onClick={nextQuestion}>
                      Дальше →
                    </button>
                    <button className="hud__cancel" onClick={() => setCurrentId(null)} title="Снять выбор (Esc)">
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
      {compareOpen && <CompareModal onClose={() => setCompareOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      {uploadOpen && (
        <UploadModal onClose={() => setUploadOpen(false)} onImported={loadGraph} />
      )}
      {showBank && <BankBrowser nodes={graph} onClose={() => setShowBank(false)} />}

      {/* question-management: модалка добавления вопроса в банк */}
      {addOpen && (
        <div className="modal" onClick={() => setAddOpen(false)}>
          <div className="modal__card addform" onClick={(e) => e.stopPropagation()}>
            <h3>Новый вопрос</h3>
            <div className="addform__row">
              <label className="drawer__field">
                Блок
                <select value={addDraft.block} onChange={(e) => setAddDraft({ ...addDraft, block: e.target.value })}>
                  {BLOCK_ORDER.map((b) => (
                    <option key={b} value={b}>{BLOCK_LABEL[b as Block]}</option>
                  ))}
                </select>
              </label>
              <label className="drawer__field">
                Тема
                <input
                  value={addDraft.topic}
                  onChange={(e) => setAddDraft({ ...addDraft, topic: e.target.value })}
                  placeholder="например, sql"
                />
              </label>
            </div>
            <div className="addform__row">
              <label className="drawer__field">
                Сложность
                <select value={addDraft.difficulty} onChange={(e) => setAddDraft({ ...addDraft, difficulty: e.target.value })}>
                  {DIFFS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="drawer__field">
                Тип
                <select value={addDraft.kind} onChange={(e) => setAddDraft({ ...addDraft, kind: e.target.value })}>
                  <option value="question">вопрос</option>
                  <option value="task">задача</option>
                </select>
              </label>
            </div>
            <label className="drawer__field">
              Заголовок
              <input value={addDraft.title} onChange={(e) => setAddDraft({ ...addDraft, title: e.target.value })} />
            </label>
            <label className="drawer__field">
              {addDraft.kind === "task" ? "Задача" : "Вопрос"}
              <textarea rows={3} value={addDraft.question} onChange={(e) => setAddDraft({ ...addDraft, question: e.target.value })} />
            </label>
            <label className="drawer__field">
              {addDraft.kind === "task" ? "Эталон / решение" : "Ответ"}
              <textarea rows={5} value={addDraft.answer} onChange={(e) => setAddDraft({ ...addDraft, answer: e.target.value })} />
            </label>
            <label className="drawer__field">
              Теги (через запятую)
              <input value={addDraft.tags} onChange={(e) => setAddDraft({ ...addDraft, tags: e.target.value })} />
            </label>
            <div className="addform__btns">
              <button className="btn--primary" onClick={createNode} disabled={!addDraft.topic.trim() || !addDraft.question.trim()}>
                Создать
              </button>
              <button onClick={() => setAddOpen(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
