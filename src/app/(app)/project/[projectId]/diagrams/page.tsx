"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useHistory, isTextField } from "@/hooks/useHistory";
import { useAutosave } from "@/hooks/useAutosave";
import { useBoardView, clampZoom } from "@/hooks/useBoardView";
import { useBoardClipboard } from "@/hooks/useBoardClipboard";
import { useToast } from "@/components/Toast";
import { useParams, useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import type { AssetRef, AssetRelation, Cardinality, Diagram, DiagramEdge, DiagramNode } from "@/types";
import { useConsumedParam, useOpenParam, useStorageVersion, useTrackOpenAsset } from "@/hooks/useStorage";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetPickerModal } from "@/components/AssetPickerModal";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import { createLongPress } from "@/lib/long-press";
import type { Point as MenuPoint } from "@/lib/menu-position";
import { ASSET_KINDS, assetHref, getAsset } from "@/lib/assets";
import { linkCardSize, linkPreview, linkUrl, nodeAsset, type NodeType } from "@/lib/diagrams/cards";
import {
  addLink as addAssetLink,
  countElementLinks,
  getElementLinks,
  linksTouchingElements,
  refLabel,
  relatedKey,
  relatedLabel,
  relatedRef,
  removeElementLinks,
  removeLink,
  restoreLinks,
} from "@/lib/links";
import { migrateElementAssetLinks } from "@/lib/diagrams/element-links";
import { elementName } from "@/lib/diagrams/elements";
import { boardMenuEntries, edgeMenuEntries, elementMenuEntries, type MenuLink } from "@/lib/diagrams/canvas-menu";
import { GROUP_HEADER } from "@/lib/diagrams/geometry";
import { newLine, nextCardinality, pruneRowLinks, tableColumns, type LineEnd } from "@/lib/diagrams/tables";
import { getShape } from "@/lib/canvas-shapes";
import { createNode, insertNode } from "@/lib/canvas-shapes/create";
import { SHAPE_DRAG_TYPE } from "@/lib/canvas-shapes/library";
import type { CanvasTemplate } from "@/lib/canvas-shapes/templates";
import { imageUrlFor, normalizeUrl } from "@/lib/diagrams/embeds";
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
import { exportJson, exportPng, exportSvg } from "@/lib/diagrams/export-files";
import { imageFilesFrom, readImageFile } from "@/lib/diagrams/image-file";
import type { AssetLook, RenderInput } from "@/lib/diagrams/render-png";
import { DiagramCard } from "@/components/diagrams/DiagramCard";
import { EdgeLayer } from "@/components/diagrams/EdgeLayer";
import { MultiSelectionPanel, SelectionPanel } from "@/components/diagrams/SelectionPanel";
import { CanvasList } from "@/components/diagrams/CanvasList";
import { CanvasToolbar } from "@/components/diagrams/CanvasToolbar";
import { BoardHints } from "@/components/diagrams/BoardHints";
import { ShapeLibrary, ShapeLibraryToggle, isPhoneLayout, useShapeLibraryOpen } from "@/components/diagrams/ShapeLibrary";
import { QuickAdd } from "@/components/diagrams/QuickAdd";
import { SelectionContextBar } from "@/components/diagrams/SelectionContextBar";
import type { BoardTool } from "@/components/diagrams/ToolPicker";

type Interaction =
  // `releaseTo`: the selection to switch to when the card is let go without moving (a tap, not a drag).
  | { kind: "drag"; start: Point; origins: Map<string, Point>; hasMoved: boolean; releaseTo: string[] | null }
  | { kind: "box"; start: Point; base: string[] }
  | { kind: "draw"; points: Point[] }
  | { kind: "pan"; start: Point; pan: Point }
  | { kind: "resize"; nodeId: string; start: Point; width: number; height: number }
  | { kind: "connect"; fromId: string; fromRow?: string }
  | { kind: "pinch"; distance: number; zoom: number; anchor: Point };

const DOUBLE_TAP_MS = 320;
const DRAG_THRESHOLD_PX = 3;
const GRID = 30;
const PASTE_OFFSET = 24;
/** Screen pixels the pen must travel before another point is recorded. */
const PEN_STEP_PX = 2;
/** Room left around an element the canvas zooms to from a link. */
const FOCUS_MARGIN = 120;
/** Space a new group leaves around the cards it wraps. */
const GROUP_PADDING = 24;

