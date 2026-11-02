import type { AssetRef, DiagramNode } from "@/types";
import { linkKind, type LinkKind } from "./embeds";

export type NodeType = DiagramNode["type"];

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// Literal colors: these are also used by the PNG export, which can't resolve CSS variables.
export const SHAPE_COLORS: Record<NodeType, string> = {
  state: "#60a5fa",
  action: "#34d399",
  condition: "#fbbf24",
  event: "#f472b6",
  note: "#666680",
  custom: "#7c5cfc",
  checklist: "#666680",
  image: "#666680",
  link: "#666680",
  asset: "#666680",
  group: "#666680",
  rectangle: "#a0a0b8",
  ellipse: "#a0a0b8",
  diamond: "#a0a0b8",
  drawing: "#e4e4ee",
};

export const NODE_LABELS: Record<NodeType, string> = {
  state: "State",
  action: "Action",
  condition: "Condition",
  event: "Event",
  note: "Note",
  custom: "Custom",
  checklist: "To-do list",
  image: "Image",
  link: "Link",
  asset: "Studio asset",
  group: "Group",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  drawing: "Drawing",
};

/** Swatches offered for any card; `undefined` means the card's default look. */
export const CARD_COLORS = [
  { name: "Default", value: undefined },
  { name: "Red", value: "#f87171" },
  { name: "Orange", value: "#fb923c" },
  { name: "Yellow", value: "#facc15" },
  { name: "Green", value: "#4ade80" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Blue", value: "#60a5fa" },
  { name: "Purple", value: "#a78bfa" },
  { name: "Pink", value: "#f472b6" },
] as const;

export const FLOW_SHAPES: NodeType[] = ["state", "action", "condition", "event"];
export const BOARD_CARDS: NodeType[] = ["note", "checklist", "image", "link", "asset", "group"];
export const BASIC_SHAPES: NodeType[] = ["rectangle", "ellipse", "diamond"];

/** Cards whose height follows their content; the stored height is only a starting size. */
const AUTO_HEIGHT: ReadonlySet<NodeType> = new Set(["note", "checklist", "image", "link", "asset"]);

export function isAutoHeight(type: NodeType): boolean {
  return AUTO_HEIGHT.has(type);
}

export function isFlowShape(type: NodeType): boolean {
  return FLOW_SHAPES.includes(type) || type === "custom";
}

export function isBasicShape(type: NodeType): boolean {
  return BASIC_SHAPES.includes(type);
}

/** Cards drawn as an outline with a centred label: flow-chart shapes and basic shapes. */
export function hasShapeBody(type: NodeType): boolean {
  return isFlowShape(type) || isBasicShape(type);
}

/** The smallest a card may be resized to; drawings may shrink to a few pixels. */
export function minSize(type: NodeType): { width: number; height: number } {
  if (type === "drawing") return { width: 8, height: 8 };
  return { width: type === "group" ? 160 : 80, height: 40 };
}

export function borderColor(node: DiagramNode): string {
  return node.color ?? SHAPE_COLORS[node.type];
}

const DEFAULT_SIZES: Record<NodeType, [number, number]> = {
  state: [140, 56],
  action: [140, 56],
  condition: [140, 56],
  event: [140, 56],
  note: [220, 96],
  custom: [140, 56],
  checklist: [240, 120],
  image: [260, 180],
  link: [280, 96],
  asset: [220, 64],
  group: [420, 320],
  rectangle: [160, 100],
  ellipse: [160, 100],
  diamond: [160, 110],
  drawing: [100, 100],
};

export function defaultSize(type: NodeType): { width: number; height: number } {
  const [width, height] = DEFAULT_SIZES[type];
  return { width, height };
}

/** Side of the square cover art on a song card, and of the small thumbnail on a plain link card. */
export const SONG_COVER = 64;
export const LINK_THUMB = 40;

const LINK_WIDTHS: Record<LinkKind, number> = { video: 320, audio: 320, image: 280, link: 280 };
const LINK_HEIGHTS: Record<LinkKind, number> = { video: 260, audio: 112, image: 220, link: 64 };

/** A starting size that fits how the link will show; the card's height then follows its content. */
export function linkCardSize(url: string): { width: number; height: number } {
  const kind = linkKind(url);
  return { width: LINK_WIDTHS[kind], height: LINK_HEIGHTS[kind] };
}

export function nodeAsset(node: DiagramNode): AssetRef | undefined {
  const asset = node.data?.asset as AssetRef | undefined;
  return asset && typeof asset.id === "string" && typeof asset.type === "string" ? asset : undefined;
}

export function checklistItems(node: DiagramNode): ChecklistItem[] {
  const items = node.data?.items;
  return Array.isArray(items) ? (items as ChecklistItem[]) : [];
}

/** Only web addresses: diagrams arrive by paste, import and sync, so a stored `javascript:` link must never render. */
export function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function imageSrc(node: DiagramNode): string | undefined {
  const src = node.data?.src;
  if (typeof src === "string" && src.startsWith("data:image/")) return src;
  return safeWebUrl(src);
}

export function linkUrl(node: DiagramNode): string | undefined {
  return safeWebUrl(node.data?.url);
}

export function linkPreview(node: DiagramNode): LinkPreview {
  const preview = node.data?.preview as Record<string, unknown> | undefined;
  if (!preview || typeof preview !== "object") return {};
  const text = (key: string) => (typeof preview[key] === "string" ? (preview[key] as string) : undefined);
  return { title: text("title"), description: text("description"), image: safeWebUrl(preview.image), siteName: text("siteName") };
}

export interface LinkLook {
  url: string;
  title: string;
  preview: LinkPreview;
}

/** What a link card shows as text, falling back from the fetched title to the label and then the domain. */
export function linkLook(node: DiagramNode): LinkLook {
  const url = linkUrl(node) ?? "";
  const preview = linkPreview(node);
  return { url, preview, title: preview.title || node.label || hostname(url) };
}

/**
 * Turns edited lines back into checklist items. Lines that kept their text keep their tick;
 * otherwise a line keeps the tick of the item that was at the same position.
 */
export function itemsFromLines(lines: string[], previous: ChecklistItem[], makeId: () => string): ChecklistItem[] {
  const unused = [...previous];
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => {
      const sameText = unused.findIndex((item) => item.text === text);
      if (sameText >= 0) return unused.splice(sameText, 1)[0];
      const edited = previous[index];
      if (edited && unused.includes(edited)) {
        unused.splice(unused.indexOf(edited), 1);
        return { ...edited, text };
      }
      return { id: makeId(), text, done: false };
    });
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
