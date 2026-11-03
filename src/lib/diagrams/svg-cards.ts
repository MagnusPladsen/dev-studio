import type { DiagramNode } from "@/types";
import type { ShapeDefinition } from "@/lib/canvas-shapes/types";
import { checklistItems, hostname, imageSrc, LINK_THUMB, linkLook, SONG_COVER, type LinkLook } from "./cards";
import { embedFor, imageUrlFor, PROVIDER_COLORS, PROVIDER_NAMES, type AudioEmbed, type EmbedProvider, type VideoEmbed } from "./embeds";
import { BOARD_BG, CARD_BG, CARD_BORDER, DONE, MUTED, PLAY_BG, PLAY_ICON, TEXT } from "./export-style";
import { DRAWING_STROKE, placedPoints, smoothPath } from "./freehand";
import { GROUP_HEADER, type Rect } from "./geometry";
import type { AssetLook } from "./render-png";
import { polygonPoints, type ShapeOutline } from "./shapes";

/** Rough glyph width as a share of the font size; SVG export can't measure text, so it wraps by estimate. */
const CHAR_WIDTH = 0.56;

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Breaks text into lines that should fit `maxWidth` at `fontSize`, keeping the text's own line breaks. */
export function wrapByWidth(text: string, maxWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH)));
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && candidate.length > maxChars) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    return [...lines, line];
  });
}

interface TextStyle {
  size: number;
  lineHeight: number;
  color: string;
  weight?: number;
  anchor?: "start" | "middle";
}

function textBlock(lines: string[], x: number, y: number, style: TextStyle): string {
  if (lines.length === 0) return "";
  const weight = style.weight ? ` font-weight="${style.weight}"` : "";
  const spans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : style.lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" font-size="${style.size}"${weight} fill="${escapeXml(style.color)}" text-anchor="${style.anchor ?? "start"}" dominant-baseline="hanging">${spans}</text>`;
}

function linesThatFit(lines: string[], top: number, lineHeight: number, bottom: number): string[] {
  return lines.slice(0, Math.max(0, Math.floor((bottom - top) / lineHeight)));
}

function cardBox(node: DiagramNode, r: Rect, radius = 10): string {
  const tint = node.color ? `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="${escapeXml(node.color)}" fill-opacity="0.15"/>` : "";
  return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="${CARD_BG}"/>${tint}<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" fill="none" stroke="${escapeXml(node.color ?? CARD_BORDER)}" stroke-width="1.5"/>`;
}

function picture(href: string, r: Rect): string {
  return `<svg x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}" preserveAspectRatio="xMidYMid slice"><image href="${escapeXml(href)}" width="${r.width}" height="${r.height}" preserveAspectRatio="xMidYMid slice"/></svg>`;
}

function outlineSvg(outline: ShapeOutline, paint: string): string {
  if (outline.kind === "polygon") return `<polygon points="${polygonPoints(outline.points)}" ${paint}/>`;
  if (outline.kind === "ellipse") return `<ellipse cx="${outline.cx}" cy="${outline.cy}" rx="${outline.rx}" ry="${outline.ry}" ${paint}/>`;
  return `<rect x="${outline.x}" y="${outline.y}" width="${outline.width}" height="${outline.height}" rx="${outline.radius}" ${paint}/>`;
}

export function shapeSvg(node: DiagramNode, r: Rect, shape: ShapeDefinition): string {
  const isBasic = shape.shapeStyle === "basic";
  const outline = shape.outline!(r);
  const tint = node.color && isBasic ? outlineSvg(outline, `fill="${escapeXml(node.color)}" fill-opacity="0.12"`) : "";
  const stroke = outlineSvg(outline, `fill="none" stroke="${escapeXml(node.color ?? shape.color)}" stroke-width="${isBasic ? 2 : 1.5}"`);
  const lines = wrapByWidth(node.label, r.width - 20, 13).slice(0, isBasic ? 8 : 3);
  const top = r.y + r.height / 2 - (lines.length * 16) / 2 + 2;
  const label = textBlock(lines, r.x + r.width / 2, top, { size: 13, lineHeight: 16, color: TEXT, anchor: "middle" });
  return outlineSvg(outline, `fill="${CARD_BG}"`) + tint + stroke + label;
}

