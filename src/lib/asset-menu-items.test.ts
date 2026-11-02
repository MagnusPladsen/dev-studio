import { describe, expect, it } from "vitest";
import type { AssetRef, Board, Issue } from "@/types";
import {
  getAssetMenuEntries,
  needsEditorReload,
  systemCopyLabel,
  type AssetMenuContext,
  type AssetMenuEntry,
} from "./asset-menu-items";

const now = "2026-01-01T00:00:00.000Z";
const labels = (entries: AssetMenuEntry[]): string[] =>
  entries.map((entry) => (entry.kind === "separator" ? "—" : entry.label));

function find(entries: AssetMenuEntry[], action: string): Extract<AssetMenuEntry, { kind: "item" }> {
  const found = entries.find((entry) => entry.kind === "item" && entry.action === action);
  if (!found || found.kind !== "item") throw new Error(`missing ${action}`);
  return found;
}

const board: Board = {
  id: "b1",
  projectId: "p1",
  name: "Board",
  keyPrefix: "PIP",
  nextNumber: 2,
  columns: [
    { id: "todo", name: "To do", color: "#000", category: "todo" },
    { id: "doing", name: "Doing", color: "#000", category: "doing" },
    { id: "done", name: "Done", color: "#000", category: "done" },
  ],
  sprints: [
    { id: "s1", name: "Sprint 1", state: "active" },
    { id: "s2", name: "Sprint 2", state: "planned" },
    { id: "s3", name: "Sprint 3", state: "closed" },
  ],
  createdAt: now,
  updatedAt: now,
};

const issue: Issue = {
  id: "i1",
  projectId: "p1",
  key: "PIP-1",
  title: "Fix jump",
  description: "",
  type: "bug",
  priority: "medium",
  status: "doing",
  sprintId: "s1",
  labels: [],
  order: 0,
  tags: [],
  createdAt: now,
  updatedAt: now,
};

const issueRef: AssetRef = { type: "issue", id: "i1" };
const noteRef: AssetRef = { type: "note", id: "n1" };
const issueCtx: AssetMenuContext = { ref: issueRef, name: "Fix jump", isPinnedToSidebar: false, board, issue };

describe("getAssetMenuEntries", () => {
  it("builds the sprite menu in groups", () => {
    const entries = getAssetMenuEntries({ ref: { type: "sprite", id: "s" }, name: "Pip", isPinnedToSidebar: false });
    expect(labels(entries)).toEqual([
      "Open", "Open in new tab", "—", "Use in Tilemap", "Make 3D model", "Export PNG", "—", "Link to note…", "New note about Pip", "Add to canvas…",
      "Create task", "Link to asset…", "Show links", "—", "Duplicate", "Copy", "Copy as PNG", "Copy name", "Copy link",
      "—", "Pin to sidebar", "Rename…", "Delete…",
    ]);
  });

  it("drops empty groups and flips the sidebar pin label", () => {
    const sound = labels(getAssetMenuEntries({ ref: { type: "sound", id: "x" }, name: "Jump", isPinnedToSidebar: true }));
    expect(sound).toContain("Unpin from sidebar");
    expect(sound.join("|")).not.toContain("—|—");
    expect(sound[0]).not.toBe("—");
    expect(sound.at(-1)).toBe("Delete…");
  });

  it("offers Play, or Stop while the asset is previewing", () => {
    const soundRef: AssetRef = { type: "sound", id: "x" };
    const playing = getAssetMenuEntries({ ref: soundRef, name: "Jump", isPinnedToSidebar: false, isPreviewing: true });
    expect(labels(playing).slice(0, 4)).toEqual(["Open", "Open in new tab", "—", "Stop"]);
    const idle = getAssetMenuEntries({ ref: { type: "music", id: "m" }, name: "Theme", isPinnedToSidebar: false });
    expect(labels(idle)[3]).toBe("Play");
  });

  it("labels the notebook pin from the note state", () => {
    const pinned = getAssetMenuEntries({ ref: noteRef, name: "Ideas", isPinnedToSidebar: false, isNotePinned: true });
    const unpinned = getAssetMenuEntries({ ref: noteRef, name: "Ideas", isPinnedToSidebar: false, isNotePinned: false });
    expect(labels(pinned)).toContain("Unpin in Notebook");
    expect(labels(unpinned)).toContain("Pin in Notebook");
  });

  it("derives issue submenus from the board", () => {
    const entries = getAssetMenuEntries(issueCtx);
    expect(labels(entries)).not.toContain("Create task");
    expect(labels(find(entries, "move-to-column").submenu!)).toEqual(["To do", "Done"]);
    expect(find(find(entries, "move-to-column").submenu!, "move-to-column").arg).toBe("todo");
    expect(labels(find(entries, "add-to-sprint").submenu!)).toEqual(["Sprint 2", "Backlog"]);
    expect(find(find(entries, "add-to-sprint").submenu!, "add-to-sprint").arg).toBe("s2");
    expect(find(entries, "delete")).toMatchObject({ danger: true });
  });

  it("disables add to sprint when there is nowhere to go", () => {
    const entries = getAssetMenuEntries({ ...issueCtx, board: { ...board, sprints: [] }, issue: { ...issue, sprintId: null } });
    expect(find(entries, "add-to-sprint")).toMatchObject({ disabled: true, hint: "No other sprints" });
  });

  it("shortens long names in the new-note item", () => {
    const entries = getAssetMenuEntries({ ref: { type: "story", id: "st" }, name: "A very long story entry title", isPinnedToSidebar: false });
    expect(labels(entries)).toContain("New note about A very long story entry…");
  });
});

describe("systemCopyLabel", () => {
  it("names the system copy per type", () => {
    expect(systemCopyLabel("palette")).toBe("Copy hex codes");
    expect(systemCopyLabel("dialogue")).toBe("Copy text");
    expect(systemCopyLabel("issue")).toBe("Copy key and title");
    expect(systemCopyLabel("music")).toBeNull();
  });
});

describe("needsEditorReload", () => {
  it("is true only inside the asset's own tool", () => {
    expect(needsEditorReload("/project/p1/pixel-art", "p1", "sprite")).toBe(true);
    expect(needsEditorReload("/project/p1/assets", "p1", "sprite")).toBe(false);
    expect(needsEditorReload("/project/p1/sprites", "p1", "sprite")).toBe(false);
    expect(needsEditorReload("/project/p1/sprites", "p1", "spritesheet")).toBe(true);
    expect(needsEditorReload("/project/p1/board", "p1", "issue")).toBe(false);
  });
});
