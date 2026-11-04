import { describe, expect, it, vi } from "vitest";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import type { DiagramEdge } from "@/types";
import { boardMenuEntries, edgeMenuEntries, elementMenuEntries, type ElementMenuActions, type ElementMenuState } from "./canvas-menu";

const actions = new Proxy({}, { get: () => vi.fn() }) as unknown as ElementMenuActions;
const base: ElementMenuState = {
  count: 1,
  links: [],
  openLabel: null,
  assetName: null,
  canEditText: true,
  color: undefined,
  hasGroups: false,
  canGroup: true,
  canPaste: false,
  isMac: true,
};

const labels = (entries: ContextMenuEntry[]): string[] => entries.map((e) => (e.kind === "separator" ? "—" : e.label));
const find = (entries: ContextMenuEntry[], key: string) => entries.find((e) => e.key === key);

describe("elementMenuEntries", () => {
  it("should offer linking, editing, clipboard, order, grouping and delete for one element", () => {
    expect(labels(elementMenuEntries(base, actions))).toEqual([
      "Link to…", "—", "Edit text", "Colour", "—", "Duplicate", "Copy", "Cut", "—", "Bring to front", "Send to back", "Group", "—", "Delete",
    ]);
  });

  it("should list the element's links and a way to remove each", () => {
    const link = { key: "n", label: "Sync API · Note", open: vi.fn(), remove: vi.fn() };
    const entries = elementMenuEntries({ ...base, links: [link] }, actions);
    const remove = find(entries, "remove-link");
    expect(remove?.kind === "item" && remove.submenu?.map((e) => e.key)).toEqual(["remove:n"]);
  });

  it("should open the linked item from the Linked items submenu", () => {
    const link = { key: "n", label: "Sync API · Note", open: vi.fn(), remove: vi.fn() };
    const linked = find(elementMenuEntries({ ...base, links: [link] }, actions), "linked");
    const first = linked?.kind === "item" ? linked.submenu?.[0] : undefined;
    if (first?.kind === "item") first.onSelect?.();
    expect(link.open).toHaveBeenCalled();
  });

  it("should show align and distribute only for several elements", () => {
    const keys = elementMenuEntries({ ...base, count: 3 }, actions).map((e) => e.key);
    expect([keys.includes("align"), keys.includes("distribute"), keys.includes("link-to")]).toEqual([true, true, false]);
  });

  it("should hide distribute for two elements", () => {
    expect(elementMenuEntries({ ...base, count: 2 }, actions).map((e) => e.key)).not.toContain("distribute");
  });

  it("should offer Open and the asset's own menu for an asset card", () => {
    const keys = elementMenuEntries({ ...base, openLabel: "Open sprite", assetName: "Pip" }, actions).map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(["open", "asset-menu"]));
  });

  it("should offer Ungroup instead of Group for a group", () => {
    const keys = elementMenuEntries({ ...base, hasGroups: true, canGroup: false }, actions).map((e) => e.key);
    expect([keys.includes("ungroup"), keys.includes("group")]).toEqual([true, false]);
  });

  it("should show the shortcuts for the platform", () => {
    const duplicate = find(elementMenuEntries({ ...base, isMac: false }, actions), "duplicate");
    expect(duplicate?.kind === "item" && duplicate.shortcut).toBe("Ctrl+D");
  });
});

describe("boardMenuEntries", () => {
  const board = { paste: vi.fn(), addShape: vi.fn(), selectAll: vi.fn(), autoArrange: vi.fn() };

  it("should offer paste, add shape, select all and auto-arrange", () => {
    expect(labels(boardMenuEntries({ canPaste: true, hasElements: true, isMac: true }, board))).toEqual(["Paste", "Add shape…", "Select all", "Auto-arrange"]);
  });

  it("should hide paste, select all and auto-arrange when they would do nothing", () => {
    expect(labels(boardMenuEntries({ canPaste: false, hasElements: false, isMac: true }, board))).toEqual(["Add shape…"]);
  });
});

describe("edgeMenuEntries", () => {
  const edgeActions = { editLabel: vi.fn(), lineStyle: vi.fn(), cardinality: vi.fn(), remove: vi.fn() };
  const line: DiagramEdge = { id: "e", from: "a", to: "b", type: "arrow" };

  it("should offer label, line style and delete for a line", () => {
    expect(labels(edgeMenuEntries(line, edgeActions))).toEqual(["Add label", "Line style", "—", "Delete line"]);
  });

  it("should add cardinality for a table relation", () => {
    expect(edgeMenuEntries({ ...line, cardinality: "one-to-many" }, edgeActions).map((e) => e.key)).toContain("cardinality");
  });
});
