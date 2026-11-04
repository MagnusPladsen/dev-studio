"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Paintbrush,
  Eraser,
  PaintBucket,
  Grid3X3,
  Layers,
  ChevronUp,
  ChevronDown,
  X,
  BrickWall,
  Square,
  PanelTop,
  SquareDashed,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { getLoadedImage, preloadImages, spriteFrameSrc } from "@/lib/pixels";
import { useConsumedParam, useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { ExportMenu } from "@/components/ExportMenu";
import { ImportMenu } from "@/components/ImportMenu";
import { ImportDropZone } from "@/components/ImportDropZone";
import { HelpButton } from "@/components/HelpButton";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { useHistory } from "@/hooks/useHistory";
import { useAutosave } from "@/hooks/useAutosave";
import { useImport } from "@/hooks/useImport";
import { importAsNewAssets, saveImportedAssets, type ImportStep } from "@/lib/import";
import { TILEMAP_IMPORTERS, type TilemapImport } from "@/lib/import/tilemap";
import { BASIC_TILES, toTiledJson } from "@/lib/tilemap/tiled-export";
import { eraseWithTerrains, paintTerrain } from "@/lib/tilemap/autotile";
import { COLLISION, collisionGrid, paintCollision, type CollisionValue } from "@/lib/tilemap/collision";
import { TerrainPanel } from "@/components/tilemap/TerrainPanel";
import type { TilemapData, TilemapLayer, TilemapTerrain, Sprite } from "@/types";
import { v4 as uuid } from "uuid";

type Tile = number | string | null;
type Tool = "paint" | "erase" | "fill" | "collision";

const TILE_SIZES = [8, 16, 32];

function createEmptyLayer(name: string, w: number, h: number): TilemapLayer {
  return { id: uuid(), name, visible: true, tiles: Array.from({ length: h }, () => new Array<Tile>(w).fill(null)) };
}

function referencedSprites(tm: TilemapData): string[] {
  const ids = new Set<string>();
  for (const layer of tm.layers) for (const row of layer.tiles) for (const t of row) if (typeof t === "string") ids.add(t);
  for (const terrain of tm.terrains ?? []) for (const t of Object.values(terrain.tiles)) if (typeof t === "string") ids.add(t);
  return [...ids];
}

function safeName(name: string): string {
  return name.trim().replace(/[^\w-]+/g, "_") || "tilemap";
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

function drawTilemap(
  ctx: CanvasRenderingContext2D,
  tm: TilemapData,
  spriteById: Map<string, Sprite>,
  opts: { grid: boolean; background: boolean; collision?: boolean; onImageReady?: () => void }
) {
  const ts = tm.tileSize;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, tm.width * ts, tm.height * ts);
  if (opts.background) {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, tm.width * ts, tm.height * ts);
  }

  for (const layer of tm.layers) {
    if (!layer.visible) continue;
    for (let r = 0; r < tm.height; r++) {
      for (let c = 0; c < tm.width; c++) {
        const tile = layer.tiles[r]?.[c];
        if (tile === null || tile === undefined) continue;
        if (typeof tile === "number") {
          ctx.fillStyle = BASIC_TILES[tile % BASIC_TILES.length];
          ctx.fillRect(c * ts, r * ts, ts, ts);
          continue;
        }
        const sprite = spriteById.get(tile);
        const src = sprite && spriteFrameSrc(sprite, 0);
        if (!src) {
          ctx.strokeStyle = "rgba(248,113,113,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(c * ts + 2, r * ts + 2);
          ctx.lineTo(c * ts + ts - 2, r * ts + ts - 2);
          ctx.moveTo(c * ts + ts - 2, r * ts + 2);
          ctx.lineTo(c * ts + 2, r * ts + ts - 2);
          ctx.stroke();
          continue;
        }
        const img = getLoadedImage(src, opts.onImageReady);
        if (img) ctx.drawImage(img, c * ts, r * ts, ts, ts);
      }
    }
  }

  if (opts.collision) drawCollision(ctx, tm);

  if (opts.grid) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= tm.height; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * ts);
      ctx.lineTo(tm.width * ts, r * ts);
      ctx.stroke();
    }
    for (let c = 0; c <= tm.width; c++) {
      ctx.beginPath();
      ctx.moveTo(c * ts, 0);
      ctx.lineTo(c * ts, tm.height * ts);
      ctx.stroke();
    }
  }
}

