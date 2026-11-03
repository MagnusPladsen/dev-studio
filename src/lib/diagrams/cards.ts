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
