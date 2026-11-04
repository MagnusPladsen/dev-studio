import type { ContextMenuEntry } from "@/components/ContextMenu";
import type { Cardinality, DiagramEdge } from "@/types";
import type { Alignment, Axis } from "./arrange";
import { CARD_COLORS } from "./cards";

// The right-click (and long-press) menus of the canvas: on elements, on lines and on the empty board.
// Entries that don't apply are left out rather than greyed out.

export interface MenuLink {
  key: string;
  label: string;
  open(): void;
  remove(): void;
}

export interface ElementMenuState {
  /** How many elements the menu acts on (the selection). */
  count: number;
  /** The links of the one element, when exactly one is selected. */
  links: MenuLink[];
  openLabel: string | null;
  /** An asset card's asset, whose own menu is one entry away. */
  assetName: string | null;
  canEditText: boolean;
  /** Colours the selection already has all of; marks the swatch. */
  color: string | undefined;
  hasGroups: boolean;
  canGroup: boolean;
  canPaste: boolean;
  isMac: boolean;
}

export interface ElementMenuActions {
  linkTo(): void;
  open(): void;
  openAssetMenu(): void;
  editText(): void;
  color(value: string | undefined): void;
  duplicate(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  bringToFront(): void;
  sendToBack(): void;
  align(edge: Alignment): void;
  distribute(axis: Axis): void;
  group(): void;
  ungroup(): void;
  remove(): void;
}

const ALIGNMENTS: [Alignment, string][] = [
  ["left", "Left"],
  ["center", "Centre"],
  ["right", "Right"],
  ["top", "Top"],
  ["middle", "Middle"],
  ["bottom", "Bottom"],
];

const LINE_STYLES: [DiagramEdge["type"], string][] = [
  ["arrow", "Arrow"],
  ["dashed", "Dashed"],
  ["line", "Line"],
];

const CARDINALITY_LABELS: [Cardinality, string][] = [
  ["many-to-one", "Many to one"],
  ["one-to-one", "One to one"],
  ["one-to-many", "One to many"],
  ["many-to-many", "Many to many"],
];

const DELETE_SHORTCUT = "Del";
const QUICK_ADD_SHORTCUT = "/";

export function shortcut(key: string, isMac: boolean): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

function item(key: string, label: string, onSelect: () => void, extra: Partial<Extract<ContextMenuEntry, { kind: "item" }>> = {}): ContextMenuEntry {
  return { kind: "item", key, label, onSelect, ...extra };
}

function submenu(key: string, label: string, entries: ContextMenuEntry[]): ContextMenuEntry {
  return { kind: "item", key, label, submenu: entries };
}

function checked(label: string, isChecked: boolean): string {
  return isChecked ? `✓ ${label}` : label;
}

/** Joins non-empty groups with separators. */
function grouped(groups: ContextMenuEntry[][]): ContextMenuEntry[] {
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? group : [{ kind: "separator" as const, key: `separator-${index}` }, ...group]));
}

function linkEntries(state: ElementMenuState, actions: ElementMenuActions): ContextMenuEntry[] {
  if (state.count !== 1) return [];
  const entries = [item("link-to", "Link to…", actions.linkTo)];
  if (state.links.length === 0) return entries;
  return [
    ...entries,
    submenu("linked", `Linked items (${state.links.length})`, state.links.map((link) => item(`open:${link.key}`, link.label, link.open))),
    submenu("remove-link", "Remove link", state.links.map((link) => item(`remove:${link.key}`, link.label, link.remove, { danger: true }))),
  ];
}

function openEntries(state: ElementMenuState, actions: ElementMenuActions): ContextMenuEntry[] {
  if (state.count !== 1) return [];
  return [
    ...(state.openLabel ? [item("open", state.openLabel, actions.open)] : []),
    ...(state.assetName ? [item("asset-menu", `More for ${state.assetName}…`, actions.openAssetMenu)] : []),
  ];
}