/** Solid cells as red boxes, one-way platforms as a blue band along their top edge. */
function drawCollision(ctx: CanvasRenderingContext2D, tm: TilemapData) {
  const ts = tm.tileSize;
  collisionGrid(tm).forEach((row, r) =>
    row.forEach((value, c) => {
      if (value === COLLISION.solid) {
        ctx.fillStyle = "rgba(239,68,68,0.35)";
        ctx.fillRect(c * ts, r * ts, ts, ts);
        ctx.strokeStyle = "rgba(239,68,68,0.9)";
        ctx.lineWidth = 1;
        ctx.strokeRect(c * ts + 0.5, r * ts + 0.5, ts - 1, ts - 1);
      } else if (value === COLLISION.oneWay) {
        ctx.fillStyle = "rgba(56,189,248,0.85)";
        ctx.fillRect(c * ts, r * ts, ts, Math.max(2, ts / 4));
      }
    })
  );
}

const COLLISION_BRUSHES: { value: CollisionValue; label: string; Icon: typeof Square }[] = [
  { value: COLLISION.solid, label: "Solid", Icon: Square },
  { value: COLLISION.oneWay, label: "One-way platform", Icon: PanelTop },
  { value: COLLISION.empty, label: "Clear collision", Icon: SquareDashed },
];

const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };
const secondaryBtn = { color: "var(--text-primary)", border: "1px solid var(--border)" };

