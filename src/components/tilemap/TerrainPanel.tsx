"use client";

import { useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { v4 as uuid } from "uuid";
import { spriteFrameSrc } from "@/lib/pixels";
import { BASIC_TILES } from "@/lib/tilemap/tiled-export";
import { FULL_MASK, describeMask, maskIncludes, terrainMasks, terrainTile } from "@/lib/tilemap/autotile";
import type { Sprite, TilemapTerrain } from "@/types";

type TileValue = number | string;

interface TerrainPanelProps {
  terrains: TilemapTerrain[];
  /** The terrain painting with, or null when painting single tiles. */
  activeTerrainId: string | null;
  /** The tile a slot gets when clicked: the one last picked in the palette. */
  selectedTile: TileValue;
  spriteById: Map<string, Sprite>;
  onActivate: (terrainId: string) => void;
  onChange: (terrains: TilemapTerrain[]) => void;
}

const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };
const CHECKER = "repeating-conic-gradient(#1a1a2e 0% 25%, #222238 0% 50%) 0 0 / 8px 8px";
const KIND_LABELS: Record<TilemapTerrain["kind"], string> = { edge16: "16 tiles (sides)", blob47: "47 tiles (sides + corners)" };

function tileBackground(tile: TileValue | null | undefined, spriteById: Map<string, Sprite>): string {
  if (typeof tile === "number") return BASIC_TILES[tile % BASIC_TILES.length];
  const sprite = typeof tile === "string" ? spriteById.get(tile) : undefined;
  const src = sprite && spriteFrameSrc(sprite, 0);
  return src ? `center / contain no-repeat url("${src}"), ${CHECKER}` : CHECKER;
}

/** The masks mean different neighbours in each kind, so only the alone and surrounded tiles carry over. */
function changeKind(terrain: TilemapTerrain, kind: TilemapTerrain["kind"]): TilemapTerrain {
  const tiles: Record<string, TileValue> = {};
  const [alone, full] = [terrain.tiles[0], terrain.tiles[FULL_MASK[terrain.kind]]];
  if (alone !== undefined) tiles[0] = alone;
  if (full !== undefined) tiles[FULL_MASK[kind]] = full;
  return { ...terrain, kind, tiles };
}

/** A slot's picture: its tile, with the neighbours its mask stands for shaded on top. */
function MaskSlot({ terrain, mask, spriteById, onAssign, onClear }: { terrain: TilemapTerrain; mask: number; spriteById: Map<string, Sprite>; onAssign: () => void; onClear: () => void }) {
  const tile = terrain.tiles[mask];
  const label = `Neighbours: ${describeMask(terrain.kind, mask)}${tile === undefined ? " (empty)" : ""}`;
  return (
    <button
      onClick={onAssign}
      onContextMenu={(e) => {
        e.preventDefault();
        onClear();
      }}
      className="relative w-full aspect-square rounded overflow-hidden"
      style={{ background: tileBackground(tile, spriteById), outline: "1px solid var(--border)", imageRendering: "pixelated" }}
      title={`${label}. Click to set the picked tile, right-click to empty.`}
      aria-label={`Set tile for neighbours ${describeMask(terrain.kind, mask)}`}
    >
      <span className="absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
        {[-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => (
            <span
              key={`${dx},${dy}`}
              style={{ background: maskIncludes(terrain.kind, mask, dx, dy) ? "var(--accent)" : "transparent", opacity: tile === undefined ? 0.6 : 0.3 }}
            />
          ))
        )}
      </span>
    </button>
  );
}

/** The Tilemap's terrain (auto-tile) brushes: pick one to paint with, or open it to set its tiles. */
export function TerrainPanel({ terrains, activeTerrainId, selectedTile, spriteById, onActivate, onChange }: TerrainPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = terrains.find((terrain) => terrain.id === editingId);

  const replace = (next: TilemapTerrain) => onChange(terrains.map((terrain) => (terrain.id === next.id ? next : terrain)));

  function addTerrain() {
    const terrain: TilemapTerrain = { id: uuid(), name: `Terrain ${terrains.length + 1}`, kind: "edge16", tiles: {} };
    onChange([...terrains, terrain]);
    setEditingId(terrain.id);
  }

  function deleteTerrain(id: string) {
    onChange(terrains.filter((terrain) => terrain.id !== id));
    if (editingId === id) setEditingId(null);
  }

  return (
    <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Terrains (auto-tile)</span>
        <button onClick={addTerrain} className="p-1 rounded" style={{ color: "var(--accent)" }} title="New terrain" aria-label="New terrain">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {terrains.length === 0 && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          A terrain picks edge and corner tiles for you as you paint. Press + to make one.
        </p>
      )}
      <div className="space-y-0.5">
        {terrains.map((terrain) => {
          const isActive = terrain.id === activeTerrainId;
          return (
            <div
              key={terrain.id}
              className="group flex items-center gap-2 px-1.5 py-1 rounded text-xs"
              style={{ background: isActive ? "var(--bg-hover)" : "transparent", color: "var(--text-primary)", outline: isActive ? "1px solid var(--accent)" : "none" }}
            >
              <button
                onClick={() => onActivate(terrain.id)}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
                aria-pressed={isActive}
                aria-label={`Paint with terrain ${terrain.name}`}
                title={`Paint with ${terrain.name}`}
              >
                <span className="w-5 h-5 rounded shrink-0" style={{ background: tileBackground(terrainTile(terrain, FULL_MASK[terrain.kind]), spriteById), imageRendering: "pixelated", outline: "1px solid var(--border)" }} />
                <span className="truncate">{terrain.name}</span>
              </button>
              <button
                onClick={() => setEditingId((id) => (id === terrain.id ? null : terrain.id))}
                style={{ color: editingId === terrain.id ? "var(--accent)" : "var(--text-secondary)" }}
                title={`Set the tiles of ${terrain.name}`}
                aria-label={`Set the tiles of ${terrain.name}`}
                aria-expanded={editingId === terrain.id}
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deleteTerrain(terrain.id)}
                className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                style={{ color: "var(--red)" }}
                title={`Delete ${terrain.name}`}
                aria-label={`Delete ${terrain.name}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      {editing && (
        <div className="mt-2 space-y-1.5">
          <input
            value={editing.name}
            onChange={(e) => replace({ ...editing, name: e.target.value })}
            className="w-full px-2 py-1 rounded text-xs outline-none"
            style={inputStyle}
            aria-label="Terrain name"
          />
          <select
            value={editing.kind}
            onChange={(e) => replace(changeKind(editing, e.target.value as TilemapTerrain["kind"]))}
            className="w-full px-2 py-1 rounded text-xs outline-none"
            style={inputStyle}
            aria-label="Terrain kind"
          >
            {Object.entries(KIND_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </select>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Pick a tile below, then click the slot it belongs in. The shading shows which neighbours are the same terrain. Empty slots use the full (middle) tile.
          </p>
          <div className={`grid gap-1 ${editing.kind === "edge16" ? "grid-cols-4 max-md:grid-cols-8" : "grid-cols-6 max-md:grid-cols-8"}`}>
            {terrainMasks(editing.kind).map((mask) => (
              <MaskSlot
                key={mask}
                terrain={editing}
                mask={mask}
                spriteById={spriteById}
                onAssign={() => replace({ ...editing, tiles: { ...editing.tiles, [mask]: selectedTile } })}
                onClear={() => replace({ ...editing, tiles: Object.fromEntries(Object.entries(editing.tiles).filter(([key]) => Number(key) !== mask)) })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
