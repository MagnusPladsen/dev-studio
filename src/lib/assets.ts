import type { AssetType } from "@/types";
import { storage, type ProjectCollection } from "./storage";

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
  story: { type: "story", collection: "stories", label: "Story", path: "story", color: "#fb923c" },
  dialogue: { type: "dialogue", collection: "dialogues", label: "Dialogue", path: "dialogue", color: "#f87171" },
  palette: { type: "palette", collection: "palettes", label: "Palette", path: "palettes", color: "#2dd4bf" },
  spritesheet: { type: "spritesheet", collection: "spritesheets", label: "Sprite sheet", path: "sprites", color: "#38bdf8" },
  note: { type: "note", collection: "notes", label: "Note", path: "notebook", color: "#a3e635" },
  issue: { type: "issue", collection: "issues", label: "Issue", path: "board", color: "#e879f9" },
  model: { type: "model", collection: "models", label: "3D model", path: "voxels", color: "#d4a373" },
};

export const ASSET_TYPES = Object.keys(ASSET_KINDS) as AssetType[];

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

export function summarize(type: AssetType, raw: unknown): AssetSummary {
  const a = raw as AnyAsset & { key?: string; description?: string };
  return {
    type,
    id: a.id,
    name: type === "issue" && a.key ? `${a.key} ${a.title ?? ""}`.trim() : a.name || a.title || "Untitled",
    thumbnail: type === "sprite" ? a.frames?.[0]?.pixels : type === "model" ? a.thumbnail : undefined,
    excerpt: (a.content ?? a.description) ? (a.content ?? a.description)!.replace(/[#*_>`\[\]]/g, "").slice(0, 160) : undefined,
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

export function assetHref(projectId: string, type: AssetType, id: string): string {
  return `/project/${projectId}/${ASSET_KINDS[type].path}?open=${encodeURIComponent(id)}`;
}
