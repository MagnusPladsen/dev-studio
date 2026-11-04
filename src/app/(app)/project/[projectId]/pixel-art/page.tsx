"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Pencil,
  Eraser,
  PaintBucket,
  Minus,
  Square,
  Circle,
  Pipette,
  Move,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Play,
  Pause,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  ChevronUp,
  ChevronDown,
  FilePlus,
  Layers,
  Film,
  Maximize2,
  PanelTopOpen,
  Tag,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { useUndoShortcuts } from "@/hooks/useHistory";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { storage } from "@/lib/storage";
import { getLoadedImage, loadImage } from "@/lib/pixels";
import { scalePixels, type ScaleFactor, type ScaleMethod } from "@/lib/pixel-scale";
import { encodeGif } from "@/lib/gif";
import { downloadBlob } from "@/lib/download";
import { APP } from "@/lib/app-config";
import {
  ANIMATION_DIRECTIONS,
  TAG_TEXT_COLOR,
  unusedTagColor,
  asepriteSheetJson,
  clampDuration,
  durationForFps,
  frameDurations,
  frameTagsFor,
  playbackOrder,
  sheetLayout,
  tagLanes,
  tagsAfterDelete,
  tagsAfterInsert,
} from "@/lib/sprite-animation";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { useAutosave } from "@/hooks/useAutosave";
import { LinkedAssets } from "@/components/LinkedAssets";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu } from "@/components/ExportMenu";
import { ImportDropZone } from "@/components/ImportDropZone";
import { ImportMenu } from "@/components/ImportMenu";
import { PixelImportDialog } from "@/components/pixel-art/PixelImportDialog";
import { FrameDurationInput } from "@/components/pixel-art/FrameDurationInput";
import { TagEditor } from "@/components/pixel-art/TagEditor";
import { useImport, type ImportController } from "@/hooks/useImport";
import { findImporter, importAsNewAssets, type ImportResult, type ImportStep, type Importer } from "@/lib/import";
import { MAX_IMAGE_BYTES } from "@/lib/import/image/limits";
import { PIXEL_ART_IMPORTERS, pixelArtImporters, type PixelImportOptions } from "@/lib/import/pixel-art";
import { HelpButton } from "@/components/HelpButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { COPY_FAILED_MESSAGE, useAssetMenu } from "@/components/AssetContextMenu";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import { useToast } from "@/components/Toast";
import { copyToSystemClipboard } from "@/lib/clipboard";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import type { AnimationDirection, FrameTag, Sprite, SpriteFrame } from "@/types";

// ─── types ───────────────────────────────────────────────────────────
type Tool = "pencil" | "eraser" | "fill" | "line" | "rect" | "circle" | "picker" | "move";

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  pixels: string; // base64 of ImageData
}

interface FrameData {
  id: string;
  layers: Layer[];
  duration: number;
}

interface HistoryEntry {
  frames: FrameData[];
  tags: FrameTag[];
  activeFrame: number;
  activeLayer: number;
  w: number;
  h: number;
}

// ─── helpers ─────────────────────────────────────────────────────────
function imageDataToBase64(data: ImageData): string {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  c.getContext("2d")!.putImageData(data, 0, 0);
  return c.toDataURL();
}

async function base64ToImageData(b64: string, w: number, h: number): Promise<ImageData> {
  const img = await loadImage(b64);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

async function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], x = 0, y = 0) {
  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.drawImage(await loadImage(layer.pixels), x, y);
  }
}

