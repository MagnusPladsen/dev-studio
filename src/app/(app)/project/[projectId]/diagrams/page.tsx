"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useHistory, isTextField } from "@/hooks/useHistory";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { useAutosave } from "@/hooks/useAutosave";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu } from "@/components/ExportMenu";
import { ExamplesBar } from "@/components/ExamplesBar";
import { HelpButton } from "@/components/HelpButton";
import { useToast } from "@/components/Toast";
import { useParams } from "next/navigation";
import {
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  ArrowRight,
  GitBranch,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import type { Diagram, DiagramNode, AssetRef } from "@/types";
import { useOpenParam, useTrackOpenAsset } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { AssetPickerModal } from "@/components/AssetPickerModal";
import { createLongPress } from "@/lib/long-press";
import type { Point as MenuPoint } from "@/lib/menu-position";
import { ASSET_KINDS, getAsset } from "@/lib/assets";
import {
  defaultSize,
  isAutoHeight,
  isFlowShape,
  minSize,
  NODE_LABELS,
  SHAPE_COLORS,
  linkPreview,
  linkUrl,
  nodeAsset,
  type NodeType,
} from "@/lib/diagrams/cards";
import { isImageUrl, normalizeUrl } from "@/lib/diagrams/embeds";
import { boundsOf, idsInside, stackColumn, type Point, type Rect } from "@/lib/diagrams/geometry";
import {
  alignRects,
  bringToFront,
  distributeRects,
  idsWithin,
  rectBetween,
  sendToBack,
  toggleId,
  type Alignment,
  type Axis,
} from "@/lib/diagrams/arrange";
import { cloneCards, copyCards, parseCards, serializeCards, type CopiedCards } from "@/lib/diagrams/clipboard";
import { drawingData, smoothPath, strokeFromPoints, DRAWING_STROKE, SIMPLIFY_TOLERANCE } from "@/lib/diagrams/freehand";
import { renderDiagramSvg } from "@/lib/diagrams/render-svg";
import { downloadBlob } from "@/lib/download";
import { imageFilesFrom, readImageFile } from "@/lib/diagrams/image-file";
import { renderDiagramPng, type AssetLook } from "@/lib/diagrams/render-png";
import { DiagramCard } from "@/components/diagrams/DiagramCard";
import { EdgeLayer } from "@/components/diagrams/EdgeLayer";
import { MultiSelectionPanel, SelectionPanel } from "@/components/diagrams/SelectionPanel";
import { AddCardMenu } from "@/components/diagrams/AddCardMenu";
import { ToolPicker, type BoardTool } from "@/components/diagrams/ToolPicker";

function downloadFile(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

type Interaction =
  // `releaseTo`: the selection to switch to when the card is let go without moving (a tap, not a drag).
  | { kind: "drag"; start: Point; origins: Map<string, Point>; hasMoved: boolean; releaseTo: string[] | null }
  | { kind: "box"; start: Point; base: string[] }
  | { kind: "draw"; points: Point[] }
  | { kind: "pan"; start: Point; pan: Point }
  | { kind: "resize"; nodeId: string; start: Point; width: number; height: number }
  | { kind: "connect"; fromId: string }
  | { kind: "pinch"; distance: number; zoom: number; anchor: Point };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const DOUBLE_TAP_MS = 320;
const DRAG_THRESHOLD_PX = 3;
const GRID = 30;
const PASTE_OFFSET = 24;
/** Screen pixels the pen must travel before another point is recorded. */
const PEN_STEP_PX = 2;

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

function closestData(target: EventTarget | null, attribute: string): string | null {
  const element = target instanceof Element ? target.closest(`[${attribute}]`) : null;
  return element ? element.getAttribute(attribute) : null;
}

function describeAsset(projectId: string, node: DiagramNode): AssetLook | null {
  const ref = nodeAsset(node);
  const summary = ref ? getAsset(projectId, ref.type, ref.id) : undefined;
  if (!ref || !summary) return null;
  const kind = ASSET_KINDS[ref.type];
  return { name: summary.name, kind: kind.label, color: kind.color, thumbnail: summary.thumbnail };
}

export default function DiagramsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { showToast } = useToast();

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [current, setCurrent] = useState<Diagram | null>(null);
  const [showList, setShowList] = useState(true);

  const [mode, setMode] = useState<BoardTool>("select");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectDraft, setConnectDraft] = useState<{ fromId: string; to: Point } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [loadingPreviews, setLoadingPreviews] = useState<ReadonlySet<string>>(new Set());
  const [assetPicker, setAssetPicker] = useState<{ replaceId: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectionBox, setSelectionBox] = useState<Rect | null>(null);
  const [penDraft, setPenDraft] = useState<Point[] | null>(null);
  const selectedNodeId = selectedIds.length === 1 ? selectedIds[0] : null;

  const interaction = useRef<Interaction | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const lastTap = useRef({ key: "", time: 0 });
  const imageTarget = useRef<{ replaceId: string | null; at: Point | null }>({ replaceId: null, at: null });
  const pasteCount = useRef(0);

  const { assetTriggerProps, pasteTriggerProps, openAssetMenu } = useAssetMenu();
  const pressedNode = useRef<{ node: DiagramNode; asset: AssetRef } | null>(null);
  const hasPressFired = useRef(false);
  const fireLongPress = useRef<(point: MenuPoint) => void>(() => {});
  const [longPress] = useState(() => createLongPress((point) => fireLongPress.current(point)));
  useEffect(() => {
    fireLongPress.current = (point) => {
      const pressed = pressedNode.current;
      if (!pressed) return;
      hasPressFired.current = true;
      lastTap.current = { key: "", time: 0 };
      const drag = interaction.current;
      if (drag?.kind === "drag") restorePositions(drag.origins);
      interaction.current = null;
      setIsInteracting(false);
      openAssetMenu(point, pressed.asset, null);
    };
  });
  useEffect(() => () => longPress.cancel(), [longPress]);

  // Undo history tracks content only (not updatedAt), and a drag or resize counts once, on release.
  const content = useMemo(
    () => (current ? { name: current.name, nodes: current.nodes, edges: current.edges } : null),
    [current?.name, current?.nodes, current?.edges] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [stableContent, setStableContent] = useState(content);
  if (!isInteracting && stableContent !== content) setStableContent(content);
  const history = useHistory(
    isInteracting ? stableContent : content,
    (v) => {
      if (!v) return;
      setCurrent((c) => (c ? { ...c, ...v, updatedAt: new Date().toISOString() } : c));
      setSelectedIds([]);
      setSelectedEdgeId(null);
    },
    current?.id
  );

  // Every edit is saved a moment later; a drag saves once, on release.
  const autosave = useAutosave(
    current,
    (d) => {
      // skip diagrams deleted meanwhile, so a late save can't bring them back
      if (!d || !storage.getById("diagrams", d.id, projectId)) return;
      storage.save("diagrams", d, projectId);
      setDiagrams(storage.getAll("diagrams", projectId));
    },
    { resetKey: current?.id, enabled: !isInteracting }
  );

  const flushSave = autosave.flush;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

  const view = useRef({ pan, zoom });
  view.current = { pan, zoom };

  useEffect(() => {
    const all = storage.getAll("diagrams", projectId);
    setDiagrams(all);
    if (all.length > 0) {
      setCurrent(all[0]);
      setShowList(false);
    }
    setLoaded(true);
  }, [projectId]);

  useOpenParam((id) => {
    const d = storage.getById("diagrams", id, projectId);
    if (d) loadDiagram(d);
  }, loaded);
  useTrackOpenAsset(current?.id ? { type: "diagram", id: current?.id } : null);

  // --- Geometry ---
  const rectOf = useCallback(
    (node: DiagramNode): Rect => ({
      x: node.x,
      y: node.y,
      width: node.width,
      height: isAutoHeight(node.type) ? measured[node.id] ?? node.height : node.height,
    }),
    [measured]
  );

  const onMeasure = useCallback((id: string, height: number) => {
    setMeasured((m) => (m[id] === height ? m : { ...m, [id]: height }));
  }, []);

  function toBoard(clientX: number, clientY: number): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    const { pan: p, zoom: z } = view.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - p.x) / z, y: (clientY - rect.top - p.y) / z };
  }

  function viewportCenter(): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? toBoard(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 0, y: 0 };
  }

  function zoomAround(clientX: number, clientY: number, nextZoom: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const { pan: p, zoom: z } = view.current;
    const target = clampZoom(nextZoom);
    if (!rect) return setZoom(target);
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    setPan({ x: mx - ((mx - p.x) / z) * target, y: my - ((my - p.y) / z) * target });
    setZoom(target);
  }

  function zoomBy(factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) zoomAround(rect.left + rect.width / 2, rect.top + rect.height / 2, view.current.zoom * factor);
  }

  function fitToCards() {
    const rect = viewportRef.current?.getBoundingClientRect();
    const bounds = current ? boundsOf(current.nodes.map(rectOf)) : null;
    if (!rect || !bounds) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const z = clampZoom(Math.min(1, (rect.width - 80) / bounds.width, (rect.height - 80) / bounds.height));
    setZoom(z);
    setPan({ x: rect.width / 2 - (bounds.x + bounds.width / 2) * z, y: rect.height / 2 - (bounds.y + bounds.height / 2) * z });
  }

  // Wheel zooms around the pointer; a trackpad pinch arrives as ctrl+wheel with small steps.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : e.deltaY > 0 ? 0.9 : 1.1;
      zoomAround(e.clientX, e.clientY, view.current.zoom * factor);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  });

  // --- Editing the diagram ---
  function updateCurrent(fn: (d: Diagram) => Diagram) {
    setCurrent((prev) => (prev ? fn({ ...prev, updatedAt: new Date().toISOString() }) : prev));
  }

  const updateNode = useCallback((id: string, patch: Partial<DiagramNode>) => {
    setCurrent((prev) =>
      prev
        ? { ...prev, updatedAt: new Date().toISOString(), nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }
        : prev
    );
  }, []);

  function restorePositions(origins: Map<string, Point>) {
    updateCurrent((d) => ({ ...d, nodes: d.nodes.map((n) => (origins.has(n.id) ? { ...n, ...origins.get(n.id)! } : n)) }));
  }

  const fetchPreview = useCallback(async (nodeId: string, url: string) => {
    setLoadingPreviews((s) => new Set(s).add(nodeId));
    try {
      const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      const preview = await response.json();
      if (!response.ok || preview.error) return;
      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              nodes: prev.nodes.map((n) => (n.id === nodeId && n.data?.url === url ? { ...n, data: { ...n.data, preview } } : n)),
            }
          : prev
      );
    } catch {
      // Offline or blocked: the card still shows the link itself.
    } finally {
      setLoadingPreviews((s) => {
        const next = new Set(s);
        next.delete(nodeId);
        return next;
      });
    }
  }, []);

  const commitNode = useCallback(
    (id: string, patch: Partial<DiagramNode>) => {
      updateNode(id, patch);
      setEditingNodeId(null);
      const url = patch.data?.url;
      if (typeof url === "string" && !patch.data?.preview) void fetchPreview(id, url);
    },
    [updateNode, fetchPreview]
  );

  const stopEditing = useCallback(() => setEditingNodeId(null), []);
  const startEditing = useCallback((id: string) => {
    setSelectedIds([id]);
    setEditingNodeId(id);
  }, []);

  const pickImage = useCallback((replaceId: string | null, at: Point | null = null) => {
    imageTarget.current = { replaceId, at };
    fileInputRef.current?.click();
  }, []);
  const pickImageFor = useCallback((id: string) => pickImage(id), [pickImage]);

  function addNode(type: NodeType, at?: Point, extra: Partial<DiagramNode> = {}): DiagramNode {
    const size = { ...defaultSize(type), ...(extra.width ? { width: extra.width } : {}) };
    const center = at ?? viewportCenter();
    const cascade = at ? 0 : ((current?.nodes.length ?? 0) % 6) * 20;
    const node: DiagramNode = {
      id: uuid(),
      type,
      label: isFlowShape(type) ? NODE_LABELS[type] : type === "checklist" ? "To-do" : type === "group" ? "Group" : "",
      ...extra,
      x: Math.round(center.x - size.width / 2 + cascade),
      y: Math.round(center.y - size.height / 2 + cascade),
      ...size,
    };
    updateCurrent((d) => (type === "group" ? { ...d, nodes: [node, ...d.nodes] } : { ...d, nodes: [...d.nodes, node] }));
    selectNodes([node.id]);
    return node;
  }

  function addFromMenu(type: NodeType) {
    if (type === "image") return pickImage(null);
    if (type === "asset") return setAssetPicker({ replaceId: null });
    const node = addNode(type);
    if (type === "note" || type === "checklist" || type === "link") setEditingNodeId(node.id);
  }

  async function addImages(files: File[], at: Point) {
    for (const [index, file] of files.entries()) {
      try {
        const { src, aspect } = await readImageFile(file);
        const offset = index * 24;
        addNode("image", { x: at.x + offset, y: at.y + offset }, { width: aspect < 1 ? 200 : 280, data: { src, aspect } });
      } catch (error) {
        showToast({ message: error instanceof Error ? error.message : "Could not add that image" });
      }
    }
  }

  async function replaceImage(nodeId: string, file: File) {
    try {
      const { src, aspect } = await readImageFile(file);
      setCurrent((prev) =>
        prev ? { ...prev, nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, src, aspect } } : n)) } : prev
      );
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "Could not use that image" });
    }
  }

  function onFilesChosen(files: File[]) {
    const { replaceId, at } = imageTarget.current;
    if (replaceId && files[0]) void replaceImage(replaceId, files[0]);
    else if (files.length) void addImages(files, at ?? viewportCenter());
  }

  function addImageFromUrl(url: string, at: Point) {
    const img = new Image();
    img.onload = () => addNode("image", at, { width: 280, data: { src: url, aspect: img.naturalWidth / img.naturalHeight || 1 } });
    img.onerror = () => addLink(url, at);
    img.src = url;
  }

  function addLink(url: string, at: Point) {
    const node = addNode("link", at, { data: { url } });
    void fetchPreview(node.id, url);
  }

  /** Pasted or dropped text: a link becomes a link (or image) card, anything else a note. */
  function addFromText(text: string, at: Point) {
    const url = normalizeUrl(text);
    if (url && /^(https?:\/\/|www\.)/i.test(text.trim())) {
      if (isImageUrl(url)) addImageFromUrl(url, at);
      else addLink(url, at);
      return;
    }
    addNode("note", at, { label: text.trim().slice(0, 5000) });
  }

  function pickAsset(ref: AssetRef) {
    const name = getAsset(projectId, ref.type, ref.id)?.name ?? ASSET_KINDS[ref.type].label;
    const replaceId = assetPicker?.replaceId;
    setAssetPicker(null);
    if (replaceId) updateNode(replaceId, { label: name, data: { asset: ref } });
    else addNode("asset", undefined, { label: name, data: { asset: ref } });
  }

  function selectNodes(ids: string[]) {
    setSelectedIds(ids);
    setSelectedEdgeId(null);
  }

  function deleteSelection() {
    if (!selectedIds.length && !selectedEdgeId) return;
    const ids = new Set(selectedIds);
    updateCurrent((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => !ids.has(n.id)),
      edges: d.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to) && edge.id !== selectedEdgeId),
    }));
    selectNodes([]);
  }

  function recolorSelection(color: string | undefined) {
    const ids = new Set(selectedIds);
    updateCurrent((d) => ({ ...d, nodes: d.nodes.map((n) => (ids.has(n.id) ? { ...n, color } : n)) }));
  }

  function pasteCards(cards: CopiedCards, offset: number) {
    const pasted = cloneCards(cards, { x: offset, y: offset }, uuid);
    updateCurrent((d) => ({ ...d, nodes: [...d.nodes, ...pasted.nodes], edges: [...d.edges, ...pasted.edges] }));
    selectNodes(pasted.nodes.map((n) => n.id));
  }

  function duplicateSelection() {
    if (current && selectedIds.length) pasteCards(copyCards(current, selectedIds), PASTE_OFFSET);
  }

  function arrangeSelection(direction: "front" | "back") {
    const reorder = direction === "front" ? bringToFront : sendToBack;
    updateCurrent((d) => ({ ...d, nodes: reorder(d.nodes, selectedIds) }));
  }

  function selectedRects() {
    return (current?.nodes ?? []).filter((n) => selectedIds.includes(n.id)).map((n) => ({ id: n.id, ...rectOf(n) }));
  }

  /** Moves nodes to new positions; a moved group takes the cards inside it along. */
  function moveNodesTo(positions: Map<string, Point>) {
    const nodes = current?.nodes ?? [];
    const moves = new Map(positions);
    for (const [id, to] of positions) {
      const group = nodes.find((n) => n.id === id && n.type === "group");
      if (!group) continue;
      for (const memberId of membersOf(group, nodes).filter((m) => !positions.has(m))) {
        const member = nodes.find((n) => n.id === memberId)!;
        moves.set(memberId, { x: member.x + to.x - group.x, y: member.y + to.y - group.y });
      }
    }
    updateCurrent((d) => ({ ...d, nodes: d.nodes.map((n) => (moves.has(n.id) ? { ...n, ...moves.get(n.id)! } : n)) }));
  }

  function alignSelection(edge: Alignment) {
    moveNodesTo(alignRects(selectedRects(), edge));
  }

  function distributeSelection(axis: Axis) {
    moveNodesTo(distributeRects(selectedRects(), axis));
  }

  function changeTool(tool: BoardTool) {
    setMode(tool);
    setConnectFrom(null);
    setConnectDraft(null);
    if (tool === "draw" || tool === "connect") selectNodes([]);
  }

  function addEdge(from: string, to: string) {
    if (from === to) return;
    updateCurrent((d) => ({ ...d, edges: [...d.edges, { id: uuid(), from, to, label: "", type: "arrow" }] }));
  }

  function stackGroup(groupId: string) {
    if (!current) return;
    const group = current.nodes.find((n) => n.id === groupId);
    if (!group) return;
    const members = membersOf(group, current.nodes);
    const cards = current.nodes.filter((n) => members.includes(n.id)).map((n) => ({ id: n.id, ...rectOf(n) }));
    const { positions, width, height } = stackColumn(rectOf(group), cards);
    updateCurrent((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === groupId ? { ...n, width, height } : positions.has(n.id) ? { ...n, ...positions.get(n.id)! } : n)),
    }));
  }

  function membersOf(group: DiagramNode, nodes: DiagramNode[]): string[] {
    const others = nodes.filter((n) => n.id !== group.id).map((n) => ({ id: n.id, ...rectOf(n) }));
    return idsInside(rectOf(group), others);
  }

  function setNodeAsset(nodeId: string, value: string) {
    const node = current?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const data = { ...(node.data ?? {}) };
    if (value) {
      const [type, ...rest] = value.split(":");
      data.asset = { type, id: rest.join(":") };
    } else {
      delete data.asset;
    }
    updateNode(nodeId, { data });
  }

  // --- Pointer input ---
  function isDoubleTap(key: string): boolean {
    const now = Date.now();
    const isDouble = lastTap.current.key === key && now - lastTap.current.time < DOUBLE_TAP_MS;
    lastTap.current = isDouble ? { key: "", time: 0 } : { key, time: now };
    return isDouble;
  }

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    const drag = interaction.current;
    if (drag?.kind === "drag" && drag.hasMoved) restorePositions(drag.origins);
    setSelectionBox(null);
    setPenDraft(null);
    longPress.cancel();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    interaction.current = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.current.zoom, anchor: toBoard(mid.x, mid.y) };
    setIsInteracting(false);
  }

  function pressNode(nodeId: string, point: Point, e: React.PointerEvent) {
    const node = current?.nodes.find((n) => n.id === nodeId);
    if (!node || !current) return;
    if (mode === "connect") {
      if (connectFrom && connectFrom !== nodeId) {
        addEdge(connectFrom, nodeId);
        setConnectFrom(null);
        setConnectDraft(null);
      } else setConnectFrom(nodeId);
      return;
    }
    const isAdditive = e.shiftKey || mode === "area";
    // Start editing after the browser's own pointer-down focus change, or it would blur the new editor at once.
    const canEdit = !isAdditive && node.type !== "drawing";
    if (canEdit && isDoubleTap(nodeId)) return void setTimeout(() => startEditing(nodeId));
    const selection = selectedIds.includes(nodeId) ? selectedIds : isAdditive ? [...selectedIds, nodeId] : [nodeId];
    selectNodes(selection);
    const ids = withGroupMembers(selection, current.nodes);
    const origins = new Map(current.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    interaction.current = { kind: "drag", start: point, origins, hasMoved: false, releaseTo: selectionOnTap(nodeId, isAdditive) };
    const asset = nodeAsset(node);
    pressedNode.current = asset ? { node, asset } : null;
    if (asset) longPress.down({ x: e.clientX, y: e.clientY, pointerType: e.pointerType });
  }

  /** A tap on an already selected card: Shift (or the box tool) takes it out, otherwise it becomes the only one. */
  function selectionOnTap(nodeId: string, isAdditive: boolean): string[] | null {
    if (!selectedIds.includes(nodeId)) return null;
    if (isAdditive) return toggleId(selectedIds, nodeId);
    return selectedIds.length > 1 ? [nodeId] : null;
  }

  function withGroupMembers(ids: string[], nodes: DiagramNode[]): string[] {
    const members = nodes.filter((n) => n.type === "group" && ids.includes(n.id)).flatMap((group) => membersOf(group, nodes));
    return [...new Set([...ids, ...members])];
  }

  function pressEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedIds([]);
    if (isDoubleTap(`edge:${edgeId}`)) setTimeout(() => setEditingEdgeId(edgeId));
  }

  function startHandleDrag(handle: "resize" | "connect", nodeId: string, point: Point) {
    const node = current?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (handle === "connect") {
      interaction.current = { kind: "connect", fromId: nodeId };
      setConnectDraft({ fromId: nodeId, to: point });
      return;
    }
    const { width, height } = rectOf(node);
    interaction.current = { kind: "resize", nodeId, start: point, width, height };
    setIsInteracting(true);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (closestData(e.target, "data-card-control") !== null) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) return startPinch();
    hasPressFired.current = false;
    pressedNode.current = null;
    if (editingNodeId || editingEdgeId) (document.activeElement as HTMLElement | null)?.blur();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const point = toBoard(e.clientX, e.clientY);
    if (mode === "draw") return startPen(point);
    const nodeId = closestData(e.target, "data-node-id");
    if (nodeId && closestData(e.target, "data-resize-handle") !== null) return startHandleDrag("resize", nodeId, point);
    if (nodeId && closestData(e.target, "data-connect-handle") !== null) return startHandleDrag("connect", nodeId, point);
    if (nodeId) return pressNode(nodeId, point, e);
    const edgeId = closestData(e.target, "data-edge-id");
    if (edgeId) return pressEdge(edgeId);
    if (mode === "connect") {
      setConnectFrom(null);
      setConnectDraft(null);
    }
    if (mode === "area" || e.shiftKey) return startBox(point, e.shiftKey ? selectedIds : []);
    selectNodes([]);
    interaction.current = { kind: "pan", start: { x: e.clientX, y: e.clientY }, pan: view.current.pan };
  }

  function startBox(point: Point, base: string[]) {
    selectNodes(base);
    interaction.current = { kind: "box", start: point, base };
    setSelectionBox({ ...point, width: 0, height: 0 });
  }

  function moveBox(box: Extract<Interaction, { kind: "box" }>, point: Point) {
    const area = rectBetween(box.start, point);
    const rects = (current?.nodes ?? []).map((n) => ({ id: n.id, ...rectOf(n) }));
    setSelectionBox(area);
    setSelectedIds([...new Set([...box.base, ...idsWithin(area, rects)])]);
  }

  function startPen(point: Point) {
    interaction.current = { kind: "draw", points: [point] };
    setPenDraft([point]);
  }

  function movePen(pen: Extract<Interaction, { kind: "draw" }>, point: Point) {
    const last = pen.points[pen.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) * view.current.zoom < PEN_STEP_PX) return;
    pen.points.push(point);
    setPenDraft([...pen.points]);
  }

  function finishPen(points: Point[]) {
    const stroke = strokeFromPoints(points, SIMPLIFY_TOLERANCE / view.current.zoom);
    const { x, y, width, height } = stroke;
    const node: DiagramNode = { id: uuid(), type: "drawing", label: "", x, y, width, height, data: drawingData(stroke) };
    updateCurrent((d) => ({ ...d, nodes: [...d.nodes, node] }));
    setPenDraft(null);
  }

  function moveDrag(drag: Extract<Interaction, { kind: "drag" }>, point: Point) {
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (!drag.hasMoved) {
      if (Math.hypot(dx, dy) * view.current.zoom < DRAG_THRESHOLD_PX) return;
      drag.hasMoved = true;
      setIsInteracting(true);
    }
    updateCurrent((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        const origin = drag.origins.get(n.id);
        return origin ? { ...n, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) } : n;
      }),
    }));
  }

  function moveResize(resize: Extract<Interaction, { kind: "resize" }>, point: Point) {
    const node = current?.nodes.find((n) => n.id === resize.nodeId);
    if (!node) return;
    const min = minSize(node.type);
    const width = Math.max(min.width, Math.round(resize.width + point.x - resize.start.x));
    const height = isAutoHeight(node.type) ? node.height : Math.max(min.height, Math.round(resize.height + point.y - resize.start.y));
    updateNode(node.id, { width, height });
  }

  function movePinch(pinch: Extract<Interaction, { kind: "pinch" }>) {
    const [a, b] = [...pointers.current.values()];
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!a || !b || !rect) return;
    const z = clampZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance);
    const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    setZoom(z);
    setPan({ x: mid.x - pinch.anchor.x * z, y: mid.y - pinch.anchor.y * z });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    longPress.move({ x: e.clientX, y: e.clientY });
    const point = toBoard(e.clientX, e.clientY);
    const active = interaction.current;
    if (!active) {
      if (mode === "connect" && connectFrom) setConnectDraft({ fromId: connectFrom, to: point });
      return;
    }
    if (active.kind === "drag") moveDrag(active, point);
    else if (active.kind === "resize") moveResize(active, point);
    else if (active.kind === "connect") setConnectDraft({ fromId: active.fromId, to: point });
    else if (active.kind === "pinch") movePinch(active);
    else if (active.kind === "box") moveBox(active, point);
    else if (active.kind === "draw") movePen(active, point);
    else setPan({ x: active.pan.x + e.clientX - active.start.x, y: active.pan.y + e.clientY - active.start.y });
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    longPress.up();
    const active = interaction.current;
    if (active?.kind === "connect" && e.type !== "pointercancel") {
      const targetId = closestData(document.elementFromPoint(e.clientX, e.clientY), "data-node-id");
      if (targetId) addEdge(active.fromId, targetId);
    }
    if (active?.kind === "connect") setConnectDraft(null);
    if (active?.kind === "box") setSelectionBox(null);
    if (active?.kind === "draw") {
      if (e.type === "pointercancel") setPenDraft(null);
      else finishPen(active.points);
    }
    if (active?.kind === "drag" && !active.hasMoved && active.releaseTo) selectNodes(active.releaseTo);
    if (active?.kind === "pinch" && pointers.current.size > 0) return;
    interaction.current = null;
    setIsInteracting(false);
  }

  function openNodeMenu(e: React.MouseEvent<HTMLDivElement>) {
    const nodeId = closestData(e.target, "data-node-id");
    const node = nodeId ? current?.nodes.find((n) => n.id === nodeId) : undefined;
    const asset = node && nodeAsset(node);
    if (!asset || closestData(e.target, "data-card-control") !== null) return;
    e.preventDefault();
    if (!hasPressFired.current) openAssetMenu({ x: e.clientX, y: e.clientY }, asset, null);
  }

  function handleShortcut(e: React.KeyboardEvent): boolean {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
    const key = e.key.toLowerCase();
    if (key === "d") duplicateSelection();
    else if (key === "a") selectNodes(current?.nodes.map((n) => n.id) ?? []);
    else return false;
    e.preventDefault();
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingNodeId || editingEdgeId) return;
    if (isTextField(e.target)) return;
    if (handleShortcut(e)) return;
    if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
    if (e.key === "Escape") {
      changeTool("select");
      selectNodes([]);
    }
  }

  // Copy or cut the selected cards as marked JSON on the system clipboard, so they paste into any board.
  useEffect(() => {
    if (showList) return;
    const onCopy = (e: ClipboardEvent) => {
      if (!current || !selectedIds.length || isTextField(document.activeElement)) return;
      if (!(window.getSelection()?.isCollapsed ?? true)) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", serializeCards(copyCards(current, selectedIds)));
      pasteCount.current = 0;
      if (e.type === "cut") deleteSelection();
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
    };
  });

  // Paste an image, a link or text straight onto the open board.
  useEffect(() => {
    if (showList) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTextField(e.target) || isTextField(document.activeElement)) return;
      const files = imageFilesFrom(e.clipboardData);
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const cards = parseCards(text);
      if (cards) {
        e.preventDefault();
        pasteCount.current += 1;
        return pasteCards(cards, PASTE_OFFSET * pasteCount.current);
      }
      if (!files.length && !text.trim()) return;
      e.preventDefault();
      if (files.length) void addImages(files, viewportCenter());
      else addFromText(text, viewportCenter());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    // Always swallow the drop, so a dropped PDF or other file never navigates away from the board.
    e.preventDefault();
    const files = imageFilesFrom(e.dataTransfer);
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!files.length && !text) return;
    const at = toBoard(e.clientX, e.clientY);
    if (files.length) void addImages(files, at);
    else addFromText(text.split("\n")[0], at);
  }

  // --- Diagrams ---
  function loadDiagram(d: Diagram) {
    setCurrent(d);
    setShowList(false);
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setEditingNodeId(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function newDiagram() {
    const d: Diagram = {
      id: uuid(),
      projectId,
      name: "Untitled canvas",
      nodes: [],
      edges: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.save("diagrams", d, projectId);
    setDiagrams(storage.getAll("diagrams", projectId));
    loadDiagram(d);
  }

  function deleteDiagram(id: string) {
    storage.delete("diagrams", id, projectId);
    const all = storage.getAll("diagrams", projectId);
    setDiagrams(all);
    if (current?.id === id) {
      setCurrent(all[0] || null);
      if (all.length === 0) setShowList(true);
    }
  }

  function toggleEdgeType() {
    if (!selectedEdgeId) return;
    updateCurrent((d) => ({
      ...d,
      edges: d.edges.map((edge) => {
        if (edge.id !== selectedEdgeId) return edge;
        const types = ["arrow", "dashed", "line"] as const;
        return { ...edge, type: types[(types.indexOf(edge.type) + 1) % types.length] };
      }),
    }));
  }

  async function exportPng() {
    if (!current) return;
    const canvas = await renderDiagramPng({ diagram: current, rectOf, describeAsset: (node) => describeAsset(projectId, node) });
    downloadFile(`${current.name || "canvas"}.png`, canvas.toDataURL("image/png"));
  }

  function exportSvg() {
    if (!current) return;
    const svg = renderDiagramSvg({ diagram: current, rectOf, describeAsset: (node) => describeAsset(projectId, node) });
    downloadBlob(`${current.name || "canvas"}.svg`, new Blob([svg], { type: "image/svg+xml" }));
  }

  function exportJson() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2)], { type: "application/json" }));
    downloadFile(`${current.name || "canvas"}.canvas.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- List view ---
  if (showList) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Canvas
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <HelpButton topic="diagrams" />
            <PasteButton type="diagram" />
            <button
              onClick={newDiagram}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium shrink-0"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <Plus className="w-4 h-4" />
              New canvas
            </button>
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
          Boards for moodboards, story flow, level planning and reference collections, plus flow charts and state machines.
        </p>
        <ExamplesBar projectId={projectId} collections={["diagrams"]} className="mb-6" />
        {diagrams.length === 0 ? (
          <div {...pasteTriggerProps("diagram")} className="text-center py-20 rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }}>
            <GitBranch className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
            <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              No canvases yet
            </p>
            <p className="text-sm mb-4 px-4" style={{ color: "var(--text-secondary)" }}>
              Pin up notes, images, videos, links and to-dos, or plan game logic with flow charts
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={newDiagram}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                New canvas
              </button>
            </div>
          </div>
        ) : (
          <div {...pasteTriggerProps("diagram")} className="grid gap-3">
            {diagrams.map((d) => (
              <div
                key={d.id}
                {...assetTriggerProps({ type: "diagram", id: d.id })}
                tabIndex={0}
                onKeyDown={(e) => {
                  const trigger = assetTriggerProps({ type: "diagram", id: d.id });
                  trigger.onKeyDown(e);
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    loadDiagram(d);
                  }
                }}
                className="group flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                onClick={() => loadDiagram(d)}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <div>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{d.name}</span>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {d.nodes.length} cards · {d.edges.length} lines
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.name}"?`)) deleteDiagram(d.id); }}
                    className="p-2 rounded md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--red)" }}
                    title="Delete canvas"
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <AssetPinButton asset={{ type: "diagram", id: d.id }} label={d.name} />
                  <AssetMenuButton asset={{ type: "diagram", id: d.id }} label={d.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const selectedNode = current?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodes = current?.nodes.filter((n) => selectedIds.includes(n.id)) ?? [];
  const arrangeHandlers = {
    onDuplicate: duplicateSelection,
    onArrange: arrangeSelection,
    onAlign: alignSelection,
    onDistribute: distributeSelection,
  };
  const groups = current?.nodes.filter((n) => n.type === "group") ?? [];
  const cards = current?.nodes.filter((n) => n.type !== "group") ?? [];
  const renderCard = (node: DiagramNode) => (
    <DiagramCard
      key={node.id}
      node={node}
      projectId={projectId}
      isSelected={selectedIds.includes(node.id)}
      hasHandles={node.id === selectedNodeId}
      isEditing={node.id === editingNodeId}
      isConnectSource={node.id === connectFrom || node.id === connectDraft?.fromId}
      isLoading={loadingPreviews.has(node.id) && !linkPreview(node).title && Boolean(linkUrl(node))}
      onMeasure={onMeasure}
      onCommit={commitNode}
      onStopEditing={stopEditing}
      onPickImage={pickImageFor}
    />
  );

  // --- Editor view ---
  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Top toolbar */}
      <div
        className="flex items-center justify-between px-3 h-12 border-b shrink-0 max-md:h-auto max-md:flex-wrap max-md:gap-y-1.5 max-md:py-1.5"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={() => { autosave.flush(); setShowList(true); }}
            className="px-2 py-1 rounded text-xs whitespace-nowrap"
            style={{ color: "var(--text-primary)" }}
          >
            ← All canvases
          </button>
          <UndoRedoButtons history={history} />
          <input
            className="bg-transparent text-sm font-medium outline-none px-2 py-1 rounded min-w-0 max-w-[40vw] md:max-w-xs"
            style={{ color: "var(--text-primary)", width: `${Math.max(10, (current?.name || "").length + 2)}ch` }}
            value={current?.name || ""}
            onChange={(e) => updateCurrent((d) => ({ ...d, name: e.target.value }))}
            aria-label="Canvas name"
            title={current?.name}
          />
          {current && (
            <div className="ml-2 hidden md:block">
              <LinkedAssets
                projectId={projectId}
                type="diagram"
                id={diagrams.some((d) => d.id === current.id) ? current.id : null}
                layout="row"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 max-md:flex-wrap">
          <ToolPicker tool={mode} onChange={changeTool} />

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          <AddCardMenu onPick={addFromMenu} />

          {selectedEdgeId && (
            <button
              onClick={toggleEdgeType}
              className="px-2 py-1 rounded text-xs"
              style={{ color: "var(--text-secondary)", background: "var(--bg-card)", border: "1px solid var(--border)" }}
              title="Change line style (arrow, dashed, plain)"
              aria-label="Change line style"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          <button onClick={() => zoomBy(1.2)} className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }} title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => zoomBy(1 / 1.2)} className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }} title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={fitToCards} className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }} title="Fit all cards in view" aria-label="Fit all cards in view">
            <Maximize className="w-4 h-4" />
          </button>

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          <SaveIndicator state={autosave.state} className="px-1" />
          <HelpButton topic="diagrams" />
          <ExportMenu
            items={[
              { label: "PNG image", description: "The whole board as a picture", onClick: () => void exportPng() },
              { label: "SVG image", description: "Sharp vector picture for docs and design tools", onClick: exportSvg },
              { label: "JSON", description: "Cards and lines, to re-import or use in code", onClick: exportJson },
            ]}
          />
        </div>
      </div>

      {/* Board */}
      <div
        ref={viewportRef}
        className="flex-1 relative overflow-hidden select-none outline-none"
        style={{
          cursor: mode === "connect" || mode === "draw" ? "crosshair" : isInteracting ? "grabbing" : "default",
          touchAction: "none",
          background: "var(--bg-primary)",
          backgroundImage: "linear-gradient(#1a1a28 1px, transparent 1px), linear-gradient(90deg, #1a1a28 1px, transparent 1px)",
          backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={openNodeMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          {groups.map(renderCard)}
          {current && (
            <EdgeLayer
              nodes={current.nodes}
              edges={current.edges}
              rectOf={rectOf}
              selectedEdgeId={selectedEdgeId}
              editingEdgeId={editingEdgeId}
              draft={connectDraft}
              onLabelCommit={(edgeId, label) => {
                updateCurrent((d) => ({ ...d, edges: d.edges.map((edge) => (edge.id === edgeId ? { ...edge, label } : edge)) }));
                setEditingEdgeId(null);
              }}
              onLabelCancel={() => setEditingEdgeId(null)}
            />
          )}
          {cards.map(renderCard)}
          {penDraft && (
            <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1" aria-hidden>
              <path d={smoothPath(penDraft)} fill="none" stroke={SHAPE_COLORS.drawing} strokeWidth={DRAWING_STROKE} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {selectionBox && (
            <div
              className="absolute pointer-events-none rounded-sm"
              style={{
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.width,
                height: selectionBox.height,
                border: `${1 / zoom}px solid var(--accent)`,
                background: "color-mix(in srgb, var(--accent) 10%, transparent)",
              }}
            />
          )}
        </div>

        {selectedNode && !editingNodeId && (
          <SelectionPanel
            node={selectedNode}
            projectId={projectId}
            {...arrangeHandlers}
            onColor={(color) => updateNode(selectedNode.id, { color })}
            onLinkAsset={(value) => setNodeAsset(selectedNode.id, value)}
            onStack={() => stackGroup(selectedNode.id)}
            onEdit={() => startEditing(selectedNode.id)}
            onReplaceImage={() => pickImage(selectedNode.id)}
            onChangeAsset={() => setAssetPicker({ replaceId: selectedNode.id })}
            onDelete={deleteSelection}
          />
        )}
        {selectedNodes.length > 1 && !editingNodeId && (
          <MultiSelectionPanel nodes={selectedNodes} {...arrangeHandlers} onColor={recolorSelection} onDelete={deleteSelection} />
        )}

        {/* Empty board hint */}
        {current && current.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
            <p className="text-sm text-center max-w-sm" style={{ color: "var(--text-secondary)" }}>
              Empty board. Use <b style={{ color: "var(--text-primary)" }}>Add</b> for notes, to-dos, images, links, asset cards
              or shapes, sketch with the pen, or paste and drop pictures and links straight onto the board. Double-click a card to edit it.
            </p>
          </div>
        )}

        {/* Mode hint */}
        {(mode === "draw" || (mode === "area" && !selectedIds.length)) && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs text-center pointer-events-none max-md:w-[90%]"
            style={{ background: "var(--bg-card)", color: "var(--accent)", border: "1px solid var(--accent)" }}
          >
            {mode === "draw" ? "Draw: drag to sketch" : "Box select: drag around cards, tap cards to add or remove"} · Esc to stop
          </div>
        )}
        {mode === "connect" && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs text-center max-md:w-[90%]"
            style={{ background: "var(--bg-card)", color: "var(--accent)", border: "1px solid var(--accent)" }}
          >
            {connectFrom ? "Now click the second card" : "Connect: click the first card, then the second"} · Esc to cancel
          </div>
        )}

        <div
          className="absolute right-3 bottom-3 px-2 py-1 rounded text-[11px] font-mono pointer-events-none max-md:hidden"
          style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
        >
          {Math.round(zoom * 100)}%
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFilesChosen(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {assetPicker && current && (
        <AssetPickerModal
          projectId={projectId}
          title={assetPicker.replaceId ? "Change the asset on this card" : "Add a studio asset to the board"}
          exclude={[{ type: "diagram", id: current.id }]}
          onPick={pickAsset}
          onClose={() => setAssetPicker(null)}
        />
      )}
    </div>
  );
}