function editEntries(state: ElementMenuState, actions: ElementMenuActions): ContextMenuEntry[] {
  const colors = CARD_COLORS.map((swatch) => item(`color:${swatch.name}`, checked(swatch.name, state.color === swatch.value), () => actions.color(swatch.value)));
  return [
    ...(state.count === 1 && state.canEditText ? [item("edit-text", "Edit text", actions.editText)] : []),
    submenu("color", "Colour", colors),
  ];
}

function clipboardEntries(state: ElementMenuState, actions: ElementMenuActions): ContextMenuEntry[] {
  const key = (letter: string) => shortcut(letter, state.isMac);
  return [
    item("duplicate", "Duplicate", actions.duplicate, { shortcut: key("D") }),
    item("copy", "Copy", actions.copy, { shortcut: key("C") }),
    item("cut", "Cut", actions.cut, { shortcut: key("X") }),
    ...(state.canPaste ? [item("paste", "Paste", actions.paste, { shortcut: key("V") })] : []),
  ];
}

function arrangeEntries(state: ElementMenuState, actions: ElementMenuActions): ContextMenuEntry[] {
  const several = state.count > 1;
  return [
    item("front", "Bring to front", actions.bringToFront),
    item("back", "Send to back", actions.sendToBack),
    ...(several ? [submenu("align", "Align", ALIGNMENTS.map(([edge, label]) => item(`align:${edge}`, label, () => actions.align(edge))))] : []),
    ...(state.count > 2
      ? [submenu("distribute", "Distribute", [item("distribute:h", "Horizontally", () => actions.distribute("horizontal")), item("distribute:v", "Vertically", () => actions.distribute("vertical"))])]
      : []),
    ...(state.canGroup ? [item("group", "Group", actions.group)] : []),
    ...(state.hasGroups ? [item("ungroup", "Ungroup", actions.ungroup)] : []),
  ];
}

export function elementMenuEntries(state: ElementMenuState, actions: ElementMenuActions): ContextMenuEntry[] {
  return grouped([
    linkEntries(state, actions),
    openEntries(state, actions),
    editEntries(state, actions),
    clipboardEntries(state, actions),
    arrangeEntries(state, actions),
    [item("delete", state.count > 1 ? `Delete ${state.count} elements` : "Delete", actions.remove, { danger: true, shortcut: DELETE_SHORTCUT })],
  ]);
}

export interface BoardMenuActions {
  paste(): void;
  addShape(): void;
  selectAll(): void;
  autoArrange(): void;
}

export function boardMenuEntries(state: { canPaste: boolean; hasElements: boolean; isMac: boolean }, actions: BoardMenuActions): ContextMenuEntry[] {
  return [
    ...(state.canPaste ? [item("paste", "Paste", actions.paste, { shortcut: shortcut("V", state.isMac) })] : []),
    item("add-shape", "Add shape…", actions.addShape, { shortcut: QUICK_ADD_SHORTCUT }),
    ...(state.hasElements
      ? [item("select-all", "Select all", actions.selectAll, { shortcut: shortcut("A", state.isMac) }), item("auto-arrange", "Auto-arrange", actions.autoArrange)]
      : []),
  ];
}

export interface EdgeMenuActions {
  editLabel(): void;
  lineStyle(type: DiagramEdge["type"]): void;
  cardinality(value: Cardinality): void;
  remove(): void;
}

export function edgeMenuEntries(edge: DiagramEdge, actions: EdgeMenuActions): ContextMenuEntry[] {
  const styles = LINE_STYLES.map(([type, label]) => item(`style:${type}`, checked(label, edge.type === type), () => actions.lineStyle(type)));
  const cardinalities = edge.cardinality
    ? [submenu("cardinality", "Cardinality", CARDINALITY_LABELS.map(([value, label]) => item(`cardinality:${value}`, checked(label, edge.cardinality === value), () => actions.cardinality(value))))]
    : [];
  return grouped([
    [item("label", edge.label ? "Edit label" : "Add label", actions.editLabel), submenu("style", "Line style", styles), ...cardinalities],
    [item("delete", "Delete line", actions.remove, { danger: true, shortcut: DELETE_SHORTCUT })],
  ]);
}
