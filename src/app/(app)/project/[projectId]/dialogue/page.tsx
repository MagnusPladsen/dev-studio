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
  Variable,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import type { DialogueTree, DialogueNode, DialogueVariable } from "@/types";
import { describeCheck, describeSet } from "@/lib/dialogue/logic";
import { applyTranslations, toLocalisationCsv, withChoiceIds, type TranslationSheet } from "@/lib/dialogue/localisation";
import { toYarn } from "@/lib/dialogue/yarn-export";
import { translationsCsvImporter } from "@/lib/import/dialogue/translations-csv";
import type { Importer } from "@/lib/import";
import { DialoguePreview } from "@/components/dialogue/DialoguePreview";
import { VariablesPanel } from "@/components/dialogue/VariablesPanel";
import { ActionFields, ConditionFields } from "@/components/dialogue/LogicFields";
import { FIELD_STYLE } from "@/components/dialogue/ValueInput";
import { useOpenParam, useTrackOpenAsset } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { dialog } from "@/components/Dialog";

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

/** What "Add node" offers: the node types, plus Set (an action that changes a variable). */
type AddKind = NodeType | "set";
const ADD_KINDS: AddKind[] = ["start", "dialogue", "choice", "condition", "set", "action", "end"];
const ADD_LABELS: Record<AddKind, string> = { ...NODE_LABELS, set: "Set" };
const ADD_COLORS: Record<AddKind, string> = { ...NODE_COLORS, set: NODE_COLORS.action };

