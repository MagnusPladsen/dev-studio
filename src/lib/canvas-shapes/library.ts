import { SHAPE_LIST } from "./index";
import type { LibrarySection, ShapeDefinition } from "./types";

/** dataTransfer type a shape dragged out of the library carries; its value is the card type. */
export const SHAPE_DRAG_TYPE = "application/x-canvas-shape";

export interface LibraryTab {
  id: string;
  label: string;
  sections: { section: LibrarySection; title: string }[];
}

const TABS: LibraryTab[] = [
  {
    id: "general",
    label: "General",
    sections: [
      { section: "board", title: "Board cards" },
      { section: "shapes", title: "Shapes" },
    ],
  },
  { id: "flow", label: "Flow", sections: [{ section: "flow", title: "Flow chart" }] },
  { id: "database", label: "Database", sections: [{ section: "database", title: "Entity relationship" }] },
];

export function shapesInSection(section: LibrarySection): ShapeDefinition[] {
  return SHAPE_LIST.filter((shape) => shape.library?.section === section);
}

/** Library tabs that have something to place; a tab whose shapes don't exist yet stays hidden. */
export function libraryTabs(): LibraryTab[] {
  return TABS.filter((tab) => tab.sections.some(({ section }) => shapesInSection(section).length > 0));
}

/** Every shape someone can add by hand, in Add-menu order. */
export function placeableShapes(): ShapeDefinition[] {
  return SHAPE_LIST.filter((shape) => shape.library);
}

function matchRank(shape: ShapeDefinition, words: string[]): number {
  const label = shape.label.toLowerCase();
  const extra = [shape.library?.hint ?? "", ...(shape.library?.keywords ?? [])].join(" ").toLowerCase();
  if (!words.every((word) => label.includes(word) || extra.includes(word))) return -1;
  if (label.startsWith(words[0])) return 0;
  return words.every((word) => label.includes(word)) ? 1 : 2;
}

/** Placeable shapes matching every word of `query` by name, hint or keyword; name matches first. */
export function searchShapes(query: string): ShapeDefinition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return placeableShapes();
  return placeableShapes()
    .map((shape, order) => ({ shape, order, rank: matchRank(shape, words) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ shape }) => shape);
}
