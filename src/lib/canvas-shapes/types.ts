import type { LucideIcon } from "lucide-react";
import type { DiagramNode } from "@/types";
import type { NodeType } from "@/lib/diagrams/cards";
import type { Rect } from "@/lib/diagrams/geometry";
import type { Images } from "@/lib/diagrams/png-cards";
import type { AssetLook } from "@/lib/diagrams/render-png";
import type { ShapeOutline } from "@/lib/diagrams/shapes";

export interface Size {
  width: number;
  height: number;
}

/** What an export needs from the board besides the node itself. */
export interface ExportContext {
  describeAsset(node: DiagramNode): AssetLook | null;
}

export interface PngContext extends ExportContext {
  images: Images;
}

/** Which card body draws the shape on the board; each kind has one React component in `DiagramCard`. */
export type BodyKind = "shape" | "note" | "checklist" | "image" | "link" | "asset" | "group" | "drawing";

/** What happens when someone adds the shape from the menu, the library or quick-add. */
export type Placement = "place" | "edit" | "pick-image" | "pick-asset";

/** Sections of the Add menu; the shape library groups them into tabs. */
export type LibrarySection = "board" | "shapes" | "flow";

export interface LibraryEntry {
  section: LibrarySection;
  /** One line under the name in the Add menu and the library. */
  hint?: string;
  /** Extra words quick-add and the library search match on. */
  keywords: string[];
}

/**
 * Everything the Canvas needs to know about one kind of card: how big it starts, how it is placed,
 * which body draws it on the board and how the PNG and SVG exports draw it.
 */
export interface ShapeDefinition {
  type: NodeType;
  label: string;
  icon: LucideIcon;
  /** Default border colour, as a literal so the PNG export can use it. */
  color: string;
  size: Size;
  minSize: Size;
  /** The label a freshly added card gets. */
  defaultLabel: string;
  /** The card's height follows its content; the stored height is only a starting size. */
  isAutoHeight: boolean;
  /** "back" cards (groups) sit under the lines and the other cards. */
  layer: "back" | "front";
  /** Moving the card moves the cards inside it. */
  isContainer: boolean;
  canEditText: boolean;
  canLinkAsset: boolean;
  placement: Placement;
  body: BodyKind;
  /** Shape bodies: the outline drawn in the card's box. */
  outline?(r: Rect): ShapeOutline;
  /** Shape bodies: basic shapes take a colour fill, a thicker stroke and longer labels than flow-chart shapes. */
  shapeStyle?: "basic" | "flow";
  /** Shape bodies: horizontal padding (a Tailwind class) that keeps the label inside the outline. */
  labelInset?: string;
  /** Shown in the Add menu, the shape library and quick-add; cards without one are made another way (the pen). */
  library?: LibraryEntry;
  toSvg(node: DiagramNode, r: Rect, context: ExportContext): string;
  drawPng(ctx: CanvasRenderingContext2D, node: DiagramNode, r: Rect, context: PngContext): void;
  /** Pictures the PNG export must load before drawing this card. */
  imageSources?(node: DiagramNode, context: ExportContext): string[];
}
