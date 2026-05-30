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
import { api } from "./api";
import { BandsNode } from "./components/BandsNode";
import { BlockGroupNode } from "./components/BlockGroupNode";
import { DetailDrawer } from "./components/DetailDrawer";
import { GuidesNode } from "./components/GuidesNode";
import { QuestionNode } from "./components/QuestionNode";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { SubHeadNode } from "./components/SubHeadNode";
import { downloadReport } from "./report";
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
  type Block,
  type Difficulty,
  type ImportErr,
  type QNode,
  type Session,
} from "./types";

const nodeTypes = {
  question: QuestionNode,
  blockGroup: BlockGroupNode,
  subhead: SubHeadNode,
  bands: BandsNode,
  guides: GuidesNode,
};
const NO_EDGES: Edge[] = [];

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
    const dimmed = !activeBlocks[n.block] || !activeDiffs[n.difficulty] || !activeKinds[n.kind] || !tagOk;
    nodes.push({
      id: n.id,
      type: "question",
      position: pos,
      data: { node: n, score: scores[n.id], current: n.id === currentId, dimmed },
      selected: n.id === selectedId,
      draggable: false,
      selectable: !dimmed,
      style: dimmed ? { pointerEvents: "none" } : undefined,
      zIndex: n.id === currentId ? 5 : n.id === selectedId ? 4 : 1,
    });
  }
  return nodes;
}

const ALL_BLOCKS: Record<string, boolean> = Object.fromEntries(BLOCK_ORDER.map((b) => [b, true]));
const ALL_DIFFS: Record<string, boolean> = Object.fromEntries(DIFFS.map((d) => [d, true]));
const KINDS = ["question", "task"] as const;
const KIND_LABEL: Record<string, string> = { question: "вопрос", task: "задача" };
const KIND_COLOR: Record<string, string> = { question: "#2563eb", task: "#9333ea" };
const ALL_KINDS: Record<string, boolean> = { question: true, task: true };

export default function App() {
  const [graph, setGraph] = useState<QNode[]>([]);
  const [errors, setErrors] = useState<ImportErr[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [candidate, setCandidate] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeBlocks, setActiveBlocks] = useState<Record<string, boolean>>(ALL_BLOCKS);
  const [activeDiffs, setActiveDiffs] = useState<Record<string, boolean>>(ALL_DIFFS);
  const [activeTags, setActiveTags] = useState<Record<string, boolean>>({});
  const [activeKinds, setActiveKinds] = useState<Record<string, boolean>>(ALL_KINDS);
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => localStorage.setItem("bgVariant", bgVariant), [bgVariant]);
  useEffect(() => localStorage.setItem("guidesH", guidesH ? "1" : "0"), [guidesH]);
  useEffect(() => localStorage.setItem("guidesV", guidesV ? "1" : "0"), [guidesV]);

  const instance = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const nodeMap = useMemo(() => Object.fromEntries(graph.map((n) => [n.id, n])), [graph]);
  const allTags = useMemo(
    () => Array.from(new Set(graph.flatMap((n) => n.tags))).sort(),
    [graph],
  );

  useEffect(() => {
    api
      .graph()
      .then((g) => {
        setGraph(g.nodes);
        setErrors(g.errors);
        setPlacement(swimlaneLayout(g.nodes));
      })
      .catch((err) => setErrors([{ file: "API", error: String(err) }]));
  }, []);

  const rfNodes = useMemo(
    () =>
      placement
        ? buildNodes(graph, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, guidesH, guidesV)
        : [],
    [graph, placement, scores, currentId, selectedId, activeBlocks, activeDiffs, activeTags, activeKinds, guidesH, guidesV],
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
      if (session) api.setScore(session.id, nodeId, score).catch(() => void 0);
    },
    [session],
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
    const flat = placement.order.flat();
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
  }, [placement, currentId, scores, moveCurrent]);

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

  const startSession = useCallback(async () => {
    if (!candidate.trim()) return;
    const s = await api.createSession(candidate.trim());
    setSession(s);
    setScores({});
  }, [candidate]);

  const toggleBlock = (b: Block) => setActiveBlocks((s) => ({ ...s, [b]: !s[b] }));
  const toggleDiff = (d: Difficulty) => setActiveDiffs((s) => ({ ...s, [d]: !s[d] }));
  const toggleTag = (t: string) => setActiveTags((s) => ({ ...s, [t]: !s[t] }));
  const clearTags = () => setActiveTags({});
  const toggleKind = (k: string) => setActiveKinds((s) => ({ ...s, [k]: !s[k] }));

  const scored = Object.keys(scores).length;
  const avg = scored > 0 ? (Object.values(scores).reduce((a, b) => a + b, 0) / scored).toFixed(1) : "—";
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
  const currentNode = currentId ? nodeMap[currentId] : null;
  const selectedNode = selectedId ? nodeMap[selectedId] : null;

  return (
    <div className="app">
      <header className="topbar">
        <strong>Интервью · граф вопросов</strong>
        <span className="muted">{graph.length} нод</span>

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
            ⠿ Точки
          </button>
          <button
            className={`tb__toggle ${guidesV ? "tb__toggle--on" : ""}`}
            onClick={() => setGuidesV((v) => !v)}
            title="Вертикальные направляющие (границы блоков)"
          >
            ⫿ Верт.
          </button>
          <button
            className={`tb__toggle ${guidesH ? "tb__toggle--on" : ""}`}
            onClick={() => setGuidesH((v) => !v)}
            title="Горизонтальные направляющие (уровни Base/Junior/Middle/Senior)"
          >
            ☰ Гор.
          </button>
        </div>

        <div className="session">
          {session ? (
            <span className="session__active">
              👤 {session.candidate} · оценено {scored} · средн. {avg}
            </span>
          ) : (
            <>
              <input
                placeholder="Кандидат…"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startSession()}
              />
              <button onClick={startSession}>Начать сессию</button>
            </>
          )}
          <button
            className="iconbtn dlbtn"
            onClick={() => downloadReport(session?.candidate ?? candidate, graph, scores)}
            disabled={scored === 0}
            title={scored === 0 ? "Сначала выставьте оценки" : "Скачать результаты (HTML)"}
          >
            📥 Скачать
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
                inst.fitView({ padding: 0.12 });
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              fitViewOptions={{ padding: 0.12 }}
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
            >
              {bgVariant === "dots" && <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />}
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) =>
                  n.type === "question"
                    ? BLOCK_COLOR[(n.data as any)?.node?.block as Block] ?? "#999"
                    : "rgba(0,0,0,0.03)"
                }
                pannable
                zoomable
              />

              <Panel position="top-right">
                <div className="filterpanel">
                  <div className="fp__group">
                    <div className="fp__title">Направления</div>
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
                    <div className="fp__title">Сложность</div>
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
                    <div className="fp__title">Тип</div>
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
                  <div className="fp__group fp__group--tags">
                    <div className="fp__title">
                      Теги
                      {anyTagActive && (
                        <button className="fp__clear" onClick={clearTags}>
                          сбросить
                        </button>
                      )}
                    </div>
                    {allTags.map((t) => (
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
          fullscreen={fullscreen}
          onScore={applyScore}
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
