import type { AssetRef, AssetType, Board, Issue } from "@/types";
import { ASSET_KINDS } from "./assets";

export type AssetActionId =
  | "open" | "open-new-tab" | "export-png" | "use-in-tilemap" | "make-3d-model" | "use-in-pixel-art" | "use-in-voxels" | "toggle-note-pin" | "toggle-preview"
  | "move-to-column" | "add-to-sprint" | "link-to-note" | "new-note" | "add-to-diagram" | "create-task"
  | "link-to-asset" | "show-links" | "duplicate" | "copy" | "copy-system" | "copy-name" | "copy-link"
  | "toggle-sidebar-pin" | "rename" | "delete";

export type AssetMenuEntry =
  | {
      kind: "item";
      action: AssetActionId;
      arg?: string;
      label: string;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
      submenu?: AssetMenuEntry[];
    }
  | { kind: "separator" };

export interface AssetMenuContext {
  ref: AssetRef;
  name: string;
  isPinnedToSidebar: boolean;
  isNotePinned?: boolean;
  isPreviewing?: boolean;
  board?: Board;
  issue?: Issue;
}

const MAX_NOTE_NAME_LENGTH = 24;

const SYSTEM_COPY_LABELS: Partial<Record<AssetType, string>> = {
  sprite: "Copy as PNG",
  palette: "Copy hex codes",
  note: "Copy text",
  story: "Copy text",
  dialogue: "Copy text",
  issue: "Copy key and title",
  decision: "Copy as Markdown",
};

export function systemCopyLabel(type: AssetType): string | null {
  return SYSTEM_COPY_LABELS[type] ?? null;
}

export function needsEditorReload(pathname: string, projectId: string, type: AssetType): boolean {
  if (type === "issue") return false;
  const prefix = `/project/${projectId}/`;
  if (!pathname.startsWith(prefix)) return false;
  return pathname.slice(prefix.length).split("/")[0] === ASSET_KINDS[type].path;
}

function item(action: AssetActionId, label: string, extra: Partial<Extract<AssetMenuEntry, { kind: "item" }>> = {}): AssetMenuEntry {
  return { kind: "item", action, label, ...extra };
}

function shortenName(name: string): string {
  return name.length > MAX_NOTE_NAME_LENGTH ? `${name.slice(0, MAX_NOTE_NAME_LENGTH - 1).trimEnd()}…` : name;
}

function moveToColumnEntry(board: Board, issue: Issue): AssetMenuEntry {
  const submenu = board.columns
    .filter((column) => column.id !== issue.status)
    .map((column) => item("move-to-column", column.name, { arg: column.id }));
  return item("move-to-column", "Move to column", { submenu, disabled: submenu.length === 0 });
}

function addToSprintEntry(board: Board, issue: Issue): AssetMenuEntry {
  const submenu = board.sprints
    .filter((sprint) => sprint.state !== "closed" && sprint.id !== issue.sprintId)
    .map((sprint) => item("add-to-sprint", sprint.name, { arg: sprint.id }));
  if (issue.sprintId) submenu.push(item("add-to-sprint", "Backlog", { arg: "" }));
  if (submenu.length === 0) return item("add-to-sprint", "Add to sprint", { disabled: true, hint: "No other sprints" });
  return item("add-to-sprint", "Add to sprint", { submenu });
}

function typeExtras(ctx: AssetMenuContext): AssetMenuEntry[] {
  switch (ctx.ref.type) {
    case "sprite":
      return [item("use-in-tilemap", "Use in Tilemap"), item("make-3d-model", "Make 3D model"), item("export-png", "Export PNG")];
    case "palette":
      return [item("use-in-pixel-art", "Use in Pixel Art"), item("use-in-voxels", "Use in 3D Pixel Art")];
    case "sound":
    case "music":
      return [item("toggle-preview", ctx.isPreviewing ? "Stop" : "Play")];
    case "note":
      return [item("toggle-note-pin", ctx.isNotePinned ? "Unpin in Notebook" : "Pin in Notebook")];
    case "issue":
      return ctx.board && ctx.issue ? [moveToColumnEntry(ctx.board, ctx.issue), addToSprintEntry(ctx.board, ctx.issue)] : [];
    default:
      return [];
  }
}

function linkEntries(ctx: AssetMenuContext): AssetMenuEntry[] {
  return [
    item("link-to-note", "Link to note…"),
    item("new-note", `New note about ${shortenName(ctx.name)}`),
    item("add-to-diagram", "Add to canvas…"),
    ...(ctx.ref.type === "issue" ? [] : [item("create-task", "Create task")]),
    item("link-to-asset", "Link to asset…"),
    item("show-links", "Show links"),
  ];
}

function copyEntries(type: AssetType): AssetMenuEntry[] {
  const systemLabel = systemCopyLabel(type);
  return [
    item("duplicate", "Duplicate"),
    item("copy", "Copy"),
    ...(systemLabel ? [item("copy-system", systemLabel)] : []),
    item("copy-name", "Copy name"),
    item("copy-link", "Copy link"),
  ];
}

export function getAssetMenuEntries(ctx: AssetMenuContext): AssetMenuEntry[] {
  const groups: AssetMenuEntry[][] = [
    [item("open", "Open"), item("open-new-tab", "Open in new tab")],
    typeExtras(ctx),
    linkEntries(ctx),
    copyEntries(ctx.ref.type),
    [
      item("toggle-sidebar-pin", ctx.isPinnedToSidebar ? "Unpin from sidebar" : "Pin to sidebar"),
      item("rename", "Rename…"),
      item("delete", "Delete…", { danger: true }),
    ],
  ];
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index): AssetMenuEntry[] => (index === 0 ? group : [{ kind: "separator" }, ...group]));
}
