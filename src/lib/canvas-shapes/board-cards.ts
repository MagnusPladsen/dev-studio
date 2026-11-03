import { Boxes, Image as ImageIcon, Link2, ListChecks, PenLine, SquareDashed, StickyNote } from "lucide-react";
import { COPY } from "@/copy";
import { imageSrc, linkPreview, linkUrl } from "@/lib/diagrams/cards";
import { embedFor, imageUrlFor } from "@/lib/diagrams/embeds";
import { drawAssetCard, drawChecklist, drawDrawing, drawGroup, drawImageCard, drawLink, drawNote } from "@/lib/diagrams/png-cards";
import { assetSvg, checklistSvg, drawingSvg, groupSvg, imageSvg, linkSvg, noteSvg } from "@/lib/diagrams/svg-cards";
import { defineShape } from "./define";
import type { ShapeDefinition } from "./types";

const CARD_COLOR = "#666680";

const drawing: ShapeDefinition = defineShape({
  type: "drawing",
  label: "Drawing",
  icon: PenLine,
  color: "#e4e4ee",
  size: { width: 100, height: 100 },
  minSize: { width: 8, height: 8 },
  canEditText: false,
  body: "drawing",
  toSvg: (node) => drawingSvg(node, drawing),
  drawPng: (ctx, node) => drawDrawing(ctx, node, drawing),
});

export const BOARD_CARDS = [
  defineShape({
    type: "note",
    label: "Note",
    icon: StickyNote,
    color: CARD_COLOR,
    size: { width: 220, height: 96 },
    isAutoHeight: true,
    placement: "edit",
    body: "note",
    library: { section: "board", hint: "Text that wraps and grows", keywords: ["text", "sticky", "comment", "idea"] },
    toSvg: noteSvg,
    drawPng: drawNote,
  }),
  defineShape({
    type: "checklist",
    label: "To-do list",
    icon: ListChecks,
    color: CARD_COLOR,
    size: { width: 240, height: 120 },
    defaultLabel: "To-do",
    isAutoHeight: true,
    placement: "edit",
    body: "checklist",
    library: { section: "board", hint: "Tasks you can tick off", keywords: ["checklist", "tasks", "todo"] },
    toSvg: checklistSvg,
    drawPng: drawChecklist,
  }),
  defineShape({
    type: "image",
    label: "Image",
    icon: ImageIcon,
    color: CARD_COLOR,
    size: { width: 260, height: 180 },
    isAutoHeight: true,
    placement: "pick-image",
    body: "image",
    library: { section: "board", hint: "Upload, paste or drop a picture", keywords: ["picture", "photo", "reference", "moodboard"] },
    toSvg: imageSvg,
    drawPng: (ctx, node, r, { images }) => drawImageCard(ctx, node, r, images),
    imageSources: (node) => [imageSrc(node) ?? ""],
  }),
  defineShape({
    type: "link",
    label: "Link",
    icon: Link2,
    color: CARD_COLOR,
    size: { width: 280, height: 96 },
    isAutoHeight: true,
    canEditText: false,
    placement: "edit",
    body: "link",
    library: { section: "board", hint: "YouTube, Spotify or any website", keywords: ["url", "video", "music", "website", "embed"] },
    toSvg: linkSvg,
    drawPng: (ctx, node, r, { images }) => drawLink(ctx, node, r, images),
    imageSources: (node) => {
      const url = linkUrl(node);
      return url ? [imageUrlFor(url) ?? linkPreview(node).image ?? embedFor(url)?.thumbnail ?? ""] : [];
    },
  }),
  defineShape({
    type: "asset",
    label: "Studio asset",
    icon: Boxes,
    color: CARD_COLOR,
    size: { width: 220, height: 64 },
    isAutoHeight: true,
    canEditText: false,
    placement: "pick-asset",
    body: "asset",
    library: { section: "board", hint: COPY.canvas.assetCardHint, keywords: ["asset", "project", "reference", "embed"] },
    toSvg: (node, r, { describeAsset }) => assetSvg(node, r, describeAsset(node)),
    drawPng: (ctx, node, r, { describeAsset, images }) => drawAssetCard(ctx, node, r, describeAsset(node), images),
    imageSources: (node, { describeAsset }) => [describeAsset(node)?.thumbnail ?? ""],
  }),
  defineShape({
    type: "group",
    label: "Group",
    icon: SquareDashed,
    color: CARD_COLOR,
    size: { width: 420, height: 320 },
    minSize: { width: 160, height: 40 },
    defaultLabel: "Group",
    layer: "back",
    isContainer: true,
    body: "group",
    library: { section: "board", hint: "An area that holds cards", keywords: ["frame", "area", "section", "container"] },
    toSvg: groupSvg,
    drawPng: drawGroup,
  }),
  drawing,
];
