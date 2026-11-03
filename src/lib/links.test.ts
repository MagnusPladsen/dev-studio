import { beforeEach, describe, expect, it } from "vitest";
import type { AssetLink, Sprite } from "@/types";
import { replaceCache, storage } from "./storage";
import { addLink, countRelated, dropDeletedLinkTargets, getRelated, linksTouching, restoreLinks } from "./links";

const now = "2026-01-01T00:00:00.000Z";
const toPip: AssetLink = { targetId: "sprite-pip", targetType: "sprite" };
const toDeletedSprite: AssetLink = { targetId: "sprite-gone", targetType: "sprite" };
const toDeletedNote: AssetLink = { targetId: "note-gone", targetType: "note" };

describe("dropDeletedLinkTargets", () => {
  beforeEach(() => {
    replaceCache(new Map());
    const pip = { id: "sprite-pip", projectId: "p1", name: "Pip", tags: [], createdAt: now, updatedAt: now } as unknown as Sprite;
    storage.save("sprites", pip, "p1");
  });

  it("should keep links when their targets still exist", () => {
    expect(dropDeletedLinkTargets("p1", [toPip])).toEqual({ links: [toPip], dropped: 0 });
  });

  it("should drop links when their targets were deleted", () => {
    expect(dropDeletedLinkTargets("p1", [toPip, toDeletedSprite, toDeletedNote])).toEqual({ links: [toPip], dropped: 2 });
  });

  it("should return nothing to drop when there are no links", () => {
    expect(dropDeletedLinkTargets("p1", [])).toEqual({ links: [], dropped: 0 });
  });

  it("should drop a link when its target lives in another project", () => {
    expect(dropDeletedLinkTargets("p2", [toPip])).toEqual({ links: [], dropped: 1 });
  });
});

describe("countRelated", () => {
  const save = (collection: "issues" | "notes" | "sprites" | "stories", id: string, extra: Record<string, unknown> = {}) =>
    storage.save(collection, { id, projectId: "p1", name: id, title: id, tags: [], links: [], createdAt: now, updatedAt: now, ...extra } as never, "p1");

  beforeEach(() => {
    replaceCache(new Map());
    for (const id of ["issue-a", "issue-b", "issue-c"]) save("issues", id);
    save("notes", "note-1");
    save("notes", "note-2");
    save("sprites", "sprite-1");
    save("stories", "story-1", { links: [{ targetId: "issue-a", targetType: "issue" }] });
    addLink("p1", { type: "issue", id: "issue-a" }, { type: "note", id: "note-1" });
    addLink("p1", { type: "note", id: "note-2" }, { type: "issue", id: "issue-a" });
    addLink("p1", { type: "issue", id: "issue-a" }, { type: "sprite", id: "sprite-1" });
    addLink("p1", { type: "issue", id: "issue-a" }, { type: "issue", id: "issue-b" });
    addLink("p1", { type: "issue", id: "issue-a" }, { type: "story", id: "story-1" });
    storage.save("links", { id: "dangling", projectId: "p1", from: { type: "issue", id: "issue-b" }, to: { type: "sprite", id: "gone" }, createdAt: now, updatedAt: now }, "p1");
  });

  it("matches getRelated for every issue", () => {
    const ids = ["issue-a", "issue-b", "issue-c"];
    const counts = countRelated("p1", ids);
    for (const id of ids) {
      const related = getRelated("p1", "issue", id);
      const notes = related.filter((r) => r.type === "note").length;
      expect(counts.get(id), id).toEqual({ notes, others: related.length - notes });
    }
    expect(counts.get("issue-a")).toEqual({ notes: 2, others: 3 });
  });
});

describe("restoreLinks", () => {
  beforeEach(() => {
    replaceCache(new Map());
    for (const id of ["issue-a", "issue-b"]) storage.save("issues", { id, projectId: "p1", title: id } as never, "p1");
    addLink("p1", { type: "issue", id: "issue-a" }, { type: "issue", id: "issue-b" });
  });

  it("brings back the links an issue lost when it was deleted and undone", () => {
    const remembered = linksTouching("p1", ["issue-a"]).get("issue-a") ?? [];
    const issue = storage.getById("issues", "issue-a", "p1")!;
    storage.delete("issues", "issue-a", "p1");
    expect(storage.getAll("links", "p1")).toEqual([]);
    storage.save("issues", issue, "p1");
    restoreLinks("p1", remembered);
    expect(storage.getAll("links", "p1")).toEqual(remembered);
  });

  it("skips links whose other end is gone and links that already exist", () => {
    const remembered = linksTouching("p1", ["issue-a"]).get("issue-a") ?? [];
    restoreLinks("p1", remembered);
    expect(storage.getAll("links", "p1")).toHaveLength(1);
    storage.delete("issues", "issue-b", "p1");
    restoreLinks("p1", remembered);
    expect(storage.getAll("links", "p1")).toEqual([]);
  });
});