function blankBase64(w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c.toDataURL();
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function floodFill(data: ImageData, sx: number, sy: number, fillR: number, fillG: number, fillB: number, fillA: number) {
  const { width, height, data: d } = data;
  const idx = (sy * width + sx) * 4;
  const tR = d[idx], tG = d[idx + 1], tB = d[idx + 2], tA = d[idx + 3];
  if (tR === fillR && tG === fillG && tB === fillB && tA === fillA) return;
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const i = (y * width + x) * 4;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (d[i] !== tR || d[i + 1] !== tG || d[i + 2] !== tB || d[i + 3] !== tA) continue;
    d[i] = fillR; d[i + 1] = fillG; d[i + 2] = fillB; d[i + 3] = fillA;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

function midpointCircle(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = r, y = 0, d = 1 - r;
  const add = (px: number, py: number) => pts.push([px, py]);
  while (x >= y) {
    add(cx + x, cy + y); add(cx - x, cy + y);
    add(cx + x, cy - y); add(cx - x, cy - y);
    add(cx + y, cy + x); add(cx - y, cy + x);
    add(cx + y, cy - x); add(cx - y, cy - x);
    y++;
    if (d <= 0) { d += 2 * y + 1; } else { x--; d += 2 * (y - x) + 1; }
  }
  return pts;
}

// ─── component ───────────────────────────────────────────────────────
const DEFAULT_PALETTE = [
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff",
  "#ffff00", "#ff00ff", "#00ffff", "#ff8800", "#8800ff",
  "#0088ff", "#88ff00", "#ff0088", "#ff4444", "#44ff44",
  "#4444ff", "#884422", "#228844", "#224488", "#888888",
  "#cccccc", "#444444", "#ffcc00", "#cc00ff", "#00ffcc",
  "#ff6644", "#44ff66", "#6644ff", "#aaaaaa", "#553311",
  "#335511", "#113355",
];

const SIZES = [8, 16, 24, 32, 48, 64, 96, 128].map((n) => ({ label: `${n}×${n}`, w: n, h: n }));
const MAX_SIZE = 256;

const TOOL_META: Record<Tool, { icon: typeof Pencil; label: string; key: string }> = {
  pencil: { icon: Pencil, label: "Pencil", key: "B" },
  eraser: { icon: Eraser, label: "Eraser", key: "E" },
  fill: { icon: PaintBucket, label: "Fill", key: "G" },
  line: { icon: Minus, label: "Line", key: "L" },
  rect: { icon: Square, label: "Rectangle", key: "R" },
  circle: { icon: Circle, label: "Circle", key: "O" },
  picker: { icon: Pipette, label: "Colour picker", key: "I" },
  move: { icon: Move, label: "Move", key: "M" },
};
const TOOL_BY_KEY = Object.fromEntries(
  (Object.keys(TOOL_META) as Tool[]).map((t) => [TOOL_META[t].key.toLowerCase(), t])
) as Record<string, Tool>;
const DEFAULT_NAME = "Untitled sprite";
// one frame thumbnail (w-14) plus the gap-1.5 between thumbnails, for placing tag bands over them
const FRAME_SLOT = 62;
const TAG_LANE = 18;
const DIRECTION_ICONS: Record<AnimationDirection, typeof ArrowRight> = { forward: ArrowRight, reverse: ArrowLeft, pingpong: ArrowLeftRight };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !["range", "checkbox", "radio", "color", "button"].includes(el.type);
}

export default function PixelArtPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, menuTriggerProps, pasteTriggerProps } = useAssetMenu();
  const { showToast } = useToast();

  const searchParams = useSearchParams();
  const version = useStorageVersion();

  // ── sprite list ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sprites = useMemo(() => storage.getAll("sprites", projectId), [projectId, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectPalettes = useMemo(() => storage.getAll("palettes", projectId), [projectId, version]);
  const [activeSpriteId, setActiveSpriteId] = useState<string | null>(null);
  // false only for the blank canvas shown on arrival; the first edit turns autosave on
  const [touched, setTouched] = useState(false);
  const deletedRef = useRef(new Set<string>());
  const initializedRef = useRef(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [paletteSource, setPaletteSource] = useState("default");
  const [imageTick, setImageTick] = useState(0);
  const requestRedraw = useCallback(() => setImageTick((t) => t + 1), []);

  // ── canvas size ──
  const [canvasW, setCanvasW] = useState(32);
  const [canvasH, setCanvasH] = useState(32);
  // the size as of the latest change, readable in the same handler that changed it (history needs it)
  const sizeRef = useRef({ w: 32, h: 32 });
  function setCanvasSize(w: number, h: number) {
    sizeRef.current = { w, h };
    setCanvasW(w);
    setCanvasH(h);
  }

  // ── frames / layers ──
  const [frames, setFrames] = useState<FrameData[]>([]);
  // Always-current frames for async mouse handlers (state in their closures can be a render behind).
  const framesRef = useRef<FrameData[]>(frames);
  framesRef.current = frames;
  const [activeFrame, setActiveFrame] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);
  // Frames picked with Shift/Ctrl-click (or "Add to selection"), besides the active one: durations and new tags apply to all.
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [frameTags, setFrameTags] = useState<FrameTag[]>([]);
  // Current tags for history, like sizeRef: readable in the handler that changed them.
  const tagsRef = useRef<FrameTag[]>([]);
  function setTags(tags: FrameTag[]) {
    tagsRef.current = tags;
    setFrameTags(tags);
  }
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [previewTagId, setPreviewTagId] = useState("");

  // ── tool state ──
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#ffffff");
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [zoom, setZoom] = useState(12);
  const [showGrid, setShowGrid] = useState(true);
  const [onionSkin, setOnionSkin] = useState(true);
  const [onionOpacity, setOnionOpacity] = useState(0.3);
  const [sizeMenu, setSizeMenu] = useState(false);
  // Below 1280px the toolbar scrolls sideways, so the canvas menu is placed with fixed coordinates inside the screen.
  const [sizeMenuPlacement, setSizeMenuPlacement] = useState<React.CSSProperties | undefined>();
  // Phones show the colour panel or the frames, one at a time, so the canvas keeps room.
  const [showColourPanel, setShowColourPanel] = useState(false);
  const [showFrames, setShowFrames] = useState(false);
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>("sharp");
  const [scaleCopy, setScaleCopy] = useState(false);
  const [scaling, setScaling] = useState(false);
  const [pickW, setPickW] = useState("32");
  const [pickH, setPickH] = useState("32");
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(8);
  const [playStep, setPlayStep] = useState(0);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState(DEFAULT_NAME);
  const [customW, setCustomW] = useState("32");
  const [customH, setCustomH] = useState("32");

  // ── history ──
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIdxRef = useRef(-1);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const syncHistoryState = () =>
    setHistoryState({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    });
  // The layer being painted during one pencil/eraser stroke, and the promise that loads it.
  const strokeRef = useRef<ImageData | null>(null);
  const strokeStartRef = useRef<Promise<void> | null>(null);

  // ── drawing refs ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<ImageData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);


  // ── build initial blank frame ──
  function makeBlankFrame(w: number, h: number, duration = durationForFps(fps)): FrameData {
    return {
      id: uuid(),
      layers: [{ id: uuid(), name: "Layer 1", visible: true, pixels: blankBase64(w, h) }],
      duration,
    };
  }

  function resetAnimationState(tags: FrameTag[]) {
    setTags(tags);
    setSelectedFrameIds([]);
    setEditingTagId(null);
    setPreviewTagId("");
    setPlaying(false);
  }

  // ── new sprite ──
  /** A fresh blank sprite. `save` stores it right away; otherwise it saves on the first edit. */
  function startSprite(w: number, h: number, save: boolean) {
    const id = uuid();
    const frame = makeBlankFrame(w, h);
    setCanvasSize(w, h);
    setFrames([frame]);
    setActiveFrame(0);
    setActiveLayer(0);
    setActiveSpriteId(id);
    setNewName(DEFAULT_NAME);
    setTouched(save);
    resetAnimationState([]);
    historyRef.current = [];
    historyIdxRef.current = -1;
    pushHistory([frame], 0, 0, false);
    if (save) void persist({ id, name: DEFAULT_NAME, w, h, frames: [frame], fps, tags: [] });
  }

  function createNewSprite(w: number, h: number) {
    startSprite(w, h, true);
    setMobilePanel(false);
  }

  // ── load sprite ──
  async function loadSprite(sprite: Sprite) {
    initializedRef.current = true;
    setCanvasSize(sprite.width, sprite.height);
    setActiveSpriteId(sprite.id);
    setNewName(sprite.name);
    setFps(sprite.fps);

    const durations = frameDurations(sprite);
    const loaded: FrameData[] = [];
    sprite.frames.forEach((sf, i) => {
      const layers: Layer[] = sf.layers?.length
        ? sf.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, pixels: l.pixels }))
        : [{ id: uuid(), name: "Layer 1", visible: true, pixels: sf.pixels }];
      loaded.push({ id: sf.id, layers, duration: durations[i] });
    });
    if (loaded.length === 0) loaded.push(makeBlankFrame(sprite.width, sprite.height, durationForFps(sprite.fps)));
    setFrames(loaded);
    setActiveFrame(0);
    setActiveLayer(0);
    setTouched(true);
    setMobilePanel(false);
    resetAnimationState(frameTagsFor(sprite.frameTags, loaded.length));
    historyRef.current = [];
    historyIdxRef.current = -1;
    pushHistory(loaded, 0, 0, false);
  }

  useOpenParam((id) => {
    const s = storage.getById("sprites", id, projectId);
    if (s) loadSprite(s);
  });
  useTrackOpenAsset(activeSpriteId ? { type: "sprite", id: activeSpriteId } : null);

  // ── autosave ──
  type Doc = { id: string | null; name: string; w: number; h: number; frames: FrameData[]; fps: number; tags: FrameTag[] };
  const doc = useMemo<Doc>(
    () => ({ id: activeSpriteId, name: newName, w: canvasW, h: canvasH, frames, fps, tags: frameTags }),
    [activeSpriteId, newName, canvasW, canvasH, frames, fps, frameTags]
  );

  async function persist(d: Doc) {
    if (!d.id || deletedRef.current.has(d.id) || d.frames.length === 0) return;
    const spriteFrames: SpriteFrame[] = await Promise.all(
      d.frames.map(async (f) => ({
        id: f.id,
        pixels: await compositeFrame(f, d.w, d.h),
        duration: f.duration,
        layers: f.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, pixels: l.pixels })),
      }))
    );
    if (deletedRef.current.has(d.id)) return;
    const existing = storage.getById("sprites", d.id, projectId);
    // once you edit an example it becomes your own work, so "Remove examples" leaves it alone
    const { example: _wasExample, ...rest } = (existing ?? {}) as Partial<Sprite> & { example?: boolean };
    void _wasExample;
    const now = new Date().toISOString();
    const sprite: Sprite = {
      ...rest,
      id: d.id,
      projectId,
      name: d.name.trim() || DEFAULT_NAME,
      width: d.w,
      height: d.h,
      frames: spriteFrames,
      fps: d.fps,
      hasFrameDurations: true,
      frameTags: d.tags,
      tags: existing?.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    storage.save("sprites", sprite, projectId);
  }

  const { state: saveState, flush } = useAutosave(doc, persist, { resetKey: activeSpriteId, enabled: touched });
  const savedSpriteId = activeSpriteId && sprites.some((s) => s.id === activeSpriteId) ? activeSpriteId : null;

  function deleteSprite(id: string) {
    const s = sprites.find((x) => x.id === id);
    if (!confirm(`Delete sprite "${s?.name ?? DEFAULT_NAME}"?`)) return;
    deletedRef.current.add(id);
    storage.delete("sprites", id, projectId);
    if (activeSpriteId === id) startSprite(canvasW, canvasH, false);
  }

  // ── composite all visible layers into one PNG data URL ──
  async function compositeFrame(frame: FrameData, w: number, h: number): Promise<string> {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    await drawLayers(c.getContext("2d")!, frame.layers);
    return c.toDataURL();
  }

  // ── history ──
  function pushHistory(f: FrameData[], af: number, al: number, edit = true) {
    if (edit) setTouched(true);
    const entry: HistoryEntry = {
      frames: JSON.parse(JSON.stringify(f)),
      tags: tagsRef.current.map((tag) => ({ ...tag })),
      activeFrame: af,
      activeLayer: al,
      w: sizeRef.current.w,
      h: sizeRef.current.h,
    };
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(entry);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    syncHistoryState();
  }

  function undo() {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const e = historyRef.current[historyIdxRef.current];
    setCanvasSize(e.w, e.h);
    setFrames(JSON.parse(JSON.stringify(e.frames)));
    setTags(e.tags.map((tag) => ({ ...tag })));
    setActiveFrame(e.activeFrame);
    setActiveLayer(e.activeLayer);
    syncHistoryState();
  }

  function redo() {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const e = historyRef.current[historyIdxRef.current];
    setCanvasSize(e.w, e.h);
    setFrames(JSON.parse(JSON.stringify(e.frames)));
    setTags(e.tags.map((tag) => ({ ...tag })));
    setActiveFrame(e.activeFrame);
    setActiveLayer(e.activeLayer);
    syncHistoryState();
  }

  // ── keyboard shortcuts ──
  useUndoShortcuts(undo, redo);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const t = TOOL_BY_KEY[e.key.toLowerCase()];
      if (t) {
        e.preventDefault();
        setTool(t);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  // ── palettes: project palettes replace the swatches; ?palette=<id> preselects one ──
  function choosePalette(source: string) {
    setPaletteSource(source);
    if (source === "default") {
      setPalette(DEFAULT_PALETTE);
      return;
    }
    const p = storage.getById("palettes", source, projectId);
    if (p?.colors.length) {
      setPalette(p.colors);
      setColor(p.colors.find((c) => c.toLowerCase() !== "#000000") ?? p.colors[0]);
    }
  }
  const paletteParam = searchParams.get("palette");
  useEffect(() => {
    if (paletteParam && storage.getById("palettes", paletteParam, projectId)) choosePalette(paletteParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteParam, projectId]);

  // ── phones: fit the canvas to the screen ──
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
    const byW = Math.floor((window.innerWidth - 32) / canvasW);
    const byH = Math.floor((window.innerHeight * 0.42) / canvasH);
    setZoom(Math.max(2, Math.min(40, byW, byH)));
  }, [canvasW, canvasH]);

  // ── preview: one tag (or every frame) in its play order, each frame for its own duration ──
  const previewTag = frameTags.find((tag) => tag.id === previewTagId) ?? null;
  const playOrder = useMemo(() => playbackOrder(frames.length, previewTag), [frames.length, previewTag]);
  const previewFrame = playOrder.length ? playOrder[playStep % playOrder.length] : 0;

  // ── render canvas ──
  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const displayFrame = playing ? previewFrame : activeFrame;
    const frame = frames[displayFrame];
    if (!frame) return;

    const ctx = canvas.getContext("2d")!;
    const pw = canvasW * zoom;
    const ph = canvasH * zoom;
    canvas.width = pw;
    canvas.height = ph;

    ctx.clearRect(0, 0, pw, ph);

    // checkerboard
    const cs = zoom;
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#1a1a2a" : "#222238";
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }

    // onion skin
    if (onionSkin && !playing && displayFrame > 0) {
      const prev = frames[displayFrame - 1];
      if (prev) {
        ctx.globalAlpha = onionOpacity;
        for (const layer of prev.layers) {
          if (!layer.visible) continue;
          const img = getLoadedImage(layer.pixels, requestRedraw);
          if (!img) continue;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, canvasW, canvasH, 0, 0, pw, ph);
        }
        ctx.globalAlpha = 1;
      }
    }

    // layers
    for (const layer of frame.layers) {
      if (!layer.visible) continue;
      const img = getLoadedImage(layer.pixels, requestRedraw);
      if (!img) continue;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvasW, canvasH, 0, 0, pw, ph);
    }

    // overlay (line/rect/circle preview)
    if (overlayRef.current && !playing) {
      const oc = document.createElement("canvas");
      oc.width = canvasW;
      oc.height = canvasH;
      oc.getContext("2d")!.putImageData(overlayRef.current, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(oc, 0, 0, canvasW, canvasH, 0, 0, pw, ph);
    }

    // grid
    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvasW; x++) {
        ctx.beginPath();
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, ph);
        ctx.stroke();
      }
      for (let y = 0; y <= canvasH; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(pw, y * zoom + 0.5);
        ctx.stroke();
      }
    }
    // imageTick: redraw once layer images finish decoding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, activeFrame, previewFrame, playing, canvasW, canvasH, zoom, showGrid, onionSkin, onionOpacity, requestRedraw, imageTick]);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  // ── animation playback ──
  const previewDuration = frames[previewFrame]?.duration ?? durationForFps(fps);
  useEffect(() => {
    if (!playing || playOrder.length <= 1) return;
    const timeout = setTimeout(() => setPlayStep((step) => step + 1), previewDuration);
    return () => clearTimeout(timeout);
  }, [playing, playStep, playOrder.length, previewDuration]);

  function togglePreview() {
    setPlayStep(0);
    setPlaying(!playing);
  }

  // ── get active layer image data ──
  async function getActiveLayerData(): Promise<ImageData> {
    const frame = framesRef.current[activeFrame];
    if (!frame) return new ImageData(canvasW, canvasH);
    const layer = frame.layers[activeLayer];
    if (!layer) return new ImageData(canvasW, canvasH);
    return base64ToImageData(layer.pixels, canvasW, canvasH);
  }

  // ── set active layer image data ──
  function setActiveLayerData(imgData: ImageData) {
    const b64 = imageDataToBase64(imgData);
    const next = framesRef.current.map((f, fi) =>
      fi === activeFrame && f.layers[activeLayer]
        ? { ...f, layers: f.layers.map((l, li) => (li === activeLayer ? { ...l, pixels: b64 } : l)) }
        : f
    );
    framesRef.current = next;
    setFrames(next);
  }

  // ── pixel coords from mouse ──
  function getPixelCoords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);
    if (x < 0 || x >= canvasW || y < 0 || y >= canvasH) return null;
    return { x, y };
  }

  // ── set pixel on imagedata ──
  function setPixel(data: ImageData, x: number, y: number, r: number, g: number, b: number, a: number) {
    if (x < 0 || x >= data.width || y < 0 || y >= data.height) return;
    const i = (y * data.width + x) * 4;
    data.data[i] = r;
    data.data[i + 1] = g;
    data.data[i + 2] = b;
    data.data[i + 3] = a;
  }

  // ── mouse handlers ──
  async function handleMouseDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (playing) return;
    const p = getPixelCoords(e);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    isDrawingRef.current = true;
    drawStartRef.current = p;
    lastPixelRef.current = p;

    if (tool === "pencil" || tool === "eraser") {
      strokeRef.current = null;
      const start = (async () => {
        const data = await getActiveLayerData();
        const [r, g, b] = tool === "eraser" ? [0, 0, 0] : hexToRgb(color);
        const a = tool === "eraser" ? 0 : 255;
        setPixel(data, p.x, p.y, r, g, b, a);
        strokeRef.current = data;
        setActiveLayerData(data);
      })();
      strokeStartRef.current = start;
      await start;
    } else if (tool === "fill") {
      const data = await getActiveLayerData();
      const [r, g, b] = hexToRgb(color);
      floodFill(data, p.x, p.y, r, g, b, 255);
      setActiveLayerData(data);
      pushHistory(framesRef.current, activeFrame, activeLayer);
      isDrawingRef.current = false;
    } else if (tool === "picker") {
      const data = await getActiveLayerData();
      const i = (p.y * canvasW + p.x) * 4;
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
      if (data.data[i + 3] > 0) setColor(rgbToHex(r, g, b));
      isDrawingRef.current = false;
    }
  }

  async function handleMouseMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || playing) return;
    const p = getPixelCoords(e);
    if (!p) return;

    if (tool === "pencil" || tool === "eraser") {
      const data = strokeRef.current;
      if (!data) return; // layer still loading; the next move draws a line from the last point
      const [r, g, b] = tool === "eraser" ? [0, 0, 0] : hexToRgb(color);
      const a = tool === "eraser" ? 0 : 255;
      const last = lastPixelRef.current || p;
      const pts = bresenhamLine(last.x, last.y, p.x, p.y);
      for (const [px, py] of pts) setPixel(data, px, py, r, g, b, a);
      lastPixelRef.current = p;
      setActiveLayerData(data);
    } else if (tool === "line" || tool === "rect" || tool === "circle") {
      const start = drawStartRef.current;
      if (!start) return;
      const overlay = new ImageData(canvasW, canvasH);
      const [r, g, b] = hexToRgb(color);
      if (tool === "line") {
        for (const [px, py] of bresenhamLine(start.x, start.y, p.x, p.y)) setPixel(overlay, px, py, r, g, b, 255);
      } else if (tool === "rect") {
        const x1 = Math.min(start.x, p.x), x2 = Math.max(start.x, p.x);
        const y1 = Math.min(start.y, p.y), y2 = Math.max(start.y, p.y);
        for (let x = x1; x <= x2; x++) { setPixel(overlay, x, y1, r, g, b, 255); setPixel(overlay, x, y2, r, g, b, 255); }
        for (let y = y1; y <= y2; y++) { setPixel(overlay, x1, y, r, g, b, 255); setPixel(overlay, x2, y, r, g, b, 255); }
      } else if (tool === "circle") {
        const rad = Math.round(Math.sqrt((p.x - start.x) ** 2 + (p.y - start.y) ** 2));
        for (const [px, py] of midpointCircle(start.x, start.y, rad)) setPixel(overlay, px, py, r, g, b, 255);
      }
      overlayRef.current = overlay;
      renderCanvas();
    }
  }

  async function handleMouseUp() {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (tool === "line" || tool === "rect" || tool === "circle") {
      if (overlayRef.current) {
        const data = await getActiveLayerData();
        const ov = overlayRef.current;
        for (let i = 0; i < ov.data.length; i += 4) {
          if (ov.data[i + 3] > 0) {
            data.data[i] = ov.data[i];
            data.data[i + 1] = ov.data[i + 1];
            data.data[i + 2] = ov.data[i + 2];
            data.data[i + 3] = ov.data[i + 3];
          }
        }
        setActiveLayerData(data);
        overlayRef.current = null;
      }
    }
    // A quick click can end before the stroke's layer finished loading; wait so the step includes it.
    if (strokeStartRef.current) await strokeStartRef.current;
    strokeStartRef.current = null;
    strokeRef.current = null;
    pushHistory(framesRef.current, activeFrame, activeLayer);
  }

  // ── zoom ──
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => Math.max(2, Math.min(40, z + (e.deltaY < 0 ? 1 : -1))));
  }

  // ── canvas size ──
  async function resizeCanvas(w: number, h: number) {
    if (w === canvasW && h === canvasH) return;
    const dx = Math.floor((w - canvasW) / 2);
    const dy = Math.floor((h - canvasH) / 2);
    const next: FrameData[] = await Promise.all(
      frames.map(async (f) => ({
        ...f,
        layers: await Promise.all(
          f.layers.map(async (l) => {
            const img = await loadImage(l.pixels);
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d")!;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, dx, dy);
            return { ...l, pixels: c.toDataURL() };
          })
        ),
      }))
    );
    setCanvasSize(w, h);
    setFrames(next);
    pushHistory(next, activeFrame, activeLayer);
  }

  /** Every frame and layer scaled up; sharp = N×N blocks, smooth = Scale2x/3x. */
  async function scaledFrames(factor: ScaleFactor, method: ScaleMethod): Promise<FrameData[]> {
    return Promise.all(
      frames.map(async (f) => ({
        ...f,
        layers: await Promise.all(
          f.layers.map(async (l) => {
            const src = await base64ToImageData(l.pixels, canvasW, canvasH);
            const out = scalePixels(src, factor, method);
            const c = document.createElement("canvas");
            c.width = out.width;
            c.height = out.height;
            c.getContext("2d")!.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
            return { ...l, pixels: c.toDataURL() };
          })
        ),
      }))
    );
  }

  async function scaleSprite(factor: ScaleFactor, method: ScaleMethod, asCopy: boolean) {
    const w = canvasW * factor;
    const h = canvasH * factor;
    const next = await scaledFrames(factor, method);
    if (!asCopy) {
      setCanvasSize(w, h);
      setFrames(next);
      pushHistory(next, activeFrame, activeLayer);
      return;
    }
    flush();
    const now = new Date().toISOString();
    const copy: Sprite = {
      id: uuid(),
      projectId,
      name: `${newName.trim() || DEFAULT_NAME} (${w}×${h})`,
      width: w,
      height: h,
      fps,
      hasFrameDurations: true,
      frameTags: tagsRef.current.map((tag) => ({ ...tag, id: uuid() })),
      frames: await Promise.all(
        next.map(async (f) => ({
          id: uuid(),
          duration: f.duration,
          pixels: await compositeFrame(f, w, h),
          layers: f.layers.map((l) => ({ id: uuid(), name: l.name, visible: l.visible, pixels: l.pixels })),
        }))
      ),
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    storage.save("sprites", copy, projectId);
    await loadSprite(copy);
  }

  function pickedSize(): [number, number] {
    const clampSize = (v: string) => Math.max(1, Math.min(MAX_SIZE, Math.round(Number(v)) || 32));
    return [clampSize(pickW), clampSize(pickH)];
  }

  // ── frame management ──
  function addFrame() {
    const newFrame = makeBlankFrame(canvasW, canvasH, frames[activeFrame]?.duration);
    const next = [...frames, newFrame];
    setFrames(next);
    setActiveFrame(next.length - 1);
    pushHistory(next, next.length - 1, activeLayer);
  }

  function duplicateFrame(index = activeFrame) {
    const clone: FrameData = JSON.parse(JSON.stringify(frames[index]));
    clone.id = uuid();
    clone.layers = clone.layers.map((l) => ({ ...l, id: uuid() }));
    const next = [...frames];
    next.splice(index + 1, 0, clone);
    setTags(tagsAfterInsert(tagsRef.current, index + 1, true));
    setFrames(next);
    setActiveFrame(index + 1);
    pushHistory(next, index + 1, activeLayer);
  }

  function deleteFrame(index = activeFrame) {
    if (frames.length <= 1) return;
    const next = frames.filter((_, i) => i !== index);
    const newActive = index < activeFrame ? activeFrame - 1 : Math.min(activeFrame, next.length - 1);
    setTags(tagsAfterDelete(tagsRef.current, index));
    setFrames(next);
    setActiveFrame(newActive);
    pushHistory(next, newActive, activeLayer);
  }

  function moveFrame(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= frames.length) return;
    const next = [...frames];
    [next[index], next[target]] = [next[target], next[index]];
    const newActive = activeFrame === index ? target : activeFrame === target ? index : activeFrame;
    setFrames(next);
    setActiveFrame(newActive);
    pushHistory(next, newActive, activeLayer);
  }

  async function copyFrameAsPng(index: number) {
    const dataUrl = await compositeFrame(frames[index], canvasW, canvasH);
    const isCopied = await copyToSystemClipboard({ kind: "png", dataUrl });
    showToast({ message: isCopied ? "Copied" : COPY_FAILED_MESSAGE });
  }

  // ── frame selection, durations and tags ──
  const selectedIndices = frames.flatMap((frame, i) => (i === activeFrame || selectedFrameIds.includes(frame.id) ? [i] : []));

  function clickFrame(index: number, event: React.MouseEvent) {
    setPlaying(false);
    if (event.shiftKey) {
      const [from, to] = [Math.min(activeFrame, index), Math.max(activeFrame, index)];
      setSelectedFrameIds(frames.slice(from, to + 1).map((frame) => frame.id));
    } else if (event.ctrlKey || event.metaKey) {
      toggleFrameSelected(index);
      return;
    } else {
      setSelectedFrameIds([]);
    }
    setActiveFrame(index);
  }

  /** Adds a frame to the selection (making it the active one) or takes it out. */
  function toggleFrameSelected(index: number) {
    const id = frames[index].id;
    const isSelected = selectedIndices.includes(index);
    const others = selectedIndices.filter((i) => i !== index).map((i) => frames[i].id);
    if (!isSelected) {
      setSelectedFrameIds([...others, frames[activeFrame].id, id]);
      setActiveFrame(index);
    } else if (others.length) {
      setSelectedFrameIds(others);
      if (index === activeFrame) setActiveFrame(frames.findIndex((frame) => frame.id === others[0]));
    }
  }

  function setDurations(indices: number[], ms: number) {
    const duration = clampDuration(ms);
    const next = frames.map((frame, i) => (indices.includes(i) ? { ...frame, duration } : frame));
    setFrames(next);
    pushHistory(next, activeFrame, activeLayer);
  }

  function changeFps(value: number) {
    const nextFps = Math.max(1, Math.min(30, value || 1));
    setFps(nextFps);
    setDurations(frames.map((_, i) => i), durationForFps(nextFps));
  }

  function addTag() {
    const from = Math.min(...selectedIndices);
    const to = Math.max(...selectedIndices);
    const tag: FrameTag = { id: uuid(), name: `Tag ${frameTags.length + 1}`, from, to, color: unusedTagColor(frameTags), direction: "forward" };
    setTags([...frameTags, tag]);
    setEditingTagId(tag.id);
    pushHistory(frames, activeFrame, activeLayer);
  }

  /** `commit` adds an undo step; typing a name commits once, when the field loses focus. */
  function updateTag(id: string, patch: Partial<FrameTag>, commit = true) {
    setTags(frameTags.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)));
    setTouched(true);
    if (commit) pushHistory(frames, activeFrame, activeLayer);
  }

  function deleteTag(id: string) {
    setTags(frameTags.filter((tag) => tag.id !== id));
    setEditingTagId(null);
    if (previewTagId === id) setPreviewTagId("");
    pushHistory(frames, activeFrame, activeLayer);
  }

  function frameMenuEntries(index: number): ContextMenuEntry[] {
    const isSelected = selectedIndices.includes(index);
    return [
      {
        kind: "item",
        key: "select",
        label: isSelected ? "Remove from selection" : "Add to selection",
        disabled: isSelected && selectedIndices.length === 1,
        onSelect: () => toggleFrameSelected(index),
      },
      { kind: "item", key: "duplicate", label: "Duplicate", onSelect: () => duplicateFrame(index) },
      { kind: "item", key: "delete", label: "Delete", danger: true, disabled: frames.length <= 1, onSelect: () => deleteFrame(index) },
      { kind: "item", key: "copy-png", label: "Copy as PNG", onSelect: () => void copyFrameAsPng(index) },
      { kind: "separator", key: "move-separator" },
      { kind: "item", key: "move-left", label: "Move left", disabled: index === 0, onSelect: () => moveFrame(index, -1) },
      { kind: "item", key: "move-right", label: "Move right", disabled: index === frames.length - 1, onSelect: () => moveFrame(index, 1) },
    ];
  }

  // ── layer management ──
  function addLayer() {
    const next = JSON.parse(JSON.stringify(frames)) as FrameData[];
    const newLayer: Layer = { id: uuid(), name: `Layer ${next[activeFrame].layers.length + 1}`, visible: true, pixels: blankBase64(canvasW, canvasH) };
    next[activeFrame].layers.push(newLayer);
    setFrames(next);
    setActiveLayer(next[activeFrame].layers.length - 1);
    pushHistory(next, activeFrame, next[activeFrame].layers.length - 1);
  }

  function deleteLayer() {
    const frame = frames[activeFrame];
    if (frame.layers.length <= 1) return;
    const next = JSON.parse(JSON.stringify(frames)) as FrameData[];
    next[activeFrame].layers.splice(activeLayer, 1);
    const newAL = Math.min(activeLayer, next[activeFrame].layers.length - 1);
    setFrames(next);
    setActiveLayer(newAL);
    pushHistory(next, activeFrame, newAL);
  }

  function toggleLayerVisibility(idx: number) {
    const next = JSON.parse(JSON.stringify(frames)) as FrameData[];
    next[activeFrame].layers[idx].visible = !next[activeFrame].layers[idx].visible;
    setFrames(next);
    setTouched(true);
  }

  function moveLayerUp() {
    if (activeLayer >= frames[activeFrame].layers.length - 1) return;
    const next = JSON.parse(JSON.stringify(frames)) as FrameData[];
    const layers = next[activeFrame].layers;
    [layers[activeLayer], layers[activeLayer + 1]] = [layers[activeLayer + 1], layers[activeLayer]];
    setFrames(next);
    setTouched(true);
    setActiveLayer(activeLayer + 1);
  }

  function moveLayerDown() {
    if (activeLayer <= 0) return;
    const next = JSON.parse(JSON.stringify(frames)) as FrameData[];
    const layers = next[activeFrame].layers;
    [layers[activeLayer], layers[activeLayer - 1]] = [layers[activeLayer - 1], layers[activeLayer]];
    setFrames(next);
    setTouched(true);
    setActiveLayer(activeLayer - 1);
  }

  // ── export ──
  async function exportPNG() {
    const c = document.createElement("canvas");
    c.width = canvasW;
    c.height = canvasH;
    await drawLayers(c.getContext("2d")!, frames[activeFrame].layers);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${newName.trim() || "sprite"}_frame${activeFrame + 1}.png`;
    a.click();
  }

  const exportName = newName.trim() || "sprite";

  async function exportSpriteSheet() {
    const { columns, rows, rects } = sheetLayout(frames.length, canvasW, canvasH);
    const c = document.createElement("canvas");
    c.width = canvasW * columns;
    c.height = canvasH * rows;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < frames.length; i++) {
      await drawLayers(ctx, frames[i].layers, rects[i].x, rects[i].y);
    }
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${exportName}_sheet.png`;
    a.click();
  }

  function exportSheetJson() {
    const json = asepriteSheetJson({
      name: exportName,
      image: `${exportName}_sheet.png`,
      width: canvasW,
      height: canvasH,
      durations: frames.map((frame) => frame.duration),
      tags: frameTags,
      app: APP.url,
    });
    downloadBlob(`${exportName}_sheet.json`, new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
  }

  /** All frames, or one tag played in its direction, each frame shown for its own duration. */
  async function exportGif(scale: number, tag?: FrameTag) {
    const images = await Promise.all(
      frames.map(async (f) => {
        const c = document.createElement("canvas");
        c.width = canvasW;
        c.height = canvasH;
        const ctx = c.getContext("2d")!;
        await drawLayers(ctx, f.layers);
        return ctx.getImageData(0, 0, canvasW, canvasH);
      })
    );
    const gifFrames = playbackOrder(frames.length, tag).map((i) => ({ image: images[i], delay: frames[i].duration }));
    downloadBlob(`${exportName}${tag ? `_${tag.name.trim() || "tag"}` : ""}.gif`, encodeGif(gifFrames, { scale }));
  }

  // ── import ──
  const [pendingImport, setPendingImport] = useState<{ file: File; importer: Importer<Sprite> } | null>(null);
  const importAsLayerRef = useRef(false);

  function addImportedLayer(sprite: Sprite) {
    const next = JSON.parse(JSON.stringify(frames)) as FrameData[];
    const layers = next[activeFrame].layers;
    layers.push({ id: uuid(), name: sprite.name, visible: true, pixels: sprite.frames[0].pixels });
    setFrames(next);
    setActiveLayer(layers.length - 1);
    pushHistory(next, activeFrame, layers.length - 1);
  }

  function addImportedSprites(items: Sprite[]): ImportStep {
    const step = importAsNewAssets("sprites", projectId, items, {
      previousId: savedSpriteId,
      open: (sprite) => void loadSprite(sprite),
      back: (previous) => (previous ? void loadSprite(previous) : startSprite(canvasW, canvasH, false)),
    });
    // a pending autosave must not bring an undone import back
    const ids = items.map((sprite) => sprite.id);
    return {
      ...step,
      undo() {
        ids.forEach((id) => deletedRef.current.add(id));
        step.undo();
      },
      redo() {
        ids.forEach((id) => deletedRef.current.delete(id));
        step.redo();
      },
    };
  }

  const imports = useImport<Sprite>({
    importers: PIXEL_ART_IMPORTERS,
    noun: ["sprite", "sprites"],
    history: { undo, redo, ...historyState, checkpoint() {} },
    openId: savedSpriteId,
    apply: ({ items }: ImportResult<Sprite>) => (importAsLayerRef.current ? addImportedLayer(items[0]) : addImportedSprites(items)),
  });
  // Every picture goes through the dialog first (new sprite or layer, shrink, palette); huge files fail straight away.
  const askFirstImports: ImportController = {
    ...imports,
    async importFile(file, chosen) {
      const importer = (chosen as Importer<Sprite> | undefined) ?? (await findImporter(PIXEL_ART_IMPORTERS, file));
      if (!importer || file.size > MAX_IMAGE_BYTES) return imports.importFile(file, importer ?? undefined);
      setPendingImport({ file, importer });
    },
  };
  function runPendingImport(options: PixelImportOptions) {
    if (!pendingImport) return;
    const { file, importer } = pendingImport;
    setPendingImport(null);
    importAsLayerRef.current = Boolean(options.canvas);
    const configured = pixelArtImporters(options).find((candidate) => candidate.id === importer.id) ?? importer;
    void imports.importFile(file, configured as Importer<unknown>);
  }
  const paletteName = paletteSource === "default" ? "the default palette" : (projectPalettes.find((p) => p.id === paletteSource)?.name ?? "the palette");

  // ── init with blank if no frames ──
  // Runs once per instance, and not after a sprite opened via ?open=: effects re-run (strict mode, Activity).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (frames.length === 0) startSprite(canvasW, canvasH, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── render ──
  const lanes = tagLanes(frameTags);
  const editingTag = frameTags.find((tag) => tag.id === editingTagId) ?? null;
  const selectedDurations = new Set(selectedIndices.map((i) => frames[i].duration));
  const selectedDuration = selectedDurations.size === 1 ? [...selectedDurations][0] : null;

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    background: active ? "var(--accent)" : "var(--bg-card)",
    color: active ? "var(--on-accent, #fff)" : "var(--text-primary)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 6,
    padding: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  });

  const panelStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 10,
  };

  const smallBtn: React.CSSProperties = { ...btnStyle(), padding: 3 };

  const placeSizeMenu = (anchor: HTMLElement): React.CSSProperties | undefined => {
    if (window.innerWidth >= 1280) return undefined;
    const MARGIN = 8;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - MARGIN * 2);
    const top = rect.bottom + 4;
    return {
      position: "fixed",
      top,
      left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN)),
      width,
      maxHeight: window.innerHeight - top - MARGIN,
      overflowY: "auto",
    };
  };

  // Sprite list + new-sprite form + links. Shown in the left column on desktop, in a drawer on phones.
  const spritesPanel = (
    <div style={panelStyle}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Sprites</span>
        <div className="flex items-center gap-1">
          <PasteButton type="sprite" />
          <button onClick={() => setShowNewDialog((v) => !v)} style={smallBtn} title="New sprite" aria-label="New sprite"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
      <ExamplesBar projectId={projectId} collections={["sprites"]} className="mb-2" />
      {showNewDialog && (
        <div className="mb-2 space-y-1.5">
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>New sprite size</div>
          <div className="flex gap-1 flex-wrap">
            {SIZES.map((s) => (
              <button
                key={s.label}
                onClick={() => { createNewSprite(s.w, s.h); setShowNewDialog(false); }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} aria-label="Width" className="w-12 text-xs px-1 py-0.5 rounded outline-none" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>×</span>
            <input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} aria-label="Height" className="w-12 text-xs px-1 py-0.5 rounded outline-none" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
            <button
              onClick={() => {
                const clampSize = (v: string) => Math.max(1, Math.min(MAX_SIZE, Math.round(Number(v)) || 32));
                createNewSprite(clampSize(customW), clampSize(customH));
                setShowNewDialog(false);
              }}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
            >
              Create
            </button>
          </div>
        </div>
      )}
      <div {...pasteTriggerProps("sprite")} className="space-y-0.5 max-h-32 max-md:max-h-48 overflow-y-auto">
        {sprites.map((s) => (
          <div
            key={s.id}
            {...assetTriggerProps({ type: "sprite", id: s.id })}
            {...rowButtonProps(() => assetTriggerProps({ type: "sprite", id: s.id }))}
            className="group flex items-center gap-1.5 w-full text-xs px-2 py-1 rounded cursor-pointer hover:bg-[var(--bg-hover)]"
            onClick={() => loadSprite(s)}
            style={{
              color: activeSpriteId === s.id ? "var(--text-primary)" : "var(--text-secondary)",
              background: activeSpriteId === s.id ? "var(--bg-hover)" : undefined,
            }}
          >
            {s.frames[0]?.pixels && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.frames[0].pixels} alt="" className="w-4 h-4 shrink-0" style={{ imageRendering: "pixelated" }} />
            )}
            <span className="flex-1 truncate">{s.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteSprite(s.id); }}
              className="opacity-0 group-hover:opacity-100 max-md:opacity-100 shrink-0"
              style={{ color: "var(--red)" }}
              title={`Delete ${s.name}`}
              aria-label={`Delete ${s.name}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <AssetPinButton asset={{ type: "sprite", id: s.id }} label={s.name} />
            <AssetMenuButton asset={{ type: "sprite", id: s.id }} label={s.name} />
          </div>
        ))}
        {sprites.length === 0 && (
          <div className="text-xs py-1" style={{ color: "var(--text-muted)" }}>No sprites yet. Start drawing and it saves itself.</div>
        )}
      </div>
      {savedSpriteId && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <LinkedAssets projectId={projectId} type="sprite" id={savedSpriteId} />
        </div>
      )}
    </div>
  );

  const layersPanel = (
    <div style={panelStyle}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Layers</span>
        <div className="flex gap-0.5">
          <button onClick={addLayer} style={smallBtn} title="Add layer" aria-label="Add layer"><Plus className="w-3 h-3" /></button>
          <button onClick={deleteLayer} style={smallBtn} title="Delete layer" aria-label="Delete layer"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      <div className="space-y-0.5">
        {frames[activeFrame]?.layers.map((layer, i) => (
          <div
            key={layer.id}
            onClick={() => setActiveLayer(i)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer"
            style={{
              background: activeLayer === i ? "var(--bg-hover)" : "transparent",
              color: activeLayer === i ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(i); }}
              style={{ color: layer.visible ? "var(--text-secondary)" : "var(--text-muted)" }}
              title={layer.visible ? "Hide layer" : "Show layer"}
              aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
            >
              {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
            <span className="flex-1 truncate">{layer.name}</span>
          </div>
        )).reverse()}
      </div>
      <div className="flex gap-0.5 mt-1">
        <button onClick={moveLayerUp} style={smallBtn} title="Move layer up" aria-label="Move layer up"><ChevronUp className="w-3 h-3" /></button>
        <button onClick={moveLayerDown} style={smallBtn} title="Move layer down" aria-label="Move layer down"><ChevronDown className="w-3 h-3" /></button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <ImportDropZone imports={askFirstImports} target={rootRef} />
      {pendingImport && (
        <PixelImportDialog
          file={pendingImport.file}
          canBeLayer={pendingImport.importer.id === "pixel-image"}
          canvas={{ width: canvasW, height: canvasH }}
          palette={{ name: paletteName, colors: palette }}
          onImport={runPendingImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
      {/* Top bar */}
      <div
        className="flex items-center gap-1.5 px-4 h-12 shrink-0 border-b max-md:px-3"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="flex-1 min-w-0 h-full flex items-center justify-between max-xl:gap-3 max-xl:overflow-x-auto">
          <div className="flex items-center gap-3 max-md:gap-2 max-xl:shrink-0">
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Name</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setTouched(true); }}
                placeholder={DEFAULT_NAME}
                className="bg-transparent text-sm font-medium outline-none field-sizing-content min-w-36 max-w-80 max-md:min-w-28 max-md:max-w-[60vw] px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </label>
            <div className="relative">
              <button
                onClick={(e) => {
                  setPickW(String(canvasW));
                  setPickH(String(canvasH));
                  setSizeMenuPlacement(placeSizeMenu(e.currentTarget));
                  setSizeMenu((v) => !v);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium max-xl:whitespace-nowrap"
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                title="Change canvas size"
              >
                <Maximize2 className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                Canvas {canvasW}×{canvasH}
                <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
              </button>
              {sizeMenu && (
                <div
                  className="absolute z-50 top-full left-0 mt-1 w-72 max-w-[calc(100vw-24px)] p-3 rounded-lg shadow-xl"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", ...sizeMenuPlacement }}
                >
                  <div className="text-xs font-medium mb-2" style={{ color: "var(--text-primary)" }}>Canvas size (pixels)</div>
                  <div className="grid grid-cols-4 gap-1 mb-2">
                    {SIZES.map((sz) => {
                      const on = String(sz.w) === pickW && String(sz.h) === pickH;
                      return (
                        <button
                          key={sz.label}
                          onClick={() => {
                            setPickW(String(sz.w));
                            setPickH(String(sz.h));
                          }}
                          className="text-xs py-1 rounded"
                          style={{
                            background: on ? "var(--accent)" : "var(--bg-hover)",
                            color: on ? "var(--on-accent, #fff)" : "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {sz.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    Custom
                    <input type="number" min={1} max={MAX_SIZE} value={pickW} onChange={(e) => setPickW(e.target.value)} className="w-14 px-1.5 py-0.5 rounded outline-none" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} aria-label="Width" />
                    ×
                    <input type="number" min={1} max={MAX_SIZE} value={pickH} onChange={(e) => setPickH(e.target.value)} className="w-14 px-1.5 py-0.5 rounded outline-none" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} aria-label="Height" />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={async () => {
                        const [w, h] = pickedSize();
                        await resizeCanvas(w, h);
                        setSizeMenu(false);
                      }}
                      className="flex-1 text-xs py-1.5 rounded font-medium"
                      style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
                      title="Keep your drawing, centred; larger adds empty space, smaller crops the edges"
                    >
                      Resize this sprite
                    </button>
                    <button
                      onClick={() => {
                        const [w, h] = pickedSize();
                        createNewSprite(w, h);
                        setSizeMenu(false);
                      }}
                      className="flex-1 text-xs py-1.5 rounded"
                      style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                    >
                      New sprite
                    </button>
                  </div>
                  <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--text-muted)" }}>
                    Resizing keeps your drawing centred. Making it smaller crops the edges.
                  </p>

                  <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="text-xs font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>Scale up the drawing</div>
                    <p className="text-[11px] mb-2 leading-snug" style={{ color: "var(--text-muted)" }}>
                      Turn an {canvasW}×{canvasH} sprite into a bigger one, every frame and layer.
                    </p>
                    <div className="grid grid-cols-2 gap-1 mb-2" role="radiogroup" aria-label="Scaling method">
                      {([
                        ["sharp", "Sharp", "Each pixel becomes a block. Exact."],
                        ["smooth", "Smooth", "Rounds diagonal edges, keeps the pixel look."],
                      ] as const).map(([value, label, hint]) => (
                        <button
                          key={value}
                          role="radio"
                          aria-checked={scaleMethod === value}
                          onClick={() => setScaleMethod(value)}
                          className="text-left px-2 py-1.5 rounded"
                          style={{
                            background: scaleMethod === value ? "var(--accent-glow)" : "var(--bg-hover)",
                            border: `1px solid ${scaleMethod === value ? "var(--accent)" : "var(--border)"}`,
                          }}
                          title={hint}
                        >
                          <span className="block text-xs font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
                          <span className="block text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>{hint}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {([2, 3, 4] as const).map((f) => {
                        const tooBig = canvasW * f > MAX_SIZE || canvasH * f > MAX_SIZE;
                        return (
                          <button
                            key={f}
                            disabled={tooBig || scaling}
                            onClick={async () => {
                              setScaling(true);
                              try {
                                await scaleSprite(f, scaleMethod, scaleCopy);
                                setSizeMenu(false);
                              } finally {
                                setScaling(false);
                              }
                            }}
                            className="py-1.5 rounded text-xs disabled:opacity-40"
                            style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                            title={tooBig ? `Bigger than ${MAX_SIZE}×${MAX_SIZE}` : `Scale to ${canvasW * f}×${canvasH * f}`}
                          >
                            <span className="font-semibold">×{f}</span>
                            <span className="block text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                              {canvasW * f}×{canvasH * f}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <input type="checkbox" checked={scaleCopy} onChange={(e) => setScaleCopy(e.target.checked)} className="accent-[var(--accent)]" />
                      Keep the original and make a scaled copy
                    </label>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => { setShowNewDialog(true); setMobilePanel(true); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs max-xl:whitespace-nowrap"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
              title="Start a new sprite"
            >
              <Plus className="w-3.5 h-3.5" />
              New sprite
            </button>
            <button
              onClick={() => setMobilePanel((v) => !v)}
              className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)", background: mobilePanel ? "var(--bg-hover)" : undefined }}
              aria-expanded={mobilePanel}
              title="Sprites, layers and links"
            >
              <PanelTopOpen className="w-3.5 h-3.5" />
              Sprites &amp; layers
            </button>
          </div>
          <div className="flex items-center gap-1.5 max-xl:shrink-0">
            <UndoRedoButtons history={imports.history} />
            <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
            <SaveIndicator state={touched ? saveState : "saved"} />
            <HelpButton topic="pixel-art" />
          </div>
        </div>
        <ImportMenu imports={askFirstImports} />
        <ExportMenu
          items={[
            { label: "PNG (current frame)", description: `Frame ${activeFrame + 1} at ${canvasW}×${canvasH}`, onClick: exportPNG },
            { label: "Sprite sheet PNG (all frames)", description: `${frames.length} frame${frames.length === 1 ? "" : "s"} in a grid`, onClick: exportSpriteSheet },
            { label: "Sprite sheet JSON (Aseprite)", description: "Frame positions, durations and tags; save it next to the sheet PNG", onClick: exportSheetJson },
            { label: "Animated GIF", description: "All frames, loops, 4× size", onClick: () => exportGif(4) },
            { label: "Animated GIF (1× size)", description: `All frames, loops, ${canvasW}×${canvasH}`, onClick: () => exportGif(1) },
            ...frameTags.map((tag) => ({
              label: `GIF: ${tag.name} (frames ${tag.from + 1}–${tag.to + 1})`,
              description: `The "${tag.name}" tag, ${ANIMATION_DIRECTIONS.find((d) => d.value === tag.direction)?.label.toLowerCase()}, 4× size`,
              onClick: () => exportGif(4, tag),
            })),
          ]}
        />
      </div>

      {/* Phones: sprites, layers and links in a drawer under the toolbar */}
      {mobilePanel && (
        <div className="md:hidden shrink-0 max-h-[50dvh] overflow-y-auto p-2 space-y-2 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          {spritesPanel}
          {layersPanel}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden max-md:flex-col">
        {/* Left panel: sprites + tools + palette (phones: one scrolling row of tools, the colour panel opens below it) */}
        <div className="w-52 shrink-0 flex flex-col gap-2 p-2 overflow-y-auto border-r max-md:w-full max-md:gap-1.5 max-md:p-1.5 max-md:max-h-[45dvh] max-md:border-r-0 max-md:border-b" style={{ borderColor: "var(--border)" }}>
          <div className="max-md:hidden">{spritesPanel}</div>

          {/* Tools */}
          <div style={panelStyle} className="max-md:shrink-0 max-md:flex max-md:items-center max-md:gap-1 max-md:overflow-x-auto max-md:p-1!">
            <div className="text-xs font-medium mb-2 max-md:hidden" style={{ color: "var(--text-secondary)" }}>Tools</div>
            <button
              onClick={() => { setShowColourPanel(!showColourPanel); setShowFrames(false); }}
              className="md:hidden! shrink-0 flex items-center gap-1"
              style={btnStyle(showColourPanel)}
              title={showColourPanel ? "Hide colours" : "Show colours"}
              aria-label={showColourPanel ? "Hide colours" : "Show colours"}
              aria-expanded={showColourPanel}
            >
              <span className="w-4 h-4 rounded-sm border" style={{ background: color, borderColor: "var(--border)" }} />
              {showColourPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <div className="grid grid-cols-4 gap-1 max-md:flex max-md:shrink-0">
              {(Object.keys(TOOL_META) as Tool[]).map((t) => {
                const { icon: Icon, label, key } = TOOL_META[t];
                return (
                  <button key={t} onClick={() => setTool(t)} style={btnStyle(tool === t)} title={`${label} (${key})`} aria-label={`${label} (${key})`} aria-pressed={tool === t}>
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2 max-md:mt-0 max-md:gap-1 max-md:shrink-0">
              <button onClick={() => setShowGrid(!showGrid)} style={btnStyle(showGrid)} title="Show grid" aria-label="Show grid" aria-pressed={showGrid}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setOnionSkin(!onionSkin)} style={btnStyle(onionSkin)} title="Show previous frame faded" aria-label="Show previous frame faded" aria-pressed={onionSkin}>
                <Layers className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom((z) => Math.min(40, z + 2))} style={btnStyle()} title="Zoom in" aria-label="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom((z) => Math.max(2, z - 2))} style={btnStyle()} title="Zoom out" aria-label="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Color */}
          <div style={panelStyle} className={`max-md:shrink-0 ${showColourPanel ? "" : "max-md:hidden"}`}>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Colour</div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 shrink-0 rounded border" style={{ background: color, borderColor: "var(--border)" }} />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 shrink-0 cursor-pointer"
                style={{ background: "transparent", border: "none" }}
                aria-label="Pick any colour"
                title="Pick any colour"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="min-w-0 w-full flex-1 text-xs px-2 py-1 rounded outline-none font-mono"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                aria-label="Colour hex code"
              />
            </div>
            <div className="flex items-center gap-1 mb-1.5">
              <select
                value={paletteSource}
                onChange={(e) => choosePalette(e.target.value)}
                className="min-w-0 flex-1 text-xs px-1.5 py-1 rounded outline-none"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                aria-label="Palette"
                title="Swap the swatches for one of your project palettes"
              >
                <option value="default">Default colours</option>
                {projectPalettes.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <Link href={`/project/${projectId}/palettes`} className="block text-[11px] mb-2 hover:underline" style={{ color: "var(--text-secondary)" }}>
              Manage palettes →
            </Link>
            <div className="flex flex-wrap gap-1">
              {palette.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setColor(c)}
                  className="w-5 h-5 rounded-sm border"
                  style={{
                    background: c,
                    borderColor: color === c ? "var(--accent)" : "var(--border)",
                    outline: color === c ? "1px solid var(--accent)" : "none",
                  }}
                  title={c}
                  aria-label={`Colour ${c}`}
                />
              ))}
              <button
                onClick={() => {
                  if (!palette.includes(color)) setPalette([...palette, color]);
                }}
                className="w-5 h-5 rounded-sm flex items-center justify-center"
                style={{ border: "1px dashed var(--border)", color: "var(--text-secondary)" }}
                title="Add current colour to the swatches"
                aria-label="Add current colour to the swatches"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Tablets: layers move here from the right column so the canvas gets the width */}
          <div className="hidden md:max-xl:block">{layersPanel}</div>
        </div>

        {/* Center: canvas */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-4 max-md:p-2 min-h-0">
          <canvas
            ref={canvasRef}
            onPointerDown={handleMouseDown}
            onPointerMove={handleMouseMove}
            onPointerUp={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onWheel={handleWheel}
            className="pixel-grid"
            style={{ cursor: tool === "move" ? "grab" : "crosshair", imageRendering: "pixelated", touchAction: "none" }}
          />
        </div>

        {/* Right panel: layers */}
        <div className="w-48 shrink-0 flex flex-col gap-2 p-2 overflow-y-auto border-l max-xl:hidden" style={{ borderColor: "var(--border)" }}>
          {layersPanel}
        </div>
      </div>

      {/* Bottom: animation timeline */}
      <div
        className="shrink-0 border-t px-4 pt-2 pb-2.5 max-md:px-3"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className={`flex items-center gap-3 mb-1.5 flex-wrap ${showFrames ? "" : "max-md:mb-0"}`}>
          <div className="flex items-center gap-1.5">
            <Film className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Animation</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {frames.length} frame{frames.length === 1 ? "" : "s"}
            </span>
          </div>
          <span className="text-xs hidden lg:inline" style={{ color: "var(--text-muted)" }}>
            Each box is one frame. Draw a frame, add the next one, then press Preview to play them in order.
          </span>
          <div className={`ml-auto flex items-center gap-3 ${showFrames ? "" : "max-md:hidden"}`}>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--text-secondary)" }} title="Shows the previous frame faded behind the current one, so the next frame is easy to line up">
              <input type="checkbox" checked={onionSkin} onChange={(e) => setOnionSkin(e.target.checked)} className="accent-[var(--accent)]" />
              Show previous frame
            </label>
            {onionSkin && (
              <input
                type="range"
                min={10}
                max={70}
                value={Math.round(onionOpacity * 100)}
                onChange={(e) => setOnionOpacity(Number(e.target.value) / 100)}
                className="w-20 accent-[var(--accent)]"
                title={`Previous frame opacity: ${Math.round(onionOpacity * 100)}%`}
                aria-label="Previous frame opacity"
              />
            )}
          </div>
          <button
            onClick={() => { setShowFrames(!showFrames); setShowColourPanel(false); }}
            className={`md:hidden flex items-center gap-1 px-2.5 py-1 rounded-md text-xs ${showFrames ? "" : "ml-auto"}`}
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            aria-expanded={showFrames}
          >
            {showFrames ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            {showFrames ? "Hide frames" : "Show frames"}
          </button>
        </div>

        {editingTag && (
          <TagEditor
            tag={editingTag}
            frameCount={frames.length}
            className={showFrames ? "" : "max-md:hidden"}
            onChange={(patch, commit) => updateTag(editingTag.id, patch, commit)}
            onCommit={() => pushHistory(frames, activeFrame, activeLayer)}
            onDelete={() => deleteTag(editingTag.id)}
            onClose={() => setEditingTagId(null)}
          />
        )}

        <div className={`flex items-center gap-3 max-md:flex-wrap max-md:gap-2 ${showFrames ? "" : "max-md:hidden"}`}>
          <div className="flex items-center gap-2 shrink-0 max-md:flex-wrap max-md:basis-full">
            <button
              onClick={togglePreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
              style={{ background: playing ? "var(--red)" : "var(--accent)", color: playing ? "#fff" : "var(--on-accent, #fff)" }}
              title={playing ? "Stop the preview" : previewTag ? `Play the "${previewTag.name}" tag in a loop` : "Play all frames in a loop"}
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? "Stop" : "Preview"}
            </button>
            {frameTags.length > 0 && (
              <select
                value={previewTag?.id ?? ""}
                onChange={(e) => { setPreviewTagId(e.target.value); setPlayStep(0); }}
                className="max-w-28 text-xs px-1 py-0.5 rounded outline-none"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                aria-label="What the preview plays"
                title="Play every frame, or just one tag"
              >
                <option value="">All frames</option>
                {frameTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }} title="Sets every frame to this many frames per second">
              Speed
              <input
                type="number"
                min={1}
                max={30}
                value={fps}
                onChange={(e) => changeFps(Number(e.target.value))}
                className="w-10 text-xs px-1 py-0.5 rounded outline-none text-center"
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
              fps
            </label>
            <FrameDurationInput
              key={`${selectedIndices.join(",")}:${selectedDuration ?? "mixed"}`}
              duration={selectedDuration}
              frameCount={selectedIndices.length}
              onCommit={(ms) => setDurations(selectedIndices, ms)}
            />
          </div>

          <div className="flex-1 overflow-x-auto py-1 max-md:order-last max-md:basis-full max-md:min-w-0">
            {frameTags.length > 0 && (
              <div className="relative mb-1" style={{ width: frames.length * FRAME_SLOT - 6, height: (Math.max(...lanes) + 1) * TAG_LANE }}>
                {frameTags.map((tag, i) => {
                  const DirectionIcon = DIRECTION_ICONS[tag.direction];
                  return (
                    <button
                      key={tag.id}
                      onClick={() => setEditingTagId(editingTagId === tag.id ? null : tag.id)}
                      className="absolute flex items-center gap-1 px-1.5 rounded-sm text-[10px] font-medium overflow-hidden whitespace-nowrap"
                      style={{
                        left: tag.from * FRAME_SLOT,
                        width: (tag.to - tag.from + 1) * FRAME_SLOT - 6,
                        top: lanes[i] * TAG_LANE,
                        height: TAG_LANE - 2,
                        background: tag.color,
                        color: TAG_TEXT_COLOR,
                        outline: editingTagId === tag.id ? "2px solid var(--text-primary)" : undefined,
                      }}
                      title={`${tag.name}: frames ${tag.from + 1}–${tag.to + 1}. Click to edit.`}
                      aria-label={`Edit tag ${tag.name}`}
                      aria-pressed={editingTagId === tag.id}
                    >
                      <DirectionIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-1.5 w-max">
              {frames.map((frame, i) => {
                const current = (playing ? previewFrame : activeFrame) === i;
                const selected = !playing && selectedIndices.length > 1 && selectedIndices.includes(i);
                return (
                  <button
                    key={frame.id}
                    onClick={(e) => clickFrame(i, e)}
                    className="shrink-0 w-14 h-14 rounded border relative overflow-hidden"
                    style={{
                      background: "repeating-conic-gradient(#1a1a2a 0% 25%, #222238 0% 50%) 0 0 / 8px 8px",
                      borderColor: current || selected ? "var(--accent)" : "var(--border)",
                      boxShadow: current ? "0 0 0 1px var(--accent)" : undefined,
                      borderStyle: selected && !current ? "dashed" : undefined,
                    }}
                    title={`Frame ${i + 1}, ${frame.duration} ms. Shift-click or Ctrl-click to select several.`}
                    aria-label={`Frame ${i + 1}, ${frame.duration} ms`}
                    aria-pressed={selected || current}
                    {...menuTriggerProps(() => frameMenuEntries(i), `Frame ${i + 1}`)}
                  >
                    {frame.layers.filter((l) => l.visible).map((l) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={l.id} src={l.pixels} alt="" className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] object-contain" style={{ imageRendering: "pixelated" }} />
                    ))}
                    <span className="absolute top-0 left-0 px-1 text-[9px] rounded-br tabular-nums" style={{ background: "rgba(0,0,0,0.6)", color: "var(--text-secondary)" }}>
                      {frame.duration}ms
                    </span>
                    <span className="absolute bottom-0 right-0 px-1 text-[9px] rounded-tl" style={{ background: "rgba(0,0,0,0.6)", color: "var(--text-secondary)" }}>
                      {i + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={addFrame} className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }} title="Add an empty frame at the end" aria-label="New frame">
              <FilePlus className="w-3.5 h-3.5" /> <span className="md:max-xl:hidden">New frame</span>
            </button>
            <button onClick={() => duplicateFrame()} className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }} title="Copy the selected frame, a quick way to make the next pose" aria-label="Duplicate frame">
              <Copy className="w-3.5 h-3.5" /> <span className="md:max-xl:hidden">Duplicate</span>
            </button>
            <button onClick={() => deleteFrame()} disabled={frames.length <= 1} className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs disabled:opacity-40" style={{ color: "var(--red)", border: "1px solid var(--border)" }} title="Delete the selected frame" aria-label="Delete frame">
              <Trash2 className="w-3.5 h-3.5" /> <span className="md:max-xl:hidden">Delete</span>
            </button>
            <button onClick={addTag} className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }} title="Name the selected frames as one animation, like idle or walk" aria-label="New tag">
              <Tag className="w-3.5 h-3.5" /> <span className="md:max-xl:hidden">Tag</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
