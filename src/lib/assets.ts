import type { AssetType } from "@/types";
import { storage, type ProjectCollection } from "./storage";
import { APP } from "./app-config";
import { COPY } from "@/copy";
import { decisionCode } from "./decisions";

export interface AssetKind {
  type: AssetType;
  collection: ProjectCollection;
  label: string;
  path: string;
  color: string;
}

export const ASSET_KINDS: Record<AssetType, AssetKind> = {
  sprite: { type: "sprite", collection: "sprites", label: "Sprite", path: "pixel-art", color: "#7c5cfc" },
  sound: { type: "sound", collection: "sounds", label: "Sound", path: "sfx", color: "#fbbf24" },
  music: { type: "music", collection: "music", label: "Music", path: "music", color: "#34d399" },
  tilemap: { type: "tilemap", collection: "tilemaps", label: "Tilemap", path: "tilemap", color: "#60a5fa" },
  diagram: { type: "diagram", collection: "diagrams", label: "Canvas", path: "diagrams", color: "#f472b6" },
  story: { type: "story", collection: "stories", label: COPY.assetKinds.story, path: "story", color: "#fb923c" },
  dialogue: { type: "dialogue", collection: "dialogues", label: "Dialogue", path: "dialogue", color: "#f87171" },
  palette: { type: "palette", collection: "palettes", label: "Palette", path: "palettes", color: "#2dd4bf" },
  spritesheet: { type: "spritesheet", collection: "spritesheets", label: "Sprite sheet", path: "sprites", color: "#38bdf8" },
  note: { type: "note", collection: "notes", label: "Note", path: "notebook", color: "#a3e635" },
  issue: { type: "issue", collection: "issues", label: "Issue", path: "board", color: "#e879f9" },
  model: { type: "model", collection: "models", label: "3D model", path: "voxels", color: "#d4a373" },
  decision: { type: "decision", collection: "decisions", label: "Decision", path: "decisions", color: "#818cf8" },
};

/** The asset types this app offers (see `APP.assetTypes`). */
export const ASSET_TYPES = (Object.keys(ASSET_KINDS) as AssetType[]).filter((type) => APP.assetTypes.includes(type));

export interface AssetSummary {
  type: AssetType;
  id: string;
  name: string;
  thumbnail?: string;
  excerpt?: string;
  updatedAt?: string;
}

type AnyAsset = {
  id: string;
  name?: string;
  title?: string;
  content?: string;
  updatedAt?: string;
  createdAt?: string;
  frames?: { pixels?: string }[];
  colors?: string[];
  thumbnail?: string;
};

function summaryName(type: AssetType, a: AnyAsset & { key?: string; number?: number }): string {
  if (type === "issue" && a.key) return `${a.key} ${a.title ?? ""}`.trim();
  if (type === "decision" && a.number) return `${decisionCode(a.number)} ${a.title ?? ""}`.trim();
  return a.name || a.title || "Untitled";
}

export function summarize(type: AssetType, raw: unknown): AssetSummary {
  const a = raw as AnyAsset & { key?: string; number?: number; description?: string; decision?: string };
  const text = a.content ?? a.description ?? a.decision;
  return {
    type,
    id: a.id,
    name: summaryName(type, a),
    thumbnail: type === "sprite" ? a.frames?.[0]?.pixels : type === "model" ? a.thumbnail : undefined,
    excerpt: text ? text.replace(/[#*_>`\[\]]/g, "").slice(0, 160) : undefined,
    updatedAt: a.updatedAt ?? a.createdAt,
  };
}

export function getAsset(projectId: string, type: AssetType, id: string): AssetSummary | undefined {
  const item = storage.getById(ASSET_KINDS[type].collection, id, projectId);
  return item ? summarize(type, item) : undefined;
}

export function listAssets(projectId: string, type?: AssetType): AssetSummary[] {
  const types = type ? [type] : ASSET_TYPES;
  return types.flatMap((t) => storage.getAll(ASSET_KINDS[t].collection, projectId).map((i) => summarize(t, i)));
}

/** Opens an asset in its tool; with `elementId` the canvas also selects that element and zooms to it. */
export function assetHref(projectId: string, type: AssetType, id: string, elementId?: string): string {
  const element = elementId ? `&element=${encodeURIComponent(elementId)}` : "";
  return `/project/${projectId}/${ASSET_KINDS[type].path}?open=${encodeURIComponent(id)}${element}`;
}