export default function TilemapPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const version = useStorageVersion();

  const [current, setCurrent] = useState<TilemapData | null>(null);
  const [selectedTile, setSelectedTile] = useState<number | string>(0);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [tool, setTool] = useState<Tool>("paint");
  // painting with a terrain (auto-tile) instead of the selected tile
  const [activeTerrainId, setActiveTerrainId] = useState<string | null>(null);
  const [collisionBrush, setCollisionBrush] = useState<CollisionValue>(COLLISION.solid);
  const [showCollision, setShowCollision] = useState(false);
  const lastCell = useRef<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(20);
  const [newHeight, setNewHeight] = useState(15);
  const [newTileSize, setNewTileSize] = useState(16);
  const [isPainting, setIsPainting] = useState(false);
  const [redrawTick, setRedrawTick] = useState(0);
  // phones only: which side panel is open (desktop always shows both)
  const [mobilePanel, setMobilePanel] = useState<"tiles" | "layers" | null>("tiles");

  const sprites = useMemo(
    () => storage.getAll("sprites", projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, version]
  );
  const spriteById = useMemo(() => new Map(sprites.map((s) => [s.id, s])), [sprites]);

  const tilemaps = useMemo(
    () => storage.getAll("tilemaps", projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, version]
  );

  useOpenParam((id) => {
    const tm = storage.getById("tilemaps", id, projectId);
    if (tm) selectTilemap(tm);
  });
  useConsumedParam("tile", (spriteId) => pickTile(spriteId));
  useTrackOpenAsset(current?.id ? { type: "tilemap", id: current?.id } : null);

  const requestRedraw = useCallback(() => setRedrawTick((t) => t + 1), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = current.width * current.tileSize;
    canvas.height = current.height * current.tileSize;
    drawTilemap(ctx, current, spriteById, { grid: true, background: true, collision: showCollision || tool === "collision", onImageReady: requestRedraw });
  }, [current, spriteById, redrawTick, requestRedraw, showCollision, tool]);

  const persist = useCallback(
    (tm: TilemapData | null) => {
      // a map deleted while a save was pending must not come back
      if (!tm || !storage.getById("tilemaps", tm.id, projectId)) return;
      storage.save("tilemaps", { ...tm, tilesetSpriteIds: referencedSprites(tm), updatedAt: new Date().toISOString() }, projectId);
    },
    [projectId]
  );

  // Saves a moment after the last change; waits until a paint stroke is finished.
  const autosave = useAutosave(current, persist, { resetKey: current?.id, enabled: !!current && !isPainting });
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

  function selectTilemap(tm: TilemapData) {
    setCurrent(tm);
    setSelectedLayer(0);
    setActiveTerrainId(null);
    setMobilePanel(null);
  }

  function pickTile(tile: number | string) {
    setSelectedTile(tile);
    setActiveTerrainId(null);
    if (tool === "erase" || tool === "collision") setTool("paint");
  }

  function activateTerrain(terrainId: string) {
    setActiveTerrainId(terrainId);
    if (tool === "erase" || tool === "collision") setTool("paint");
  }

  function setTerrains(terrains: TilemapTerrain[]) {
    if (!current) return;
    update({ ...current, terrains });
    if (activeTerrainId && !terrains.some((t) => t.id === activeTerrainId)) setActiveTerrainId(null);
  }

  function update(tm: TilemapData) {
    setCurrent(tm);
  }

  // While a stroke is in progress, history sees the map as it was when the stroke began,
  // so the whole stroke (pointerdown → pointerup) becomes one undo step.
  const [strokeBase, setStrokeBase] = useState<TilemapData | null>(null);
  const history = useHistory(
    isPainting ? strokeBase : current,
    (tm) => {
      if (!tm) return;
      update(tm);
      setSelectedLayer((l) => Math.min(l, tm.layers.length - 1));
    },
    current?.id
  );

  const imports = useImport<TilemapImport>({
    importers: TILEMAP_IMPORTERS,
    noun: ["tilemap", "tilemaps"],
    history,
    openId: current?.id ?? null,
    apply: ({ items }) => importTilemaps(items),
  });

  /** Saves the maps and the sprites cut from their tilesets, and opens the first map; undo removes them all. */
  function importTilemaps(items: TilemapImport[]): ImportStep {
    const savedSprites = saveImportedAssets("sprites", projectId, items.flatMap((item) => item.sprites));
    const step = importAsNewAssets("tilemaps", projectId, items.map((item) => item.tilemap), {
      previousId: current?.id ?? null,
      open: selectTilemap,
      back: (previous) => (previous ? selectTilemap(previous) : setCurrent(null)),
    });
    return {
      openedId: step.openedId,
      undo() {
        step.undo();
        savedSprites.remove();
      },
      redo() {
        savedSprites.restore();
        step.redo();
      },
    };
  }

  const defaultName = () => `Level ${tilemaps.length + 1}`;

  function openNewForm() {
    setNewName(defaultName());
    setShowNew(true);
    setMobilePanel("tiles");
  }

  function createTilemap(opts?: { name?: string; width?: number; height?: number; tileSize?: number }) {
    const w = Math.max(1, Math.min(256, opts?.width ?? (newWidth || 1)));
    const h = Math.max(1, Math.min(256, opts?.height ?? (newHeight || 1)));
    const now = new Date().toISOString();
    const tm: TilemapData = {
      id: uuid(),
      projectId,
      name: (opts?.name ?? newName).trim() || defaultName(),
      width: w,
      height: h,
      tileSize: opts?.tileSize ?? newTileSize,
      layers: [createEmptyLayer("Ground", w, h)],
      tilesetSpriteIds: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    storage.save("tilemaps", tm, projectId);
    selectTilemap(tm);
    setShowNew(false);
    setNewName("");
  }

  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas || !current) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / current.tileSize);
    const y = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / current.tileSize);
    if (x < 0 || x >= current.width || y < 0 || y >= current.height) return null;
    return { x, y };
  }

  function setLayerTiles(tiles: Tile[][]) {
    if (!current) return;
    update({ ...current, layers: current.layers.map((l, i) => (i === selectedLayer ? { ...l, tiles } : l)) });
  }

  const activeTerrain = current?.terrains?.find((t) => t.id === activeTerrainId) ?? null;

  function paintAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const cell = cellFromEvent(e);
    const layer = current?.layers[selectedLayer];
    if (!cell || !layer || !current) return;
    // a stroke paints each cell once, so auto-tiling doesn't redo a cell the pointer is still on
    const key = `${cell.x},${cell.y}`;
    if (lastCell.current === key) return;
    lastCell.current = key;
    if (tool === "collision") {
      const grid = collisionGrid(current);
      const next = paintCollision(grid, [[cell.x, cell.y]], collisionBrush);
      if (next !== grid) update({ ...current, collision: next });
      return;
    }
    if (tool === "erase") {
      if (layer.tiles[cell.y][cell.x] !== null) setLayerTiles(eraseWithTerrains(layer.tiles, current.terrains ?? [], [[cell.x, cell.y]]));
      return;
    }
    if (activeTerrain) {
      setLayerTiles(paintTerrain(layer.tiles, activeTerrain, [[cell.x, cell.y]]));
      return;
    }
    if (layer.tiles[cell.y][cell.x] === selectedTile) return;
    const tiles = layer.tiles.map((row) => [...row]);
    tiles[cell.y][cell.x] = selectedTile;
    setLayerTiles(tiles);
  }

  function fillAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const cell = cellFromEvent(e);
    const layer = current?.layers[selectedLayer];
    if (!cell || !layer || !current) return;
    const target = layer.tiles[cell.y][cell.x];
    const value: Tile = selectedTile;
    if (!activeTerrain && target === value) return;
    const tiles = layer.tiles.map((row) => [...row]);
    const seen = new Set<string>();
    const area: [number, number][] = [];
    const stack = [[cell.x, cell.y]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= current.width || y >= current.height || tiles[y][x] !== target || seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`);
      area.push([x, y]);
      tiles[y][x] = value;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    setLayerTiles(activeTerrain ? paintTerrain(layer.tiles, activeTerrain, area) : tiles);
  }

  function endStroke() {
    setIsPainting(false);
    lastCell.current = null;
  }

  function deleteTilemap(id: string) {
    if (!confirm("Delete this tilemap?")) return;
    storage.delete("tilemaps", id, projectId);
    if (current?.id === id) setCurrent(null);
  }

  function addLayer() {
    if (!current) return;
    const layers = [...current.layers, createEmptyLayer(`Layer ${current.layers.length + 1}`, current.width, current.height)];
    update({ ...current, layers });
    setSelectedLayer(layers.length - 1);
  }

  function deleteLayer(i: number) {
    if (!current || current.layers.length <= 1) return;
    update({ ...current, layers: current.layers.filter((_, idx) => idx !== i) });
    setSelectedLayer(Math.max(0, Math.min(selectedLayer, current.layers.length - 2)));
  }

  function toggleLayerVisibility(i: number) {
    if (!current) return;
    update({ ...current, layers: current.layers.map((l, idx) => (idx === i ? { ...l, visible: !l.visible } : l)) });
  }

  function moveLayer(i: number, dir: -1 | 1) {
    if (!current) return;
    const j = i + dir;
    if (j < 0 || j >= current.layers.length) return;
    const layers = [...current.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    update({ ...current, layers });
    setSelectedLayer(j);
  }

  async function exportPNG() {
    if (!current) return;
    const srcs = referencedSprites(current)
      .map((id) => spriteById.get(id))
      .map((s) => (s ? spriteFrameSrc(s, 0) : undefined))
      .filter((s): s is string => !!s);
    await preloadImages(srcs);
    const c = document.createElement("canvas");
    c.width = current.width * current.tileSize;
    c.height = current.height * current.tileSize;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawTilemap(ctx, current, spriteById, { grid: false, background: false });
    download(c.toDataURL("image/png"), `${safeName(current.name)}.png`);
  }

  function exportJSON() {
    if (!current) return;
    const data = toTiledJson(current, (id) => spriteById.get(id)?.name);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    download(url, `${safeName(current.name)}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const toolBtn = (t: Tool, Icon: typeof Paintbrush, title: string) => (
    <button
      onClick={() => setTool(t)}
      disabled={!current}
      className="p-1.5 rounded disabled:opacity-40"
      style={{ background: tool === t && current ? "var(--accent)" : "transparent", color: tool === t && current ? "white" : "var(--text-secondary)" }}
      title={title}
      aria-label={title}
      aria-pressed={tool === t}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  const mobileToggle = (panel: "tiles" | "layers", label: string, Icon: typeof Layers) => (
    <button
      onClick={() => setMobilePanel((p) => (p === panel ? null : panel))}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
      style={{
        ...secondaryBtn,
        background: mobilePanel === panel ? "var(--bg-hover)" : "transparent",
      }}
      aria-expanded={mobilePanel === panel}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div ref={rootRef} className="relative flex max-md:flex-col h-full max-md:h-auto max-md:min-h-full" style={{ background: "var(--bg-primary)" }}>
      <ImportDropZone imports={imports} target={rootRef} />
      {/* Phones: toggles for the side panels */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
        {mobileToggle("tiles", "Maps & tiles", Grid3X3)}
        {current && mobileToggle("layers", "Layers & links", Layers)}
      </div>

      {/* Left panel */}
      <div
        className={`w-56 max-md:w-full shrink-0 border-r max-md:border-r-0 max-md:border-b flex-col overflow-y-auto max-md:max-h-[55vh] ${
          mobilePanel === "tiles" ? "flex" : "max-md:hidden flex"
        }`}
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Tilemaps</span>
            <div className="flex items-center gap-1">
              <PasteButton type="tilemap" />
              <button onClick={openNewForm} className="p-1 rounded" style={{ color: "var(--accent)" }} title="New tilemap" aria-label="New tilemap">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {showNew && (
            <div className="space-y-1.5 mb-2">
              <input
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTilemap()}
                className="w-full px-2 py-1 rounded text-xs outline-none"
                style={inputStyle}
                aria-label="Tilemap name"
                autoFocus
              />
              <div className="flex gap-1 items-center text-xs" style={{ color: "var(--text-muted)" }}>
                <input type="number" min={1} max={256} value={newWidth} onChange={(e) => setNewWidth(+e.target.value)} className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} title="Width in tiles" aria-label="Width in tiles" />
                ×
                <input type="number" min={1} max={256} value={newHeight} onChange={(e) => setNewHeight(+e.target.value)} className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} title="Height in tiles" aria-label="Height in tiles" />
              </div>
              <select value={newTileSize} onChange={(e) => setNewTileSize(+e.target.value)} className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} aria-label="Tile size">
                {TILE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}×{s} px tiles</option>
                ))}
              </select>
              <div className="flex gap-1">
                <button onClick={() => createTilemap()} className="flex-1 px-2 py-1 rounded text-xs font-medium" style={{ background: "var(--accent)", color: "white" }}>Create</button>
                <button onClick={() => setShowNew(false)} className="px-2 py-1 rounded text-xs" style={secondaryBtn}>Cancel</button>
              </div>
            </div>
          )}
          <div {...pasteTriggerProps("tilemap")} className="space-y-0.5">
            {tilemaps.map((tm) => (
              <div
                key={tm.id}
                {...assetTriggerProps({ type: "tilemap", id: tm.id })}
                {...rowButtonProps(() => assetTriggerProps({ type: "tilemap", id: tm.id }))}
                className="group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer"
                style={{ background: current?.id === tm.id ? "var(--bg-hover)" : "transparent", color: "var(--text-primary)" }}
                onClick={() => selectTilemap(tm)}
              >
                <span className="truncate">{tm.name}</span>
                <div className="flex items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTilemap(tm.id); }}
                    className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                    style={{ color: "var(--red)" }}
                    title={`Delete ${tm.name}`}
                    aria-label={`Delete ${tm.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <AssetPinButton asset={{ type: "tilemap", id: tm.id }} label={tm.name} />
                  <AssetMenuButton asset={{ type: "tilemap", id: tm.id }} label={tm.name} />
                </div>
              </div>
            ))}
          </div>
          <ExamplesBar projectId={projectId} collections={["tilemaps"]} className="mt-3" />
        </div>

        {current && (
          <TerrainPanel
            terrains={current.terrains ?? []}
            activeTerrainId={activeTerrain?.id ?? null}
            selectedTile={selectedTile}
            spriteById={spriteById}
            onActivate={activateTerrain}
            onChange={setTerrains}
          />
        )}

        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>Your sprites</span>
          {sprites.length === 0 ? (
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              No sprites yet. Draw tiles in{" "}
              <Link href={`/project/${projectId}/pixel-art`} className="underline" style={{ color: "var(--accent)" }}>Pixel Art</Link>{" "}
              and they show up here.
            </p>
          ) : (
            <div className="grid grid-cols-4 max-md:grid-cols-8 gap-1">
              {sprites.map((s) => {
                const src = spriteFrameSrc(s, 0);
                const active = !activeTerrain && selectedTile === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => pickTile(s.id)}
                    className="w-full aspect-square rounded flex items-center justify-center overflow-hidden"
                    style={{
                      background: "repeating-conic-gradient(#1a1a2e 0% 25%, #222238 0% 50%) 0 0 / 8px 8px",
                      outline: active ? "2px solid var(--accent)" : "1px solid var(--border)",
                      outlineOffset: active ? "1px" : "0",
                    }}
                    title={s.name}
                    aria-label={`Paint with ${s.name}`}
                    aria-pressed={active}
                    {...assetTriggerProps({ type: "sprite", id: s.id })}
                  >
                    {src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3">
          <span className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>Basic tiles</span>
          <div className="grid grid-cols-4 max-md:grid-cols-8 gap-1">
            {BASIC_TILES.map((color, i) => (
              <button
                key={i}
                className="w-full aspect-square rounded"
                style={{
                  background: color,
                  outline: !activeTerrain && selectedTile === i ? "2px solid var(--accent)" : "1px solid var(--border)",
                  outlineOffset: !activeTerrain && selectedTile === i ? "1px" : "0",
                }}
                onClick={() => pickTile(i)}
                title={color}
                aria-label={`Paint with colour ${color}`}
                aria-pressed={!activeTerrain && selectedTile === i}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex-1 flex flex-col overflow-hidden max-md:min-h-[60vh]">
        <div className="h-10 flex items-center gap-2 px-3 border-b shrink-0 max-md:h-auto max-md:min-h-10 max-md:py-1.5 max-md:flex-wrap max-md:gap-y-1.5 md:max-xl:h-auto md:max-xl:min-h-10 md:max-xl:py-1.5 md:max-xl:flex-wrap md:max-xl:gap-y-1.5" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto [&>*]:shrink-0">
            <UndoRedoButtons history={imports.history} />
            <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />
            {toolBtn("paint", Paintbrush, "Paint")}
            {toolBtn("fill", PaintBucket, "Fill area")}
            {toolBtn("erase", Eraser, "Erase")}
            {toolBtn("collision", BrickWall, "Paint collision")}
            {tool === "collision" && current && (
              <div className="flex items-center rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }} role="group" aria-label="Collision brush">
                {COLLISION_BRUSHES.map((brush) => (
                  <button
                    key={brush.value}
                    onClick={() => setCollisionBrush(brush.value)}
                    className="p-1.5"
                    style={{ background: collisionBrush === brush.value ? "var(--bg-hover)" : "transparent", color: "var(--text-primary)" }}
                    title={brush.label}
                    aria-label={brush.label}
                    aria-pressed={collisionBrush === brush.value}
                  >
                    <brush.Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {current && (
              <>
                <span className="text-xs max-xl:hidden" style={{ color: "var(--text-muted)" }}>
                  {current.width}×{current.height} tiles · {current.tileSize}px
                </span>
                <SaveIndicator state={autosave.state} />
                <button
                  onClick={() => setMobilePanel((p) => (p === "layers" ? null : "layers"))}
                  className="hidden md:max-xl:flex p-1.5 rounded-md"
                  style={{ ...secondaryBtn, background: mobilePanel === "layers" ? "var(--bg-hover)" : "transparent" }}
                  title="Layers & links"
                  aria-label="Layers & links"
                  aria-expanded={mobilePanel === "layers"}
                >
                  <Layers className="w-4 h-4" />
                </button>
              </>
            )}
            <HelpButton topic="tilemap" />
            <ImportMenu imports={imports} />
            <ExportMenu
              disabled={!current}
              items={[
                { label: "PNG (whole map)", description: "One image of every visible layer, no grid", onClick: exportPNG },
                { label: "JSON (Tiled-style layers)", description: "Layers as tile-id arrays, a tileset table, terrains and a Collision object layer", onClick: exportJSON },
              ]}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {current ? (
            <canvas
              ref={canvasRef}
              className="border cursor-crosshair xl:min-w-[var(--canvas-min-w)]"
              style={
                {
                  borderColor: "var(--border)",
                  imageRendering: "pixelated",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  touchAction: "none",
                  "--canvas-min-w": `${Math.min(current.width * current.tileSize * 2, 960)}px`,
                } as React.CSSProperties
              }
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if (tool === "fill") {
                  fillAt(e);
                  return;
                }
                e.currentTarget.setPointerCapture(e.pointerId);
                setStrokeBase(current);
                setIsPainting(true);
                paintAt(e);
              }}
              onPointerMove={(e) => isPainting && paintAt(e)}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onLostPointerCapture={endStroke}
            />
          ) : (
            <div className="text-center max-w-xs" style={{ color: "var(--text-muted)" }}>
              <Grid3X3 className="w-12 h-12 mx-auto mb-3" />
              <p style={{ color: "var(--text-secondary)" }}>Paint levels with the sprites you drew.</p>
              <p className="text-xs mt-1 mb-4">Pick a tilemap on the left, or start a new one.</p>
              <button
                onClick={() => createTilemap({ name: defaultName(), width: 20, height: 15, tileSize: 16 })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                <Plus className="w-4 h-4" />
                New tilemap
              </button>
              <p className="text-[11px] mt-2">20×15 tiles of 16px. Use + on the left for other sizes.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      {current && (
        <div
          className={`w-56 max-md:w-full shrink-0 border-l max-md:border-l-0 max-md:border-t flex-col overflow-y-auto max-xl:shadow-2xl max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[60dvh] max-md:z-30 md:max-xl:absolute md:max-xl:inset-y-0 md:max-xl:right-0 md:max-xl:z-20 ${
            mobilePanel === "layers" ? "flex" : "max-xl:hidden flex"
          }`}
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                <Layers className="w-3 h-3" />
                Layers
              </span>
              <div className="flex items-center gap-1">
                <button onClick={addLayer} className="p-1 rounded" style={{ color: "var(--accent)" }} title="Add layer" aria-label="Add layer">
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setMobilePanel(null)}
                  className="xl:hidden p-1 rounded"
                  style={{ color: "var(--text-primary)" }}
                  title="Close layers & links"
                  aria-label="Close layers & links"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-0.5">
              {current.layers.map((layer, i) => (
                <div
                  key={layer.id}
                  className="group flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer"
                  style={{ background: selectedLayer === i ? "var(--bg-hover)" : "transparent", color: "var(--text-primary)" }}
                  onClick={() => setSelectedLayer(i)}
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
                  {current.layers.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLayer(i); }}
                      className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                      style={{ color: "var(--red)" }}
                      title="Delete layer"
                      aria-label={`Delete ${layer.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  <div className="flex flex-col">
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(i, -1); }} style={{ color: "var(--text-muted)" }} title="Move up" aria-label={`Move ${layer.name} up`}>
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(i, 1); }} style={{ color: "var(--text-muted)" }} title="Move down" aria-label={`Move ${layer.name} down`}>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="mt-2 pt-2 border-t flex items-center gap-1 px-2 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <button
                onClick={() => setShowCollision((v) => !v)}
                style={{ color: showCollision ? "var(--text-secondary)" : "var(--text-muted)" }}
                title={showCollision ? "Hide collision" : "Show collision"}
                aria-label={showCollision ? "Hide collision" : "Show collision"}
                aria-pressed={showCollision}
              >
                {showCollision ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button onClick={() => setTool("collision")} className="flex-1 flex items-center gap-1 text-left py-1" title="Paint collision">
                <BrickWall className="w-3 h-3" style={{ color: "var(--text-secondary)" }} />
                Collision
              </button>
            </div>
          </div>
          <div className="p-3">
            <LinkedAssets projectId={projectId} type="tilemap" id={current.id} layout="panel" />
          </div>
        </div>
      )}
    </div>
  );
}
