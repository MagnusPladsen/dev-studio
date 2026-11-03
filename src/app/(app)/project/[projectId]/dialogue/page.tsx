"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useHistory } from "@/hooks/useHistory";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu } from "@/components/ExportMenu";
import { ImportMenu } from "@/components/ImportMenu";
import { ImportDropZone } from "@/components/ImportDropZone";
import { useImport } from "@/hooks/useImport";
import { importAsNewAssets } from "@/lib/import";
import { DIALOGUE_IMPORTERS } from "@/lib/import/dialogue";
import { HelpButton } from "@/components/HelpButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import type { SaveState } from "@/hooks/useAutosave";
import { useParams } from "next/navigation";
import {
  Plus,
  Trash2,
  Play,
  MessageSquare,
  Circle,
  Diamond,
  Hexagon,
  Square,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import type { DialogueTree, DialogueNode } from "@/types";
import { useOpenParam, useTrackOpenAsset } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";

type NodeType = DialogueNode["type"];

const NODE_COLORS: Record<NodeType, string> = {
  start: "var(--green)",
  dialogue: "#a78bfa",
  choice: "var(--yellow, #fbbf24)",
  condition: "var(--pink, #f472b6)",
  action: "var(--blue, #60a5fa)",
  end: "var(--red)",
};

const NODE_LABELS: Record<NodeType, string> = {
  start: "Start",
  dialogue: "Dialogue",
  choice: "Choice",
  condition: "Condition",
  action: "Action",
  end: "End",
};

/** Translucent version of a node colour (works with CSS variables too). */
function tint(color: string, pct: number) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

const NODE_TYPES: NodeType[] = ["start", "dialogue", "choice", "condition", "action", "end"];

/** "Add node" as one dropdown, for desktop widths where the row of node buttons doesn't fit beside the title. */
function AddNodeMenu({ onPick }: { onPick(type: NodeType): void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setIsOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setIsOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap"
        style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Plus className="w-3.5 h-3.5" />
        Add node
        <ChevronDown className="w-3 h-3" />
      </button>
      {isOpen && (
        <div role="menu" className="absolute top-full left-0 mt-1 py-1 w-40 rounded-lg border z-30" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          {NODE_TYPES.map((type) => (
            <button
              key={type}
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onPick(type);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NODE_COLORS[type] }} />
              {NODE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || !!el.closest("input, textarea, select"));
}

function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Converts a tree to Yarn Spinner script: one Yarn node per tree node, choices as -> options. */
function toYarn(tree: DialogueTree): string {
  const titles = new Map<string, string>();
  tree.nodes.forEach((n, i) => {
    titles.set(n.id, n.type === "start" ? "Start" : `${NODE_LABELS[n.type]}_${i}`.replace(/[^A-Za-z0-9_]/g, "_"));
  });
  const jump = (id?: string) => (id && titles.has(id) ? `<<jump ${titles.get(id)}>>` : "<<stop>>");
  const cond = (c: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? `$${c}` : c);
  const blocks = tree.nodes.map((n) => {
    const body: string[] = [];
    if (n.type === "start") body.push(jump(n.nextId));
    else if (n.type === "end") body.push("<<stop>>");
    else if (n.type === "dialogue") body.push(`${n.speaker ? `${n.speaker}: ` : ""}${n.text ?? ""}`, jump(n.nextId));
    else if (n.type === "choice") {
      if (n.text) body.push(n.text);
      for (const c of n.choices ?? []) body.push(`-> ${c.text}`, `    ${jump(c.targetId)}`);
    } else if (n.type === "condition") {
      body.push(`<<if ${cond(n.condition || n.text || "true")}>>`, `    ${jump(n.nextId)}`, "<<endif>>", "<<stop>>");
    } else if (n.type === "action") body.push(`<<${n.text || "action"}>>`, jump(n.nextId));
    return `title: ${titles.get(n.id)}\n---\n${body.join("\n")}\n===`;
  });
  return `// ${tree.name}, exported from GameDev Studio\n${blocks.join("\n\n")}\n`;
}

function getNodeWidth(node: DialogueNode): number {
  if (node.type === "start" || node.type === "end") return 60;
  if (node.type === "condition") return 140;
  return 200;
}

function getNodeHeight(node: DialogueNode): number {
  if (node.type === "start" || node.type === "end") return 60;
  if (node.type === "choice") return 80 + (node.choices?.length || 1) * 28;
  if (node.type === "condition") return 80;
  return 90;
}

function getOutputPoint(
  node: DialogueNode,
  choiceIdx?: number
): { x: number; y: number } {
  const w = getNodeWidth(node);
  const h = getNodeHeight(node);
  if (node.type === "start" || node.type === "end") {
    return { x: node.x + w, y: node.y + h / 2 };
  }
  if (node.type === "choice" && choiceIdx !== undefined) {
    const yOff = 52 + choiceIdx * 28 + 10;
    return { x: node.x + w, y: node.y + yOff };
  }
  return { x: node.x + w, y: node.y + h / 2 };
}

function getInputPoint(node: DialogueNode): { x: number; y: number } {
  const h = getNodeHeight(node);
  if (node.type === "start" || node.type === "end") {
    return { x: node.x, y: node.y + h / 2 };
  }
  return { x: node.x, y: node.y + h / 2 };
}

function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export default function DialoguePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();

  const [trees, setTrees] = useState<DialogueTree[]>([]);
  const [activeTree, setActiveTree] = useState<DialogueTree | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<{
    fromId: string;
    choiceIdx?: number;
    mx: number;
    my: number;
  } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<{
    currentId: string;
    history: string[];
  } | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const lastTap = useRef({ id: "", at: 0 });
  const [characters, setCharacters] = useState<string[]>([]);

  useEffect(() => {
    setTrees(storage.getAll("dialogues", projectId));
    setCharacters(
      storage
        .getAll("stories", projectId)
        .filter((s) => s.type === "character")
        .map((s) => s.title)
    );
    setLoaded(true);
  }, [projectId]);

  useOpenParam((id) => {
    const tree = storage.getById("dialogues", id, projectId);
    if (tree) {
      setActiveTree(tree);
      setSelectedNode(null);
      setEditingNode(null);
      setPreview(null);
    }
  }, loaded);
  useTrackOpenAsset(activeTree?.id ? { type: "dialogue", id: activeTree?.id } : null);

  const saveTree = useCallback(
    (tree: DialogueTree) => {
      const updated = { ...tree, updatedAt: new Date().toISOString() };
      storage.save("dialogues", updated, projectId);
      setActiveTree(updated);
      setTrees(storage.getAll("dialogues", projectId));
    },
    [projectId]
  );
  // Every edit is written straight away; only a node drag waits for release.
  const saveState: SaveState = draggingNode ? "unsaved" : "saved";

  // Undo history tracks content only; a node drag counts once, when released.
  const content = useMemo(
    () => (activeTree ? { name: activeTree.name, nodes: activeTree.nodes } : null),
    [activeTree?.name, activeTree?.nodes] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [stableContent, setStableContent] = useState(content);
  if (!draggingNode && stableContent !== content) setStableContent(content);
  const history = useHistory(
    draggingNode ? stableContent : content,
    (v) => {
      if (!v || !activeTree) return;
      saveTree({ ...activeTree, ...v });
      setSelectedNode(null);
      setEditingNode(null);
    },
    activeTree?.id
  );

  const imports = useImport<DialogueTree>({
    importers: DIALOGUE_IMPORTERS,
    noun: ["dialogue", "dialogues"],
    history,
    openId: activeTree?.id ?? null,
    apply: ({ items }) =>
      importAsNewAssets("dialogues", projectId, items, {
        previousId: activeTree?.id ?? null,
        open: (tree) => showTree(tree),
        back: (previous) => showTree(previous ?? null),
      }),
  });

  function showTree(tree: DialogueTree | null) {
    setTrees(storage.getAll("dialogues", projectId));
    setActiveTree(tree);
    setSelectedNode(null);
    setEditingNode(null);
    setPreview(null);
  }

  function createTree() {
    const tree: DialogueTree = {
      id: uuid(),
      projectId,
      name: "New Dialogue",
      nodes: [{ id: uuid(), type: "start", x: 100, y: 200 }],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.save("dialogues", tree, projectId);
    setTrees(storage.getAll("dialogues", projectId));
    setActiveTree(tree);
  }

  function deleteTree(id: string) {
    storage.delete("dialogues", id, projectId);
    setTrees(storage.getAll("dialogues", projectId));
    if (activeTree?.id === id) setActiveTree(null);
  }

  function addNode(type: NodeType) {
    if (!activeTree) return;
    const node: DialogueNode = {
      id: uuid(),
      type,
      x: (-pan.x + 300) / zoom,
      y: (-pan.y + 200) / zoom,
      speaker: type === "dialogue" ? "Speaker" : undefined,
      text:
        type === "dialogue"
          ? "Enter dialogue text..."
          : type === "choice"
          ? "Choose:"
          : type === "condition"
          ? "condition"
          : type === "action"
          ? "do_action"
          : undefined,
      choices:
        type === "choice"
          ? [
              { text: "Option 1", targetId: "" },
              { text: "Option 2", targetId: "" },
            ]
          : undefined,
    };
    saveTree({ ...activeTree, nodes: [...activeTree.nodes, node] });
  }

  function deleteNode(id: string) {
    if (!activeTree) return;
    const nodes = activeTree.nodes
      .filter((n) => n.id !== id)
      .map((n) => {
        const updated = { ...n };
        if (updated.nextId === id) updated.nextId = undefined;
        if (updated.choices) {
          updated.choices = updated.choices.map((c) =>
            c.targetId === id ? { ...c, targetId: "" } : c
          );
        }
        return updated;
      });
    saveTree({ ...activeTree, nodes });
    if (selectedNode === id) setSelectedNode(null);
    if (editingNode === id) setEditingNode(null);
  }

  function updateNode(id: string, patch: Partial<DialogueNode>, persist = true) {
    if (!activeTree) return;
    const nodes = activeTree.nodes.map((n) =>
      n.id === id ? { ...n, ...patch } : n
    );
    if (persist) saveTree({ ...activeTree, nodes });
    else setActiveTree({ ...activeTree, nodes });
  }

  function clientToCanvas(cx: number, cy: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: cx, y: cy };
    return {
      x: (cx - rect.left - pan.x) / zoom,
      y: (cy - rect.top - pan.y) / zoom,
    };
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg") {
      setSelectedNode(null);
      setEditingNode(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent) {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (draggingNode && activeTree) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      // Move locally while dragging; persisted once on mouse up.
      updateNode(
        draggingNode,
        { x: pt.x - dragOffset.x, y: pt.y - dragOffset.y },
        false
      );
    }
    if (connecting) {
      setConnecting({ ...connecting, mx: e.clientX, my: e.clientY });
    }
  }

  function handleCanvasMouseUp(e: React.MouseEvent) {
    setIsPanning(false);
    if (draggingNode && activeTree) saveTree(activeTree);
    setDraggingNode(null);
    if (connecting && activeTree) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      const target = activeTree.nodes.find((n) => {
        const ip = getInputPoint(n);
        const dist = Math.sqrt((pt.x - ip.x) ** 2 + (pt.y - ip.y) ** 2);
        return dist < 30;
      });
      if (target && target.id !== connecting.fromId) {
        const fromNode = activeTree.nodes.find(
          (n) => n.id === connecting.fromId
        );
        if (fromNode) {
          if (
            fromNode.type === "choice" &&
            connecting.choiceIdx !== undefined
          ) {
            const choices = [...(fromNode.choices || [])];
            choices[connecting.choiceIdx] = {
              ...choices[connecting.choiceIdx],
              targetId: target.id,
            };
            updateNode(fromNode.id, { choices });
          } else {
            updateNode(fromNode.id, { nextId: target.id });
          }
        }
      }
      setConnecting(null);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const newZoom = Math.min(
      Math.max(zoom - e.deltaY * 0.001, 0.25),
      3
    );
    setZoom(newZoom);
  }

  function exportTree() {
    if (!activeTree) return;
    downloadText(`${activeTree.name}.dialogue.json`, JSON.stringify(activeTree, null, 2), "application/json");
  }

  function exportYarn() {
    if (!activeTree) return;
    downloadText(`${activeTree.name.replace(/[^\w\- ]+/g, "")}.yarn`, toYarn(activeTree), "text/plain");
  }

  // Delete/Backspace removes the selected node; Ctrl/⌘+S saves (edits already save, so this is a no-op safety).
  const keyRef = useRef({ selectedNode, activeTree, deleteNode, saveTree });
  useEffect(() => {
    keyRef.current = { selectedNode, activeTree, deleteNode, saveTree };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (k.activeTree) k.saveTree(k.activeTree);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTyping(e.target) && k.selectedNode && k.activeTree) {
        const node = k.activeTree.nodes.find((n) => n.id === k.selectedNode);
        if (node && node.type !== "start") {
          e.preventDefault();
          k.deleteNode(node.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function startPreview() {
    if (!activeTree) return;
    const startNode = activeTree.nodes.find((n) => n.type === "start");
    if (!startNode) return;
    const firstId = startNode.nextId;
    if (firstId) {
      setPreview({ currentId: firstId, history: [] });
    }
  }

  function previewAdvance(nextId?: string) {
    if (!preview || !nextId) {
      setPreview(null);
      return;
    }
    setPreview({
      currentId: nextId,
      history: [...preview.history, preview.currentId],
    });
  }

  // Render connections
  function renderEdges() {
    if (!activeTree) return null;
    const edges: React.ReactNode[] = [];

    for (const node of activeTree.nodes) {
      if (node.type === "choice" && node.choices) {
        for (let i = 0; i < node.choices.length; i++) {
          const c = node.choices[i];
          if (!c.targetId) continue;
          const target = activeTree.nodes.find((n) => n.id === c.targetId);
          if (!target) continue;
          const from = getOutputPoint(node, i);
          const to = getInputPoint(target);
          edges.push(
            <path
              key={`${node.id}-c${i}`}
              d={bezierPath(from.x, from.y, to.x, to.y)}
              stroke={NODE_COLORS.choice}
              strokeWidth={2}
              fill="none"
              opacity={0.6}
            />
          );
        }
      } else if (node.nextId) {
        const target = activeTree.nodes.find((n) => n.id === node.nextId);
        if (!target) continue;
        const from = getOutputPoint(node);
        const to = getInputPoint(target);
        edges.push(
          <path
            key={`${node.id}-next`}
            d={bezierPath(from.x, from.y, to.x, to.y)}
            stroke={NODE_COLORS[node.type]}
            strokeWidth={2}
            fill="none"
            opacity={0.6}
          />
        );
      }
    }

    if (connecting) {
      const fromNode = activeTree.nodes.find(
        (n) => n.id === connecting.fromId
      );
      if (fromNode) {
        const from = getOutputPoint(fromNode, connecting.choiceIdx);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const mx = (connecting.mx - rect.left - pan.x) / zoom;
          const my = (connecting.my - rect.top - pan.y) / zoom;
          edges.push(
            <path
              key="connecting"
              d={bezierPath(from.x, from.y, mx, my)}
              stroke="white"
              strokeWidth={2}
              fill="none"
              strokeDasharray="6 4"
              opacity={0.5}
            />
          );
        }
      }
    }

    return edges;
  }

  function renderNodeShape(node: DialogueNode) {
    const w = getNodeWidth(node);
    const h = getNodeHeight(node);
    const color = NODE_COLORS[node.type];
    const isSelected = selectedNode === node.id;
    const borderCol = isSelected ? "white" : color;

    if (node.type === "start" || node.type === "end") {
      return (
        <div
          style={{
            width: w,
            height: h,
            borderRadius: "50%",
            background: tint(color, 15),
            border: `2px solid ${borderCol}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {node.type === "start" ? "START" : "END"}
        </div>
      );
    }

    if (node.type === "condition") {
      return (
        <div
          style={{
            width: w,
            height: h,
            background: tint(color, 9),
            border: `2px solid ${borderCol}`,
            borderRadius: 8,
            transform: "rotate(0deg)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px",
            gap: 2,
          }}
        >
          <Diamond
            className="w-3.5 h-3.5"
            style={{ color, flexShrink: 0 }}
          />
          <span
            style={{
              color: "var(--text-primary)",
              fontSize: 11,
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {node.condition || node.text || "if..."}
          </span>
        </div>
      );
    }

    return (
      <div
        style={{
          width: w,
          minHeight: h,
          background: tint(color, 6),
          border: `2px solid ${borderCol}`,
          borderRadius: 10,
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {node.type === "dialogue" && (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {node.speaker || "Speaker"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-primary)",
                lineHeight: 1.3,
                wordBreak: "break-word",
              }}
            >
              {node.text || "..."}
            </div>
          </>
        )}
        {node.type === "choice" && (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Choice
            </div>
            {node.choices?.map((c, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  color: "var(--text-primary)",
                  padding: "3px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ flex: 1, wordBreak: "break-word" }}>
                  {c.text}
                </span>
                <div
                  className="output-handle"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    cursor: "crosshair",
                    flexShrink: 0,
                    marginLeft: 4,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setConnecting({
                      fromId: node.id,
                      choiceIdx: i,
                      mx: e.clientX,
                      my: e.clientY,
                    });
                  }}
                />
              </div>
            ))}
          </>
        )}
        {node.type === "action" && (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Action
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-primary)",
                wordBreak: "break-word",
              }}
            >
              {node.text || "action"}
            </div>
          </>
        )}
      </div>
    );
  }

  // ============ Main render ============

  // LIST VIEW
  if (!activeTree) {
    return (
      <div ref={rootRef} className="p-6 md:p-10 max-w-3xl mx-auto">
        <ImportDropZone imports={imports} target={rootRef} />
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Dialogue Trees
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Create branching conversations for NPCs
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <HelpButton topic="dialogue" />
            <PasteButton type="dialogue" />
            <ImportMenu imports={imports} />
            <button
              onClick={createTree}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium shrink-0"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <Plus className="w-4 h-4" />
              New Dialogue
            </button>
          </div>
        </div>
        <ExamplesBar projectId={projectId} collections={["dialogues"]} className="mb-8" />

        {trees.length === 0 ? (
          <div
            className="text-center py-20 rounded-xl border border-dashed"
            style={{ borderColor: "var(--border)" }}
          >
            <MessageSquare
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: "var(--text-muted, #555570)" }}
            />
            <p
              className="text-lg font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              No dialogues yet
            </p>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Create a dialogue tree, or add the examples above to see how one works.
            </p>
            <button
              onClick={createTree}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              New Dialogue
            </button>
          </div>
        ) : (
          <div {...pasteTriggerProps("dialogue")} className="grid gap-3">
            {trees.map((t) => (
              <div
                key={t.id}
                {...assetTriggerProps({ type: "dialogue", id: t.id })}
                {...rowButtonProps(() => assetTriggerProps({ type: "dialogue", id: t.id }))}
                className="group flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
                onClick={() => setActiveTree(t)}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-hover)";
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "var(--bg-card)";
                }}
              >
                <div>
                  <h3
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t.name}
                  </h3>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted, #555570)" }}
                  >
                    {t.nodes.length} nodes &middot; Updated{" "}
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${t.name}"?`)) deleteTree(t.id);
                    }}
                    className="p-2 rounded-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--red)" }}
                    title="Delete dialogue"
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <AssetPinButton asset={{ type: "dialogue", id: t.id }} label={t.name} />
                  <AssetMenuButton asset={{ type: "dialogue", id: t.id }} label={t.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // EDITOR VIEW
  const currentPreviewNode = preview
    ? activeTree.nodes.find((n) => n.id === preview.currentId)
    : null;

  return (
    <div ref={rootRef} className="flex flex-col h-full">
      <ImportDropZone imports={imports} target={rootRef} />
      {/* Toolbar */}
      <div
        className="flex items-center justify-between flex-wrap md:gap-x-3 gap-y-1.5 px-4 min-h-12 py-1.5 border-b shrink-0 max-md:px-2"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0 md:shrink-0">
          <button
            onClick={() => {
              setActiveTree(null);
              setSelectedNode(null);
              setEditingNode(null);
              setPreview(null);
            }}
            className="px-2 py-1 rounded text-xs whitespace-nowrap"
            style={{ color: "var(--text-primary)" }}
          >
            ← All dialogues
          </button>
          <UndoRedoButtons history={imports.history} />
          <input
            className="bg-transparent text-sm font-medium outline-none w-48 max-md:w-36 min-w-0 md:shrink-0"
            style={{ color: "var(--text-primary)" }}
            value={activeTree.name}
            onChange={(e) =>
              saveTree({ ...activeTree, name: e.target.value })
            }
            aria-label="Dialogue name"
          />
          <div className="hidden lg:block">
            <LinkedAssets projectId={projectId} type="dialogue" id={activeTree.id} layout="row" maxRowChips={0} />
          </div>
        </div>

        <div className="hidden md:max-[1759px]:block">
          <AddNodeMenu onPick={addNode} />
        </div>
        <div className="flex items-center gap-1 max-md:order-last max-md:w-full max-md:overflow-x-auto md:max-[1759px]:hidden">
          <span className="text-xs mr-1 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            Add node:
          </span>
          {NODE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap"
              style={{
                background: tint(NODE_COLORS[type], 14),
                color: NODE_COLORS[type],
                border: `1px solid ${tint(NODE_COLORS[type], 45)}`,
              }}
              title={`Add a ${NODE_LABELS[type]} node`}
            >
              <Plus className="w-3 h-3" />
              {NODE_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 max-md:flex-wrap">
          <button
            onClick={() => setZoom(Math.min(zoom + 0.2, 3))}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(Math.max(zoom - 0.2, 0.25))}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setPan({ x: 0, y: 0 });
              setZoom(1);
            }}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
            title="Reset view"
            aria-label="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div
            className="w-px h-5 mx-1"
            style={{ background: "var(--border)" }}
          />
          <button
            onClick={startPreview}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: "var(--green)",
              color: "black",
            }}
            title="Play through the conversation"
          >
            <Play className="w-3 h-3" />
            Preview
          </button>
          <SaveIndicator state={saveState} className="px-1" />
          <HelpButton topic="dialogue" />
          <ImportMenu imports={imports} />
          <ExportMenu
            items={[
              { label: "JSON", description: "The whole tree, to re-import or load in code", onClick: exportTree },
              { label: "Yarn Spinner (.yarn)", description: "Script for Unity, Godot and GameMaker via Yarn Spinner", onClick: exportYarn },
            ]}
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" style={{ background: "var(--bg-primary)" }}>
        <div
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={handleCanvasMouseDown}
          onPointerMove={handleCanvasMouseMove}
          onPointerUp={handleCanvasMouseUp}
          onPointerCancel={handleCanvasMouseUp}
          onPointerLeave={() => {
            setIsPanning(false);
            setDraggingNode(null);
            setConnecting(null);
          }}
          onWheel={handleWheel}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {/* Edges SVG */}
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 4000,
                height: 4000,
                pointerEvents: "none",
              }}
            >
              {renderEdges()}
            </svg>

            {/* Nodes */}
            {activeTree.nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  cursor: "move",
                  userSelect: "none",
                }}
                onPointerDown={(e) => {
                  if (
                    (e.target as HTMLElement).classList.contains(
                      "output-handle"
                    )
                  )
                    return;
                  e.stopPropagation();
                  // touch has no double-click: a second quick tap opens the editor
                  if (e.pointerType === "touch") {
                    const now = Date.now();
                    if (lastTap.current.id === node.id && now - lastTap.current.at < 320) {
                      setEditingNode(node.id);
                      lastTap.current = { id: "", at: 0 };
                      return;
                    }
                    lastTap.current = { id: node.id, at: now };
                  }
                  setSelectedNode(node.id);
                  setDraggingNode(node.id);
                  const pt = clientToCanvas(e.clientX, e.clientY);
                  setDragOffset({
                    x: pt.x - node.x,
                    y: pt.y - node.y,
                  });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingNode(node.id);
                }}
              >
                {renderNodeShape(node)}

                {/* Input handle */}
                {node.type !== "start" && (
                  <div
                    style={{
                      position: "absolute",
                      left: -6,
                      top: getNodeHeight(node) / 2 - 6,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "var(--bg-primary)",
                      border: `2px solid ${NODE_COLORS[node.type]}`,
                      cursor: "crosshair",
                    }}
                  />
                )}

                {/* Output handle (non-choice) */}
                {node.type !== "end" && node.type !== "choice" && (
                  <div
                    className="output-handle"
                    style={{
                      position: "absolute",
                      right: -6,
                      top: getNodeHeight(node) / 2 - 6,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: NODE_COLORS[node.type],
                      cursor: "crosshair",
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setConnecting({
                        fromId: node.id,
                        mx: e.clientX,
                        my: e.clientY,
                      });
                    }}
                  />
                )}

                {/* Delete button on hover */}
                {selectedNode === node.id && node.type !== "start" && (
                  <button
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--red)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 10,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    title="Delete node (Delete key)"
                    aria-label="Delete node"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Edit panel */}
        {editingNode && activeTree && (
          <EditPanel
            node={activeTree.nodes.find((n) => n.id === editingNode)!}
            onUpdate={(patch) => updateNode(editingNode, patch)}
            onClose={() => setEditingNode(null)}
            characters={characters}
          />
        )}

        {/* Preview overlay */}
        {preview && currentPreviewNode && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-96 max-w-[90vw] rounded-xl border p-5"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--accent)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-semibold uppercase"
                style={{ color: "var(--accent)" }}
              >
                Preview
              </span>
              <button
                onClick={() => setPreview(null)}
                style={{ color: "var(--text-secondary)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {currentPreviewNode.type === "end" ? (
              <div>
                <p
                  className="text-sm italic"
                  style={{ color: "var(--text-secondary)" }}
                >
                  — End of dialogue —
                </p>
                <button
                  onClick={() => setPreview(null)}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Close
                </button>
              </div>
            ) : currentPreviewNode.type === "dialogue" ? (
              <div>
                <div
                  className="text-xs font-bold mb-1"
                  style={{ color: "var(--green)" }}
                >
                  {currentPreviewNode.speaker}
                </div>
                <p
                  className="text-sm mb-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  {currentPreviewNode.text}
                </p>
                <button
                  onClick={() =>
                    previewAdvance(currentPreviewNode.nextId)
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Continue →
                </button>
              </div>
            ) : currentPreviewNode.type === "choice" ? (
              <div>
                <p
                  className="text-sm mb-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  {currentPreviewNode.text}
                </p>
                <div className="space-y-1.5">
                  {currentPreviewNode.choices?.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => previewAdvance(c.targetId)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        background: "var(--bg-hover)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {c.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  [{currentPreviewNode.type}: {currentPreviewNode.text || currentPreviewNode.condition}]
                </p>
                <button
                  onClick={() =>
                    previewAdvance(currentPreviewNode.nextId)
                  }
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Continue →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditPanel({
  node,
  onUpdate,
  onClose,
  characters,
}: {
  node: DialogueNode;
  onUpdate: (patch: Partial<DialogueNode>) => void;
  onClose: () => void;
  characters: string[];
}) {
  return (
    <div
      className="absolute top-2 right-2 w-72 rounded-xl border p-4 overflow-y-auto max-h-[80vh] max-md:left-2 max-md:w-auto max-md:max-h-[60vh]"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-bold uppercase"
          style={{ color: NODE_COLORS[node.type] }}
        >
          Edit {NODE_LABELS[node.type]}
        </span>
        <button onClick={onClose} style={{ color: "var(--text-secondary)" }} title="Close" aria-label="Close editor">
          <X className="w-4 h-4" />
        </button>
      </div>

      {node.type === "dialogue" && (
        <>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Speaker
          </label>
          <input
            className="w-full px-2.5 py-1.5 rounded-lg text-sm mb-3 outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            value={node.speaker || ""}
            onChange={(e) => onUpdate({ speaker: e.target.value })}
            list="dialogue-speakers"
            placeholder={characters.length ? "Pick a story character or type a name" : "Speaker name"}
          />
          <datalist id="dialogue-speakers">
            {characters.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Text
          </label>
          <textarea
            className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none resize-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              minHeight: 60,
            }}
            value={node.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
        </>
      )}

      {node.type === "choice" && (
        <>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Prompt
          </label>
          <input
            className="w-full px-2.5 py-1.5 rounded-lg text-sm mb-3 outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            value={node.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
          <label
            className="block text-xs mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Choices
          </label>
          {node.choices?.map((c, i) => (
            <div key={i} className="flex gap-1 mb-1.5">
              <input
                className="flex-1 px-2 py-1 rounded text-xs outline-none"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                value={c.text}
                onChange={(e) => {
                  const choices = [...(node.choices || [])];
                  choices[i] = { ...choices[i], text: e.target.value };
                  onUpdate({ choices });
                }}
              />
              <button
                onClick={() => {
                  const choices = (node.choices || []).filter(
                    (_, j) => j !== i
                  );
                  onUpdate({ choices });
                }}
                style={{ color: "var(--red)", fontSize: 12 }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              onUpdate({
                choices: [
                  ...(node.choices || []),
                  { text: "New option", targetId: "" },
                ],
              })
            }
            className="text-xs mt-1"
            style={{ color: "var(--accent)" }}
          >
            + Add choice
          </button>
        </>
      )}

      {node.type === "condition" && (
        <>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Condition
          </label>
          <input
            className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            value={node.condition || node.text || ""}
            onChange={(e) =>
              onUpdate({ condition: e.target.value, text: e.target.value })
            }
          />
        </>
      )}

      {node.type === "action" && (
        <>
          <label
            className="block text-xs mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Action
          </label>
          <input
            className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            value={node.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
