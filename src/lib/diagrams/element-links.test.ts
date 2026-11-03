import { beforeEach, describe, expect, it } from "vitest";
import type { AssetRef, Diagram, DiagramNode } from "@/types";
import { replaceCache, storage } from "../storage";
import {
  addLink,
  countElementLinks,
  getElementLinks,
  getRelated,
  refLabel,
  relatedLabel,
  removeElementLinks,
  removeLink,
  restoreLinks,
} from "../links";
import { assetHref } from "../assets";
import { elementName } from "./elements";
import { migrateElementAssetLinks } from "./element-links";

const now = "2026-01-01T00:00:00.000Z";
const P = "p1";
const node = (id: string, type: DiagramNode["type"], label: string, data?: Record<string, unknown>): DiagramNode => ({ id, type, label, x: 0, y: 0, width: 100, height: 40, ...(data ? { data } : {}) });

function saveDiagram(nodes: DiagramNode[]): Diagram {
  const diagram: Diagram = { id: "canvas", projectId: P, name: "Data model", nodes, edges: [], tags: [], createdAt: now, updatedAt: now };
  storage.save("diagrams", diagram, P);
  return diagram;
}

const users: AssetRef = { type: "diagram", id: "canvas", elementId: "users" };
const ticks: AssetRef = { type: "diagram", id: "canvas", elementId: "ticks" };
const canvas: AssetRef = { type: "diagram", id: "canvas" };
const note: AssetRef = { type: "note", id: "note-1" };
const issue: AssetRef = { type: "issue", id: "issue-1" };

beforeEach(() => {
  replaceCache(new Map());
  storage.save("notes", { id: "note-1", projectId: P, title: "Sync API", content: "", tags: [], createdAt: now, updatedAt: now }, P);
  storage.save("issues", { id: "issue-1", projectId: P, title: "Conflicts", key: "T-1", tags: [] } as never, P);
  saveDiagram([node("users", "table", "users"), node("ticks", "table", "ticks"), node("box", "rectangle", "")]);
});

describe("elementName", () => {
  it("should use the first line of the label", () => {
    expect(elementName(node("a", "note", "Login\nmore text"))).toBe("Login");
  });

  it("should fall back to Untitled and the shape name when there is no text", () => {
    expect(elementName(node("a", "rectangle", "  "))).toBe("Untitled rectangle");
  });
});

describe("element links", () => {
  it("should show the element on the note's side as canvas › element", () => {
    addLink(P, users, note);
    expect(getRelated(P, "note", "note-1").map(relatedLabel)).toEqual(["Data model › users"]);
  });

  it("should list only the element's own links for an element", () => {
    addLink(P, users, note);
    addLink(P, ticks, issue);
    expect(getElementLinks(P, "canvas", "users").map((r) => r.id)).toEqual(["note-1"]);
  });

  it("should list the elements' links on the canvas as a whole, marked with the element", () => {
    addLink(P, users, note);
    addLink(P, canvas, issue);
    const related = getRelated(P, "diagram", "canvas");
    expect(related.map((r) => [r.id, r.viaElementName ?? null])).toEqual([
      ["note-1", "users"],
      ["issue-1", null],
    ]);
  });

  it("should keep links to different elements of one canvas apart", () => {
    addLink(P, users, note);
    addLink(P, ticks, note);
    addLink(P, canvas, note);
    expect(storage.getAll("links", P)).toHaveLength(3);
  });

  it("should not add the same element link twice, in either direction", () => {
    addLink(P, users, note);
    addLink(P, note, users);
    expect(storage.getAll("links", P)).toHaveLength(1);
  });

  it("should remove only the link to that element", () => {
    addLink(P, users, note);
    addLink(P, ticks, note);
    removeLink(P, note, users);
    expect(getRelated(P, "note", "note-1").map((r) => r.elementId)).toEqual(["ticks"]);
  });

  it("should leave a whole-canvas link when an element link is removed", () => {
    addLink(P, users, note);
    addLink(P, canvas, note);
    removeLink(P, users, note);
    expect(getRelated(P, "note", "note-1").map(relatedLabel)).toEqual(["Data model"]);
  });

  it("should count each element's links for the badges", () => {
    addLink(P, users, note);
    addLink(P, users, issue);
    addLink(P, ticks, note);
    expect(countElementLinks(P, storage.getById("diagrams", "canvas", P)!)).toEqual(new Map([["users", 2], ["ticks", 1]]));
  });

  it("should label a ref with its element", () => {
    expect(refLabel(P, users)).toBe("Data model › users");
  });

  it("should deep link to the element", () => {
    expect(assetHref(P, "diagram", "canvas", "users")).toBe("/project/p1/diagrams?open=canvas&element=users");
  });

  it("should drop the element's links when its canvas is deleted", () => {
    addLink(P, users, note);
    storage.delete("diagrams", "canvas", P);
    expect(storage.getAll("links", P)).toEqual([]);
  });
});