export function drawingSvg(node: DiagramNode, shape: ShapeDefinition): string {
  const d = smoothPath(placedPoints(node));
  return d ? `<path d="${d}" fill="none" stroke="${escapeXml(node.color ?? shape.color)}" stroke-width="${DRAWING_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
}

export function groupSvg(node: DiagramNode, r: Rect): string {
  const color = escapeXml(node.color ?? "#666680");
  const title = textBlock([node.label], r.x + 16, r.y + 13, { size: 14, lineHeight: 18, color: TEXT, weight: 600 });
  return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="14" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-opacity="0.5" stroke-width="1.5"/>${r.height >= GROUP_HEADER ? title : ""}`;
}

export function noteSvg(node: DiagramNode, r: Rect): string {
  const lines = linesThatFit(wrapByWidth(node.label, r.width - 28, 14), r.y + 12, 20, r.y + r.height - 8);
  return cardBox(node, r) + textBlock(lines, r.x + 14, r.y + 12, { size: 14, lineHeight: 20, color: TEXT });
}

export function checklistSvg(node: DiagramNode, r: Rect): string {
  let svg = cardBox(node, r) + textBlock([node.label || "To-do"], r.x + 14, r.y + 12, { size: 14, lineHeight: 22, color: TEXT, weight: 600 });
  let y = r.y + 34;
  for (const item of checklistItems(node)) {
    if (y + 20 > r.y + r.height) break;
    const color = item.done ? DONE : MUTED;
    svg += `<rect x="${r.x + 14}" y="${y + 2}" width="12" height="12" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    if (item.done) svg += `<rect x="${r.x + 17}" y="${y + 5}" width="6" height="6" fill="${DONE}"/>`;
    const lines = linesThatFit(wrapByWidth(item.text, r.width - 50, 13), y, 18, r.y + r.height);
    svg += textBlock(lines, r.x + 34, y, { size: 13, lineHeight: 18, color: item.done ? MUTED : TEXT });
    y += lines.length * 18 + 4;
  }
  return svg;
}

export function imageSvg(node: DiagramNode, r: Rect): string {
  const src = imageSrc(node);
  const aspect = typeof node.data?.aspect === "number" ? node.data.aspect : 4 / 3;
  const media = { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, r.width / aspect) };
  const caption = node.label
    ? textBlock(linesThatFit(wrapByWidth(node.label, r.width - 24, 13), media.y + media.height + 8, 18, r.y + r.height), r.x + 12, media.y + media.height + 8, { size: 13, lineHeight: 18, color: TEXT })
    : "";
  return cardBox(node, r, 8) + (src ? picture(src, media) : "") + caption;
}

function providerBadge(provider: EmbedProvider, x: number, y: number): string {
  return `<circle cx="${x + 4}" cy="${y + 7}" r="4" fill="${PROVIDER_COLORS[provider]}"/>` +
    textBlock([PROVIDER_NAMES[provider]], x + 14, y, { size: 11, lineHeight: 14, color: MUTED });
}

function playButton(cx: number, cy: number, radius: number, fill: string, arrow: string): string {
  const s = radius * 0.42;
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}"/><path d="M${cx - s * 0.7} ${cy - s} L${cx + s} ${cy} L${cx - s * 0.7} ${cy + s} Z" fill="${arrow}"/>`;
}

function videoLinkSvg(link: LinkLook, embed: VideoEmbed, r: Rect): string {
  const thumb = link.preview.image ?? embed.thumbnail;
  const media = { x: r.x, y: r.y, width: r.width, height: Math.max(0, Math.min(r.width / embed.player.aspect, r.height - 64)) };
  let svg = `<rect x="${media.x}" y="${media.y}" width="${media.width}" height="${media.height}" rx="10" fill="${BOARD_BG}"/>`;
  if (thumb) svg += picture(thumb, media);
  const name = PROVIDER_NAMES[embed.provider];
  svg += `<rect x="${r.x + 8}" y="${r.y + 8}" width="${name.length * 6.6 + 16}" height="18" rx="9" fill="${PROVIDER_COLORS[embed.provider]}"/>`;
  svg += textBlock([name], r.x + 16, r.y + 11, { size: 11, lineHeight: 14, color: BOARD_BG, weight: 600 });
  svg += playButton(media.x + media.width / 2, media.y + media.height / 2, 24, PLAY_BG, PLAY_ICON);
  const y = media.y + media.height + 10;
  const title = wrapByWidth(link.title, r.width - 28, 13).slice(0, 2);
  svg += textBlock(title, r.x + 14, y, { size: 13, lineHeight: 18, color: TEXT, weight: 600 });
  return svg + providerBadge(embed.provider, r.x + 14, y + title.length * 18 + 4);
}

function songLinkSvg(link: LinkLook, embed: AudioEmbed, r: Rect): string {
  const accent = PROVIDER_COLORS[embed.provider];
  const cover = { x: r.x + 16, y: r.y + 12, width: SONG_COVER, height: SONG_COVER };
  const art = link.preview.image ?? embed.thumbnail;
  let svg = `<rect x="${r.x}" y="${r.y}" width="4" height="${r.height}" fill="${accent}"/>`;
  svg += `<rect x="${cover.x}" y="${cover.y}" width="${cover.width}" height="${cover.height}" rx="6" fill="${BOARD_BG}"/>`;
  if (art) svg += picture(art, cover);
  const textX = cover.x + SONG_COVER + 12;
  const textWidth = r.x + r.width - textX - (embed.player ? 48 : 12);
  const title = wrapByWidth(link.title, textWidth, 13).slice(0, 2);
  svg += textBlock(title, textX, cover.y + 4, { size: 13, lineHeight: 18, color: TEXT, weight: 600 });
  const subtitle = wrapByWidth(link.preview.description ?? "", textWidth, 12).slice(0, 4 - title.length);
  svg += textBlock(subtitle.filter(Boolean), textX, cover.y + 6 + title.length * 18, { size: 12, lineHeight: 16, color: MUTED });
  if (embed.player) svg += playButton(r.x + r.width - 30, cover.y + SONG_COVER / 2, 18, accent, BOARD_BG);
  return svg + providerBadge(embed.provider, r.x + 16, cover.y + SONG_COVER + 10);
}

function imageLinkSvg(link: LinkLook, src: string, r: Rect): string {
  const media = { x: r.x, y: r.y, width: r.width, height: Math.max(0, r.height - 28) };
  return picture(src, media) + textBlock([hostname(link.url)], r.x + 14, media.y + media.height + 7, { size: 11, lineHeight: 14, color: MUTED });
}

function plainLinkSvg(link: LinkLook, r: Rect): string {
  const thumb = { x: r.x + 12, y: r.y + 12, width: LINK_THUMB, height: LINK_THUMB };
  let svg = `<rect x="${thumb.x}" y="${thumb.y}" width="${LINK_THUMB}" height="${LINK_THUMB}" rx="6" fill="${BOARD_BG}"/>`;
  if (link.preview.image) svg += picture(link.preview.image, thumb);
  const textX = thumb.x + LINK_THUMB + 12;
  const title = wrapByWidth(link.title, r.x + r.width - textX - 12, 13).slice(0, 2);
  svg += textBlock(title, textX, r.y + 12, { size: 13, lineHeight: 18, color: TEXT, weight: 600 });
  const site = link.preview.siteName ? `${link.preview.siteName} · ${hostname(link.url)}` : hostname(link.url);
  return svg + textBlock([site], textX, r.y + 14 + title.length * 18, { size: 11, lineHeight: 14, color: MUTED });
}

/** Videos as a video frame, music as a song, pictures as themselves, and anything else as a compact link. */
export function linkSvg(node: DiagramNode, r: Rect): string {
  const link = linkLook(node);
  const image = link.url ? imageUrlFor(link.url) : null;
  const embed = link.url ? embedFor(link.url) : null;
  const body = image
    ? imageLinkSvg(link, image, r)
    : embed?.kind === "video"
      ? videoLinkSvg(link, embed, r)
      : embed?.kind === "audio"
        ? songLinkSvg(link, embed, r)
        : plainLinkSvg(link, r);
  const clipId = `link-${node.id.replace(/[^\w-]/g, "_")}`;
  const clip = `<clipPath id="${clipId}"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="10"/></clipPath>`;
  return cardBox(node, r) + `${clip}<g clip-path="url(#${clipId})">${body}</g>`;
}

export function assetSvg(node: DiagramNode, r: Rect, look: AssetLook | null): string {
  const color = escapeXml(look?.color ?? MUTED);
  let svg = cardBox(node, r) + `<rect x="${r.x}" y="${r.y}" width="5" height="${r.height}" fill="${color}"/>`;
  let x = r.x + 16;
  if (look?.thumbnail) {
    svg += `<image href="${escapeXml(look.thumbnail)}" x="${x}" y="${r.y + (r.height - 36) / 2}" width="36" height="36" style="image-rendering:pixelated"/>`;
    x += 46;
  }
  svg += textBlock([look?.kind ?? "Deleted asset"], x, r.y + 14, { size: 11, lineHeight: 14, color });
  return svg + textBlock([look?.name ?? node.label], x, r.y + 30, { size: 14, lineHeight: 18, color: TEXT, weight: 600 });
}