/** What a right-click or long-press landed on. */
type MenuTarget = { kind: "node"; id: string } | { kind: "edge"; id: string } | { kind: "board" };

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/** The element or line under a pointer; null on a control inside a card, a handle or a text field, which keep their own behaviour. */
function menuTargetAt(target: EventTarget | null): MenuTarget | null {
  if (isTextField(target) || closestData(target, "data-card-control") !== null) return null;
  if (closestData(target, "data-resize-handle") !== null || closestData(target, "data-connect-handle") !== null) return null;
  const nodeId = closestData(target, "data-node-id");
  if (nodeId) return { kind: "node", id: nodeId };
  const edgeId = closestData(target, "data-edge-id");
  return edgeId ? { kind: "edge", id: edgeId } : { kind: "board" };
}

function padRect(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2 };
}

/** A card's height on the board: tables follow their rows, notes and media their measured content. */
function rectHeight(node: DiagramNode, measured: Record<string, number>): number {
  const shape = getShape(node.type);
  if (shape.contentHeight) return shape.contentHeight(node);
  return shape.isAutoHeight ? measured[node.id] ?? node.height : node.height;
}

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

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [current, setCurrent] = useState<Diagram | null>(null);
  const [showList, setShowList] = useState(true);

  const [mode, setMode] = useState<BoardTool>("select");
  const { pan, zoom, view, setPan, setZoom, toBoard, viewportCenter, zoomBy, fitTo, reset: resetView } = useBoardView(viewportRef);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectDraft, setConnectDraft] = useState<{ fromId: string; fromRow?: string; to: Point } | null>(null);
  /** The table row the Connect tool's first click landed on, if any. */
  const connectFromRow = useRef<string | undefined>(undefined);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [loadingPreviews, setLoadingPreviews] = useState<ReadonlySet<string>>(new Set());
  const [assetPicker, setAssetPicker] = useState<{ replaceId: string | null; at?: Point } | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useShapeLibraryOpen();
  /** Where a "/" quick-add will place its shape, while the search is open. */
  const [quickAddAt, setQuickAddAt] = useState<Point | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectionBox, setSelectionBox] = useState<Rect | null>(null);
  const [penDraft, setPenDraft] = useState<Point[] | null>(null);
  const selectedNodeId = selectedIds.length === 1 ? selectedIds[0] : null;

  const interaction = useRef<Interaction | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const lastTap = useRef({ key: "", time: 0 });
  const imageTarget = useRef<{ replaceId: string | null; at: Point | null }>({ replaceId: null, at: null });
  const pasteCount = useRef(0);
  /** The pointer's last screen position over the board, for placing quick-add shapes under it. */
  const hoverPoint = useRef<Point | null>(null);

  const router = useRouter();
  const version = useStorageVersion();
  const { openAssetMenu, openMenu } = useAssetMenu();
  const pressedTarget = useRef<MenuTarget | null>(null);
  const hasPressFired = useRef(false);
  /** The cards last copied or cut on this board, so the menus know there is something to paste. */
  const copiedCards = useRef<string | null>(null);
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null);
  /** An element a link asked to show (`?element=`), waiting for its canvas to open. */
  const [pendingFocus, setPendingFocus] = useState<{ diagramId: string | null; elementId: string } | null>(null);
  const fireLongPress = useRef<(point: MenuPoint) => void>(() => {});
  const [longPress] = useState(() => createLongPress((point) => fireLongPress.current(point)));
  useEffect(() => {
    fireLongPress.current = (point) => {
      const pressed = pressedTarget.current;
      if (!pressed) return;
      hasPressFired.current = true;
      lastTap.current = { key: "", time: 0 };
      const drag = interaction.current;
      if (drag?.kind === "drag") restorePositions(drag.origins);
      interaction.current = null;
      setIsInteracting(false);
      openMenuFor(pressed, point);
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

  useEffect(() => {
    migrateElementAssetLinks(projectId);
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
  useConsumedParam("element", (elementId) => setPendingFocus({ diagramId: new URLSearchParams(window.location.search).get("open"), elementId }));

  // Once the linked element's canvas is on screen, select the element and bring it into view.
  useEffect(() => {
    if (!pendingFocus || !current || showList || (pendingFocus.diagramId && pendingFocus.diagramId !== current.id)) return;
    const node = current.nodes.find((n) => n.id === pendingFocus.elementId);
    const frame = requestAnimationFrame(() => {
      setPendingFocus(null);
      if (!node) return showToast({ message: "That element is no longer on this canvas" });
      selectNodes([node.id]);
      fitTo(padRect(rectOf(node), FOCUS_MARGIN));
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the request or the open canvas changes
  }, [pendingFocus, current?.id, showList]);

  // Taking an element off the board (delete, cut, undo) removes its links; bringing it back (undo, redo) restores them.
  const elementLinks = useRef<{ diagramId: string; nodeIds: Set<string>; links: Map<string, AssetRelation[]> } | null>(null);
  useEffect(() => {
    if (!current) return;
    const ids = current.nodes.map((n) => n.id);
    const previous = elementLinks.current?.diagramId === current.id ? elementLinks.current : null;
    if (previous) {
      const present = new Set(ids);
      const gone = [...previous.nodeIds].filter((id) => !present.has(id));
      if (gone.length) removeElementLinks(projectId, current.id, gone);
      const revived = ids.filter((id) => !previous.nodeIds.has(id)).flatMap((id) => previous.links.get(id) ?? []);
      if (revived.length) restoreLinks(projectId, revived, current);
    }
    const links = new Map(previous?.links ?? []);
    const touching = linksTouchingElements(projectId, current.id, ids);
    for (const id of ids) links.set(id, touching.get(id) ?? []);
    elementLinks.current = { diagramId: current.id, nodeIds: new Set(ids), links };
  }, [projectId, current, version]);

  const linkCounts = useMemo(
    () => (current ? countElementLinks(projectId, current) : new Map<string, number>()),
    // version: links live in storage, so recount when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, current?.id, current?.nodes, version]
  );

  // --- Geometry ---
  const rectOf = useCallback(
    (node: DiagramNode): Rect => ({
      x: node.x,
      y: node.y,
      width: node.width,
      height: rectHeight(node, measured),
    }),
    [measured]
  );

  const onMeasure = useCallback((id: string, height: number) => {
    setMeasured((m) => (m[id] === height ? m : { ...m, [id]: height }));
  }, []);

  function fitToCards() {
    fitTo(current ? boundsOf(current.nodes.map(rectOf)) : null);
  }

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
      if (Array.isArray(patch.data?.columns)) {
        const columns = tableColumns({ ...(patch as DiagramNode), data: patch.data });
        setCurrent((prev) => (prev ? { ...prev, edges: pruneRowLinks(prev.edges, id, columns) } : prev));
      }
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
    const cascade = at ? 0 : ((current?.nodes.length ?? 0) % 6) * 20;
    const node = createNode(type, at ?? viewportCenter(), { id: uuid(), cascade, extra });
    updateCurrent((d) => ({ ...d, nodes: insertNode(d.nodes, node) }));
    selectNodes([node.id]);
    return node;
  }

  /** Adds a card from the Add menu, the library or quick-add: at `at`, or in the middle of the view. */
  function addShape(type: NodeType, at?: Point) {
    const { placement } = getShape(type);
    if (placement === "pick-image") return pickImage(null, at);
    if (placement === "pick-asset") return setAssetPicker({ replaceId: null, at });
    const node = addNode(type, at);
    if (placement === "edit") setEditingNodeId(node.id);
  }

  function addFromLibrary(type: NodeType) {
    if (isPhoneLayout()) setIsLibraryOpen(false);
    addShape(type);
  }

  function openQuickAdd() {
    const pointer = hoverPoint.current;
    setQuickAddAt(pointer ? toBoard(pointer.x, pointer.y) : viewportCenter());
  }

  function closeQuickAdd() {
    setQuickAddAt(null);
    rootRef.current?.focus({ preventScroll: true });
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
    const node = addNode("link", at, { width: linkCardSize(url).width, data: { url } });
    void fetchPreview(node.id, url);
  }

  /** Pasted or dropped text: a link becomes a link (or image) card, anything else a note. */
  function addFromText(text: string, at: Point) {
    const url = normalizeUrl(text);
    if (url && /^(https?:\/\/|www\.)/i.test(text.trim())) {
      const image = imageUrlFor(url);
      if (image) addImageFromUrl(image, at);
      else addLink(url, at);
      return;
    }
    addNode("note", at, { label: text.trim().slice(0, 5000) });
  }

  function pickAsset(ref: AssetRef) {
    const name = getAsset(projectId, ref.type, ref.id)?.name ?? ASSET_KINDS[ref.type].label;
    const replaceId = assetPicker?.replaceId;
    const at = assetPicker?.at;
    setAssetPicker(null);
    if (replaceId) updateNode(replaceId, { label: name, data: { asset: ref } });
    else addNode("asset", at, { label: name, data: { asset: ref } });
  }

  function selectNodes(ids: string[]) {
    setSelectedIds(ids);
    setSelectedEdgeId(null);
  }

  function deleteNodes(nodeIds: string[], edgeId: string | null = null) {
    if (!nodeIds.length && !edgeId) return;
    const ids = new Set(nodeIds);
    updateCurrent((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => !ids.has(n.id)),
      edges: d.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to) && edge.id !== edgeId),
    }));
    selectNodes([]);
  }

  function deleteSelection() {
    deleteNodes(selectedIds, selectedEdgeId);
  }

  function recolorNodes(nodeIds: string[], color: string | undefined) {
    const ids = new Set(nodeIds);
    updateCurrent((d) => ({ ...d, nodes: d.nodes.map((n) => (ids.has(n.id) ? { ...n, color } : n)) }));
  }

  function recolorSelection(color: string | undefined) {
    recolorNodes(selectedIds, color);
  }

  function pasteCards(cards: CopiedCards, offset: number) {
    const pasted = cloneCards(cards, { x: offset, y: offset }, uuid);
    updateCurrent((d) => ({ ...d, nodes: [...d.nodes, ...pasted.nodes], edges: [...d.edges, ...pasted.edges] }));
    selectNodes(pasted.nodes.map((n) => n.id));
  }

  function duplicateNodes(nodeIds: string[]) {
    if (current && nodeIds.length) pasteCards(copyCards(current, nodeIds), PASTE_OFFSET);
  }

  function duplicateSelection() {
    duplicateNodes(selectedIds);
  }

  function arrangeNodes(nodeIds: string[], direction: "front" | "back") {
    const reorder = direction === "front" ? bringToFront : sendToBack;
    updateCurrent((d) => ({ ...d, nodes: reorder(d.nodes, nodeIds) }));
  }

  function arrangeSelection(direction: "front" | "back") {
    arrangeNodes(selectedIds, direction);
  }

  function rectsOf(nodeIds: string[]) {
    return (current?.nodes ?? []).filter((n) => nodeIds.includes(n.id)).map((n) => ({ id: n.id, ...rectOf(n) }));
  }

  /** Copy from a menu: the same marked JSON the keyboard copy writes, so it pastes into any board. */
  async function copyNodes(nodeIds: string[]): Promise<boolean> {
    if (!current || !nodeIds.length) return false;
    const text = serializeCards(copyCards(current, nodeIds));
    copiedCards.current = text;
    pasteCount.current = 0;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked: the board still pastes its own last copy.
    }
    return true;
  }

  async function cutNodes(nodeIds: string[]) {
    if (await copyNodes(nodeIds)) deleteNodes(nodeIds);
  }

  async function readClipboardText(): Promise<string> {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }

  /** Paste from a menu: cards copied on any board, otherwise text, a link or an image address. */
  async function pasteFromMenu() {
    const text = (await readClipboardText()) || copiedCards.current || "";
    const cards = parseCards(text);
    if (cards) {
      pasteCount.current += 1;
      return pasteCards(cards, PASTE_OFFSET * pasteCount.current);
    }
    if (text.trim()) addFromText(text, viewportCenter());
  }

  /** Wraps cards in a new group sized to hold them, under its header. */
  function groupNodes(nodeIds: string[]) {
    const bounds = boundsOf(rectsOf(nodeIds));
    if (!bounds) return;
    const group: DiagramNode = {
      ...createNode("group", viewportCenter(), { id: uuid() }),
      x: Math.round(bounds.x - GROUP_PADDING),
      y: Math.round(bounds.y - GROUP_PADDING - GROUP_HEADER),
      width: Math.round(bounds.width + GROUP_PADDING * 2),
      height: Math.round(bounds.height + GROUP_PADDING * 2 + GROUP_HEADER),
    };
    updateCurrent((d) => ({ ...d, nodes: insertNode(d.nodes, group) }));
    selectNodes([group.id]);
  }

  /** Takes the groups out of the selection and leaves the cards that were inside them where they are. */
  function ungroupNodes(nodeIds: string[]) {
    const groups = (current?.nodes ?? []).filter((n) => nodeIds.includes(n.id) && getShape(n.type).isContainer);
    const members = groups.flatMap((group) => membersOf(group, current?.nodes ?? []));
    deleteNodes(groups.map((g) => g.id));
    selectNodes(members);
  }

  /** Moves nodes to new positions; a moved group takes the cards inside it along. */
  function moveNodesTo(positions: Map<string, Point>) {
    const nodes = current?.nodes ?? [];
    const moves = new Map(positions);
    for (const [id, to] of positions) {
      const group = nodes.find((n) => n.id === id && getShape(n.type).isContainer);
      if (!group) continue;
      for (const memberId of membersOf(group, nodes).filter((m) => !positions.has(m))) {
        const member = nodes.find((n) => n.id === memberId)!;
        moves.set(memberId, { x: member.x + to.x - group.x, y: member.y + to.y - group.y });
      }
    }
    updateCurrent((d) => ({ ...d, nodes: d.nodes.map((n) => (moves.has(n.id) ? { ...n, ...moves.get(n.id)! } : n)) }));
  }

  function alignSelection(edge: Alignment, nodeIds = selectedIds) {
    moveNodesTo(alignRects(rectsOf(nodeIds), edge));
  }

  function distributeSelection(axis: Axis, nodeIds = selectedIds) {
    moveNodesTo(distributeRects(rectsOf(nodeIds), axis));
  }

  function changeTool(tool: BoardTool) {
    setMode(tool);
    setConnectFrom(null);
    setConnectDraft(null);
    if (tool === "draw" || tool === "connect") selectNodes([]);
  }

  function addEdge(from: LineEnd, to: LineEnd) {
    const edge = newLine(uuid(), from, to);
    if (edge) updateCurrent((d) => ({ ...d, edges: [...d.edges, edge] }));
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
      const row = closestData(e.target, "data-row-id") ?? undefined;
      const isSameEnd = connectFrom === nodeId && connectFromRow.current === row;
      if (connectFrom && !isSameEnd) {
        addEdge({ id: connectFrom, row: connectFromRow.current }, { id: nodeId, row });
        setConnectFrom(null);
        setConnectDraft(null);
      } else {
        setConnectFrom(nodeId);
        connectFromRow.current = row;
      }
      return;
    }
    const isAdditive = e.shiftKey || mode === "area";
    // Start editing after the browser's own pointer-down focus change, or it would blur the new editor at once.
    const canEdit = !isAdditive && getShape(node.type).body !== "drawing";
    if (canEdit && isDoubleTap(nodeId)) return void setTimeout(() => startEditing(nodeId));
    const selection = selectedIds.includes(nodeId) ? selectedIds : isAdditive ? [...selectedIds, nodeId] : [nodeId];
    selectNodes(selection);
    const ids = withGroupMembers(selection, current.nodes);
    const origins = new Map(current.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    interaction.current = { kind: "drag", start: point, origins, hasMoved: false, releaseTo: selectionOnTap(nodeId, isAdditive) };
  }

  /** A tap on an already selected card: Shift (or the box tool) takes it out, otherwise it becomes the only one. */
  function selectionOnTap(nodeId: string, isAdditive: boolean): string[] | null {
    if (!selectedIds.includes(nodeId)) return null;
    if (isAdditive) return toggleId(selectedIds, nodeId);
    return selectedIds.length > 1 ? [nodeId] : null;
  }

  function withGroupMembers(ids: string[], nodes: DiagramNode[]): string[] {
    const members = nodes.filter((n) => getShape(n.type).isContainer && ids.includes(n.id)).flatMap((group) => membersOf(group, nodes));
    return [...new Set([...ids, ...members])];
  }

  function pressEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedIds([]);
    if (isDoubleTap(`edge:${edgeId}`)) setTimeout(() => setEditingEdgeId(edgeId));
  }

  function startHandleDrag(handle: "resize" | "connect", nodeId: string, point: Point, fromRow?: string) {
    const node = current?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (handle === "connect") {
      interaction.current = { kind: "connect", fromId: nodeId, fromRow };
      setConnectDraft({ fromId: nodeId, fromRow, to: point });
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
    pressedTarget.current = mode === "draw" || mode === "connect" ? null : menuTargetAt(e.target);
    if (pressedTarget.current) longPress.down({ x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    if (editingNodeId || editingEdgeId) (document.activeElement as HTMLElement | null)?.blur();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const point = toBoard(e.clientX, e.clientY);
    if (mode === "draw") return startPen(point);
    const nodeId = closestData(e.target, "data-node-id");
    if (nodeId && closestData(e.target, "data-resize-handle") !== null) return startHandleDrag("resize", nodeId, point);
    if (nodeId && closestData(e.target, "data-connect-handle") !== null) return startHandleDrag("connect", nodeId, point, closestData(e.target, "data-row-id") ?? undefined);
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
    const shape = getShape(node.type);
    const width = Math.max(shape.minSize.width, Math.round(resize.width + point.x - resize.start.x));
    const height = shape.isAutoHeight || shape.contentHeight ? node.height : Math.max(shape.minSize.height, Math.round(resize.height + point.y - resize.start.y));
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
    hoverPoint.current = { x: e.clientX, y: e.clientY };
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    longPress.move({ x: e.clientX, y: e.clientY });
    const point = toBoard(e.clientX, e.clientY);
    const active = interaction.current;
    if (!active) {
      if (mode === "connect" && connectFrom) setConnectDraft({ fromId: connectFrom, fromRow: connectFromRow.current, to: point });
      return;
    }
    if (active.kind === "drag") moveDrag(active, point);
    else if (active.kind === "resize") moveResize(active, point);
    else if (active.kind === "connect") setConnectDraft({ fromId: active.fromId, fromRow: active.fromRow, to: point });
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
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const targetId = closestData(target, "data-node-id");
      if (targetId) addEdge({ id: active.fromId, row: active.fromRow }, { id: targetId, row: closestData(target, "data-row-id") ?? undefined });
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

  // --- Menus and element links ---
  function elementRef(nodeId: string): AssetRef {
    return { type: "diagram", id: current?.id ?? "", elementId: nodeId };
  }

  function menuLinks(nodeId: string): MenuLink[] {
    if (!current) return [];
    return getElementLinks(projectId, current.id, nodeId).map((related) => ({
      key: relatedKey(related),
      label: `${relatedLabel(related)} · ${ASSET_KINDS[related.type].label}`,
      open: () => router.push(assetHref(projectId, related.type, related.id, related.elementId)),
      remove: () => removeLink(projectId, elementRef(nodeId), relatedRef(related)),
    }));
  }

  /** What "Open" does for a card that stands for something else: the asset it shows, or the web page it links to. */
  function openTarget(node: DiagramNode): { label: string; open(): void } | null {
    const asset = getShape(node.type).body === "asset" ? nodeAsset(node) : undefined;
    if (asset && getAsset(projectId, asset.type, asset.id)) {
      return { label: `Open ${ASSET_KINDS[asset.type].label.toLowerCase()}`, open: () => router.push(assetHref(projectId, asset.type, asset.id)) };
    }
    const url = node.type === "link" ? linkUrl(node) : undefined;
    return url ? { label: "Open link", open: () => void window.open(url, "_blank", "noopener") } : null;
  }

  function elementMenu(nodeId: string, anchor: MenuPoint): ContextMenuEntry[] {
    const ids = selectedIds.includes(nodeId) ? selectedIds : [nodeId];
    const nodes = (current?.nodes ?? []).filter((n) => ids.includes(n.id));
    const node = nodes.find((n) => n.id === nodeId)!;
    const target = openTarget(node);
    const asset = getShape(node.type).body === "asset" ? nodeAsset(node) : undefined;
    const assetName = asset ? getAsset(projectId, asset.type, asset.id)?.name ?? null : null;
    const isGroup = (n: DiagramNode) => getShape(n.type).isContainer;
    const sharedColor = nodes.every((n) => n.color === node.color) ? node.color : null;
    const state = {
      count: nodes.length,
      links: ids.length === 1 ? menuLinks(nodeId) : [],
      openLabel: target?.label ?? null,
      assetName,
      canEditText: getShape(node.type).canEditText,
      color: sharedColor ?? undefined,
      hasGroups: nodes.some(isGroup),
      canGroup: !nodes.some(isGroup),
      canPaste: copiedCards.current !== null,
      isMac: isMacPlatform(),
    };
    return elementMenuEntries(state, {
      linkTo: () => setLinkPickerFor(nodeId),
      open: () => target?.open(),
      openAssetMenu: () => asset && openAssetMenu(anchor, { type: asset.type, id: asset.id }, rootRef.current),
      editText: () => setTimeout(() => startEditing(nodeId)),
      color: (value) => recolorNodes(ids, value),
      duplicate: () => duplicateNodes(ids),
      copy: () => void copyNodes(ids),
      cut: () => void cutNodes(ids),
      paste: () => void pasteFromMenu(),
      bringToFront: () => arrangeNodes(ids, "front"),
      sendToBack: () => arrangeNodes(ids, "back"),
      align: (edge) => alignSelection(edge, ids),
      distribute: (axis) => distributeSelection(axis, ids),
      group: () => groupNodes(ids),
      ungroup: () => ungroupNodes(ids),
      remove: () => deleteNodes(ids),
    });
  }

  function updateEdge(edgeId: string, patch: Partial<DiagramEdge>) {
    updateCurrent((d) => ({ ...d, edges: d.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge)) }));
  }

  function edgeMenu(edge: DiagramEdge): ContextMenuEntry[] {
    return edgeMenuEntries(edge, {
      editLabel: () => setTimeout(() => setEditingEdgeId(edge.id)),
      lineStyle: (type) => updateEdge(edge.id, { type }),
      cardinality: (cardinality: Cardinality) => updateEdge(edge.id, { cardinality }),
      remove: () => deleteNodes([], edge.id),
    });
  }

  function boardMenu(anchor: MenuPoint): ContextMenuEntry[] {
    const at = toBoard(anchor.x, anchor.y);
    return boardMenuEntries(
      { canPaste: copiedCards.current !== null, hasElements: Boolean(current?.nodes.length), isMac: isMacPlatform() },
      {
        paste: () => void pasteFromMenu(),
        addShape: () => setQuickAddAt(at),
        selectAll: () => selectNodes(current?.nodes.map((n) => n.id) ?? []),
      }
    );
  }

  /** Opens the menu of whatever was right-clicked or long-pressed; an element outside the selection becomes the selection. */
  function openMenuFor(target: MenuTarget, anchor: MenuPoint) {
    if (!current) return;
    if (target.kind === "node" && current.nodes.some((n) => n.id === target.id)) {
      if (!selectedIds.includes(target.id)) selectNodes([target.id]);
      const node = current.nodes.find((n) => n.id === target.id)!;
      return openMenu(anchor, elementMenu(target.id, anchor), elementName(node), rootRef.current);
    }
    const edge = target.kind === "edge" ? current.edges.find((e) => e.id === target.id) : undefined;
    if (edge) {
      setSelectedEdgeId(edge.id);
      setSelectedIds([]);
      return openMenu(anchor, edgeMenu(edge), "Line", rootRef.current);
    }
    openMenu(anchor, boardMenu(anchor), "Canvas", rootRef.current);
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    const target = menuTargetAt(e.target);
    if (!target) return;
    e.preventDefault();
    // A touch long-press already opened the menu; the browser's own contextmenu event follows it.
    if (!hasPressFired.current) openMenuFor(target, { x: e.clientX, y: e.clientY });
  }

  /** Menu key or Shift+F10: the menu of the selection, the selected line, or the board, at the middle of it. */
  function openMenuFromKeyboard() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !current) return;
    const toScreen = (p: Point): MenuPoint => ({ x: rect.left + pan.x + p.x * zoom, y: rect.top + pan.y + p.y * zoom });
    const bounds = selectedIds.length ? boundsOf(rectsOf(selectedIds)) : null;
    const middle = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (bounds) return openMenuFor({ kind: "node", id: selectedIds[0] }, toScreen({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }));
    openMenuFor(selectedEdgeId ? { kind: "edge", id: selectedEdgeId } : { kind: "board" }, middle);
  }

  /** The badge on a linked element: its links, each one click away, and a way to add another. */
  function openLinksBadge(nodeId: string, badge: HTMLElement) {
    const node = current?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const box = badge.getBoundingClientRect();
    const entries: ContextMenuEntry[] = [
      ...menuLinks(nodeId).map((link): ContextMenuEntry => ({ kind: "item", key: link.key, label: link.label, onSelect: link.open })),
      { kind: "separator", key: "separator" },
      { kind: "item", key: "link-to", label: "Link to…", onSelect: () => setLinkPickerFor(nodeId) },
    ];
    openMenu({ x: box.left, y: box.bottom + 4 }, entries, `Links of ${elementName(node)}`, badge);
  }

  function linkElementTo(nodeId: string, ref: AssetRef) {
    setLinkPickerFor(null);
    addAssetLink(projectId, elementRef(nodeId), ref);
    showToast({ message: `Linked to ${refLabel(projectId, ref) ?? ASSET_KINDS[ref.type].label}` });
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
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      return openMenuFromKeyboard();
    }
    if (handleShortcut(e)) return;
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      return openQuickAdd();
    }
    if (e.key === "Delete" || e.key === "Backspace") deleteSelection();
    if (e.key === "Escape") {
      changeTool("select");
      selectNodes([]);
    }
  }

  useBoardClipboard(!showList, {
    copySelection: () => {
      if (!current || !selectedIds.length) return null;
      pasteCount.current = 0;
      copiedCards.current = serializeCards(copyCards(current, selectedIds));
      return copiedCards.current;
    },
    deleteSelection,
    pasteCards: (cards) => {
      pasteCount.current += 1;
      pasteCards(cards, PASTE_OFFSET * pasteCount.current);
    },
    pasteImages: (files) => void addImages(files, viewportCenter()),
    pasteText: (text) => addFromText(text, viewportCenter()),
  });

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    // Always swallow the drop, so a dropped PDF or other file never navigates away from the board.
    e.preventDefault();
    const shapeType = e.dataTransfer.getData(SHAPE_DRAG_TYPE);
    if (shapeType) return addShape(getShape(shapeType).type, toBoard(e.clientX, e.clientY));
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
    resetView();
  }

  function newDiagram(template: CanvasTemplate) {
    const d: Diagram = {
      id: uuid(),
      projectId,
      name: template.id === "blank" ? "Untitled canvas" : template.name,
      ...template.build(uuid),
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.save("diagrams", d, projectId);
    setDiagrams(storage.getAll("diagrams", projectId));
    loadDiagram(d);
    // Once the board has mounted, frame the template's cards so they fit on small screens too.
    if (d.nodes.length) requestAnimationFrame(() => fitTo(boundsOf(d.nodes)));
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

  function toggleCardinality() {
    updateCurrent((d) => ({
      ...d,
      edges: d.edges.map((edge) => (edge.id === selectedEdgeId && edge.cardinality ? { ...edge, cardinality: nextCardinality(edge.cardinality) } : edge)),
    }));
  }

  function renderInput(diagram: Diagram): RenderInput {
    return { diagram, rectOf, describeAsset: (node) => describeAsset(projectId, node) };
  }

  // --- List view ---
  if (showList) {
    return <CanvasList projectId={projectId} diagrams={diagrams} onOpen={loadDiagram} onNew={newDiagram} onDelete={deleteDiagram} />;
  }

  const selectedNode = current?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodes = current?.nodes.filter((n) => selectedIds.includes(n.id)) ?? [];
  const linkPickerNode = linkPickerFor ? current?.nodes.find((n) => n.id === linkPickerFor) : undefined;
  const arrangeHandlers = {
    onDuplicate: duplicateSelection,
    onArrange: arrangeSelection,
    onAlign: alignSelection,
    onDistribute: distributeSelection,
  };
  const isBack = (node: DiagramNode) => getShape(node.type).layer === "back";
  const groups = current?.nodes.filter(isBack) ?? [];
  const showContextBar = selectedNodes.length > 0 && !editingNodeId && !isInteracting && !selectionBox && (mode === "select" || mode === "area");
  const contextBounds = showContextBar ? boundsOf(selectedNodes.map(rectOf)) : null;
  const cards = current?.nodes.filter((n) => !isBack(n)) ?? [];
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
      linkCount={linkCounts.get(node.id) ?? 0}
      onOpenLinks={openLinksBadge}
      onMeasure={onMeasure}
      onCommit={commitNode}
      onStopEditing={stopEditing}
      onPickImage={pickImageFor}
    />
  );

  // --- Editor view ---
  return (
    <div ref={rootRef} className="flex flex-col h-full" onKeyDown={handleKeyDown} tabIndex={0}>
      <CanvasToolbar
        projectId={projectId}
        diagram={current}
        isSaved={Boolean(current && diagrams.some((d) => d.id === current.id))}
        history={history}
        saveState={autosave.state}
        tool={mode}
        hasSelectedEdge={Boolean(selectedEdgeId)}
        selectedCardinality={current?.edges.find((edge) => edge.id === selectedEdgeId)?.cardinality}
        onToggleCardinality={toggleCardinality}
        onBack={() => { autosave.flush(); setShowList(true); }}
        onRename={(name) => updateCurrent((d) => ({ ...d, name }))}
        onTool={changeTool}
        onAdd={(type) => addShape(type)}
        onToggleEdgeType={toggleEdgeType}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onFit={fitToCards}
        onExportPng={() => current && void exportPng(renderInput(current))}
        onExportSvg={() => current && exportSvg(renderInput(current))}
        onExportJson={() => current && exportJson(current)}
      />

      <div className="flex-1 flex min-h-0">
        {isLibraryOpen && <ShapeLibrary onPick={addFromLibrary} onClose={() => setIsLibraryOpen(false)} />}
        {/* Board */}
        <div
          ref={viewportRef}
          className="flex-1 min-w-0 relative overflow-hidden select-none outline-none"
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
          onPointerLeave={() => { hoverPoint.current = null; }}
          onContextMenu={handleContextMenu}
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
                <path d={smoothPath(penDraft)} fill="none" stroke={getShape("drawing").color} strokeWidth={DRAWING_STROKE} strokeLinecap="round" strokeLinejoin="round" />
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
              diagramId={current!.id}
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

          <BoardHints
            isEmpty={Boolean(current && current.nodes.length === 0)}
            tool={mode}
            hasSelection={selectedIds.length > 0}
            isConnecting={Boolean(connectFrom)}
            zoom={zoom}
          />

          {contextBounds && (
            <SelectionContextBar
              bounds={contextBounds}
              pan={pan}
              zoom={zoom}
              canConnect={Boolean(selectedNodeId)}
              onDuplicate={duplicateSelection}
              onConnect={() => {
                changeTool("connect");
                setConnectFrom(selectedNodeId);
              }}
              onBringToFront={() => arrangeSelection("front")}
              onDelete={deleteSelection}
            />
          )}
          {quickAddAt && (
            <QuickAdd
              onPick={(type) => {
                const at = quickAddAt;
                closeQuickAdd();
                addShape(type, at);
              }}
              onClose={closeQuickAdd}
            />
          )}
          {!isLibraryOpen && <ShapeLibraryToggle onOpen={() => setIsLibraryOpen(true)} />}
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
      {linkPickerNode && current && (
        <AssetPickerModal
          projectId={projectId}
          title={`Link ${elementName(linkPickerNode)} to…`}
          exclude={getElementLinks(projectId, current.id, linkPickerNode.id).map(relatedRef)}
          hiddenIds={[current.id]}
          allowElements
          onPick={(ref) => linkElementTo(linkPickerNode.id, ref)}
          onClose={() => setLinkPickerFor(null)}
        />
      )}
    </div>
  );
}