describe("deleting an element and undoing it", () => {
  it("should hide links to an element that is no longer on the canvas", () => {
    addLink(P, users, note);
    saveDiagram([node("ticks", "table", "ticks")]);
    expect(getRelated(P, "note", "note-1")).toEqual([]);
  });

  it("should remove the element's links and return them", () => {
    addLink(P, users, note);
    addLink(P, ticks, issue);
    const removed = removeElementLinks(P, "canvas", ["users"]);
    expect([removed.length, storage.getAll("links", P).length]).toEqual([1, 1]);
  });

  it("should restore the links once the element is back in the editor's unsaved canvas", () => {
    addLink(P, users, note);
    const removed = removeElementLinks(P, "canvas", ["users"]);
    const withoutUsers = saveDiagram([node("ticks", "table", "ticks")]);
    const undone = { ...withoutUsers, nodes: [node("users", "table", "users"), ...withoutUsers.nodes] };
    restoreLinks(P, removed, undone);
    expect(getElementLinks(P, "canvas", "users").map((r) => r.id)).toEqual(["note-1"]);
  });

  it("should not restore links while the element is still gone", () => {
    addLink(P, users, note);
    const removed = removeElementLinks(P, "canvas", ["users"]);
    saveDiagram([node("ticks", "table", "ticks")]);
    restoreLinks(P, removed);
    expect(storage.getAll("links", P)).toEqual([]);
  });
});

describe("migrateElementAssetLinks", () => {
  beforeEach(() => {
    saveDiagram([
      node("users", "table", "users", { columns: [], asset: note }),
      node("card", "asset", "Conflicts", { asset: issue }),
      node("gone", "rectangle", "Old", { asset: { type: "sprite", id: "deleted" } }),
    ]);
  });

  it("should turn an element's data.asset into an element link", () => {
    migrateElementAssetLinks(P);
    expect(getRelated(P, "note", "note-1").map(relatedLabel)).toEqual(["Data model › users"]);
  });

  it("should drop the old field from linked elements", () => {
    migrateElementAssetLinks(P);
    const nodes = storage.getById("diagrams", "canvas", P)!.nodes;
    expect(nodes.filter((n) => n.type !== "asset").map((n) => n.data?.asset)).toEqual([undefined, undefined]);
  });

  it("should keep asset cards showing their asset", () => {
    migrateElementAssetLinks(P);
    expect(storage.getById("diagrams", "canvas", P)!.nodes.find((n) => n.id === "card")?.data?.asset).toEqual(issue);
  });

  it("should do nothing the second time", () => {
    migrateElementAssetLinks(P);
    expect([migrateElementAssetLinks(P), storage.getAll("links", P).length]).toEqual([0, 1]);
  });

  it("should keep the canvas's edit time", () => {
    migrateElementAssetLinks(P);
    expect(storage.getById("diagrams", "canvas", P)!.updatedAt).toBe(now);
  });
});