/** "Add node" as one dropdown, for desktop widths where the row of node buttons doesn't fit beside the title. */
function AddNodeMenu({ onPick }: { onPick(kind: AddKind): void }) {
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
          {ADD_KINDS.map((kind) => (
            <button
              key={kind}
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onPick(kind);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ADD_COLORS[kind] }} />
              {ADD_LABELS[kind]}
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

function getNodeWidth(node: DialogueNode): number {
  if (node.type === "start" || node.type === "end") return 60;
  if (node.type === "condition") return 160;
  return 200;
}

function getNodeHeight(node: DialogueNode): number {
  if (node.type === "start" || node.type === "end") return 60;
  if (node.type === "choice") return 80 + (node.choices?.length || 1) * 28;
  if (node.type === "condition") return 80;
  return 90;
}

/** A condition's two exits: true at a third of its height, else at two thirds. */
const conditionExitTop = (node: DialogueNode, isElse?: boolean) => (getNodeHeight(node) * (isElse ? 2 : 1)) / 3;

function getOutputPoint(
  node: DialogueNode,
  choiceIdx?: number,
  isElse?: boolean
): { x: number; y: number } {
  const w = getNodeWidth(node);
  const h = getNodeHeight(node);
  if (node.type === "condition") return { x: node.x + w, y: node.y + conditionExitTop(node, isElse) };
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
    isElse?: boolean;
    mx: number;
    my: number;
  } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isVariablesOpen, setIsVariablesOpen] = useState(false);
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
      setIsPreviewing(false);
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
    () => (activeTree ? { name: activeTree.name, nodes: activeTree.nodes, variables: activeTree.variables, languages: activeTree.languages } : null),
    [activeTree?.name, activeTree?.nodes, activeTree?.variables, activeTree?.languages] // eslint-disable-line react-hooks/exhaustive-deps
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

  // With a dialogue open, a filled-in Localisation CSV adds its translations to it.
  const importers: Importer<DialogueTree | TranslationSheet>[] = activeTree ? [...DIALOGUE_IMPORTERS, translationsCsvImporter] : DIALOGUE_IMPORTERS;
  const imports = useImport<DialogueTree | TranslationSheet>({
    importers,
    noun: activeTree ? ["file", "files"] : ["dialogue", "dialogues"],
    history,
    openId: activeTree?.id ?? null,
    review: async (result, importer) =>
      importer === translationsCsvImporter && activeTree ? { ...result, warnings: applyTranslations(activeTree, result.items[0] as TranslationSheet).warnings } : result,
    apply: ({ items }, importer) => {
      if (importer === translationsCsvImporter) {
        if (activeTree) saveTree(applyTranslations(activeTree, items[0] as TranslationSheet).tree);
        return;
      }
      return importAsNewAssets("dialogues", projectId, items as DialogueTree[], {
        previousId: activeTree?.id ?? null,
        open: (tree) => showTree(tree),
        back: (previous) => showTree(previous ?? null),
      });
    },
  });

  function showTree(tree: DialogueTree | null) {
    setTrees(storage.getAll("dialogues", projectId));
    setActiveTree(tree);
    setSelectedNode(null);
    setEditingNode(null);
    setIsPreviewing(false);
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

  function addNode(kind: AddKind) {
    if (!activeTree) return;
    const type: NodeType = kind === "set" ? "action" : kind;
    const variable = activeTree.variables?.[0];
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
              { id: uuid(), text: "Option 1", targetId: "" },
              { id: uuid(), text: "Option 2", targetId: "" },
            ]
          : undefined,
    };
    if (kind === "condition" && variable) {
      node.check = { variable: variable.name, op: "==", value: variable.type === "bool" ? true : variable.defaultValue };
      node.condition = node.text = describeCheck(node.check);
    }
    if (kind === "set") {
      node.set = variable ? { variable: variable.name, op: variable.type === "bool" ? "toggle" : "set", value: variable.type === "bool" ? undefined : variable.defaultValue } : undefined;
      node.text = node.set ? describeSet(node.set) : "do_action";
      if (!variable) setIsVariablesOpen(true);
    }
    saveTree({ ...activeTree, nodes: [...activeTree.nodes, node] });
  }

  function deleteNode(id: string) {
    if (!activeTree) return;
    const nodes = activeTree.nodes
      .filter((n) => n.id !== id)
      .map((n) => {
        const updated = { ...n };
        if (updated.nextId === id) updated.nextId = undefined;
        if (updated.elseId === id) updated.elseId = undefined;
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

  function openEditor(id: string) {
    setEditingNode(id);
    setIsVariablesOpen(false);
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
            updateNode(fromNode.id, connecting.isElse ? { elseId: target.id } : { nextId: target.id });
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

  function exportLocalisation() {
    if (!activeTree) return;
    downloadText(`${activeTree.name.replace(/[^\w\- ]+/g, "")}.localisation.csv`, toLocalisationCsv(activeTree), "text/csv");
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
      } else {
        for (const isElse of node.type === "condition" ? [false, true] : [false]) {
          const target = activeTree.nodes.find((n) => n.id === (isElse ? node.elseId : node.nextId));
          if (!target) continue;
          const from = getOutputPoint(node, undefined, isElse);
          const to = getInputPoint(target);
          edges.push(
            <path
              key={`${node.id}-${isElse ? "else" : "next"}`}
              d={bezierPath(from.x, from.y, to.x, to.y)}
              stroke={NODE_COLORS[node.type]}
              strokeWidth={2}
              fill="none"
              opacity={0.6}
              strokeDasharray={isElse ? "6 4" : undefined}
            />
          );
        }
      }
    }

    if (connecting) {
      const fromNode = activeTree.nodes.find(
        (n) => n.id === connecting.fromId
      );
      if (fromNode) {
        const from = getOutputPoint(fromNode, connecting.choiceIdx, connecting.isElse);
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
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 30px 8px 8px",
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
            {node.check ? describeCheck(node.check) : node.condition || node.text || "if..."}
          </span>
          {(["true", "else"] as const).map((label) => (
            <span
              key={label}
              style={{ position: "absolute", right: 10, top: conditionExitTop(node, label === "else") - 7, fontSize: 9, color, fontWeight: 600 }}
            >
              {label}
            </span>
          ))}
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
              {node.set ? "Set" : "Action"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-primary)",
                wordBreak: "break-word",
                fontFamily: node.set ? "var(--font-mono, monospace)" : undefined,
              }}
            >
              {node.set ? describeSet(node.set) : node.text || "action"}
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
                      void dialog.confirm({ message: `Delete "${t.name}"?`, confirmLabel: "Delete", danger: true }).then((isConfirmed) => isConfirmed && deleteTree(t.id));
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
              setIsPreviewing(false);
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
          {ADD_KINDS.map((kind) => (
            <button
              key={kind}
              onClick={() => addNode(kind)}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap"
              style={{
                background: tint(ADD_COLORS[kind], 14),
                color: ADD_COLORS[kind],
                border: `1px solid ${tint(ADD_COLORS[kind], 45)}`,
              }}
              title={kind === "set" ? "Add a node that changes a variable" : `Add a ${ADD_LABELS[kind]} node`}
            >
              <Plus className="w-3 h-3" />
              {ADD_LABELS[kind]}
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
            onClick={() => {
              setIsVariablesOpen(!isVariablesOpen);
              setEditingNode(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)", background: isVariablesOpen ? "var(--bg-hover)" : undefined }}
            title="Variables and languages"
            aria-pressed={isVariablesOpen}
          >
            <Variable className="w-3.5 h-3.5" />
            Variables
          </button>
          <button
            onClick={() => setIsPreviewing(true)}
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
              { label: "Localisation CSV", description: "One row per line and choice, a column per language, to translate and import back", onClick: exportLocalisation },
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
                      openEditor(node.id);
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
                  openEditor(node.id);
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

                {/* Output handles (non-choice); a condition has a true and an else exit */}
                {node.type !== "end" &&
                  node.type !== "choice" &&
                  (node.type === "condition" ? [false, true] : [false]).map((isElse) => (
                    <div
                      key={isElse ? "else" : "next"}
                      className="output-handle"
                      style={{
                        position: "absolute",
                        right: -6,
                        top: (node.type === "condition" ? conditionExitTop(node, isElse) : getNodeHeight(node) / 2) - 6,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: isElse ? "var(--bg-primary)" : NODE_COLORS[node.type],
                        border: isElse ? `2px solid ${NODE_COLORS[node.type]}` : undefined,
                        cursor: "crosshair",
                      }}
                      title={node.type === "condition" ? (isElse ? "Else: drag to where it goes when false" : "True: drag to where it goes when true") : undefined}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setConnecting({
                          fromId: node.id,
                          isElse,
                          mx: e.clientX,
                          my: e.clientY,
                        });
                      }}
                    />
                  ))}

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
            variables={activeTree.variables ?? []}
            languages={activeTree.languages ?? []}
          />
        )}

        {isVariablesOpen && <VariablesPanel tree={activeTree} onChange={saveTree} onClose={() => setIsVariablesOpen(false)} />}

        {isPreviewing && <DialoguePreview tree={activeTree} onClose={() => setIsPreviewing(false)} />}
      </div>
    </div>
  );
}

function TranslationFields({
  label,
  translations,
  languages,
  onChange,
}: {
  label: string;
  translations?: DialogueNode["translations"];
  languages: string[];
  onChange(translations: DialogueNode["translations"]): void;
}) {
  return languages.map((language) => (
    <input
      key={language}
      className="w-full px-2 py-1 rounded text-xs outline-none mt-1"
      style={FIELD_STYLE}
      value={translations?.[language] ?? ""}
      placeholder={`${label} in ${language}`}
      onChange={(e) => {
        const next = { ...translations, [language]: e.target.value };
        if (!e.target.value) delete next[language];
        onChange(Object.keys(next).length ? next : undefined);
      }}
      aria-label={`${label} in ${language}`}
    />
  ));
}

function EditPanel({
  node,
  onUpdate,
  onClose,
  characters,
  variables,
  languages,
}: {
  node: DialogueNode;
  onUpdate: (patch: Partial<DialogueNode>) => void;
  onClose: () => void;
  characters: string[];
  variables: DialogueVariable[];
  languages: string[];
}) {
  // options get ids before one is added or removed, so their translations stay with them
  const choices = withChoiceIds(node).choices ?? [];
  return (
    <div
      className="absolute top-2 right-2 w-72 rounded-xl border p-4 overflow-y-auto max-h-[80vh] max-md:left-2 max-md:w-auto max-md:max-h-[60vh] z-10"
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
          Edit {node.set ? "Set" : NODE_LABELS[node.type]}
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
            style={FIELD_STYLE}
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
            style={{ ...FIELD_STYLE, minHeight: 60 }}
            value={node.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
          <TranslationFields label="Text" translations={node.translations} languages={languages} onChange={(translations) => onUpdate({ translations })} />
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
            className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none"
            style={FIELD_STYLE}
            value={node.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
          <TranslationFields label="Prompt" translations={node.translations} languages={languages} onChange={(translations) => onUpdate({ translations })} />
          <label
            className="block text-xs mb-2 mt-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Choices
          </label>
          {choices.map((c, i) => (
            <div key={c.id} className="mb-1.5">
              <div className="flex gap-1">
                <input
                  className="flex-1 px-2 py-1 rounded text-xs outline-none"
                  style={FIELD_STYLE}
                  value={c.text}
                  onChange={(e) => onUpdate({ choices: choices.map((choice, j) => (j === i ? { ...choice, text: e.target.value } : choice)) })}
                  aria-label={`Choice ${i + 1}`}
                />
                <button
                  onClick={() => onUpdate({ choices: choices.filter((_, j) => j !== i) })}
                  style={{ color: "var(--red)", fontSize: 12 }}
                  title="Remove choice"
                  aria-label={`Remove choice ${i + 1}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <TranslationFields
                label={`Choice ${i + 1}`}
                translations={c.translations}
                languages={languages}
                onChange={(translations) => onUpdate({ choices: choices.map((choice, j) => (j === i ? { ...choice, translations } : choice)) })}
              />
            </div>
          ))}
          <button
            onClick={() =>
              onUpdate({
                choices: [...choices, { id: uuid(), text: "New option", targetId: "" }],
              })
            }
            className="text-xs mt-1"
            style={{ color: "var(--accent)" }}
          >
            + Add choice
          </button>
        </>
      )}

      {node.type === "condition" && <ConditionFields node={node} variables={variables} onUpdate={onUpdate} />}

      {node.type === "action" && <ActionFields node={node} variables={variables} onUpdate={onUpdate} />}
    </div>
  );
}
