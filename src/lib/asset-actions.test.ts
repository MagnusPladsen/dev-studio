import { beforeEach, describe, expect, it } from "vitest";
import type {
  AssetRef,
  Board,
  Diagram,
  Issue,
  Note,
  Palette,
  Project,
  SoundEffect,
  SpriteSheet,
  StoryEntry,
  TilemapData,
  Sprite,
} from "@/types";
import { replaceCache, storage } from "./storage";
import { addLink, getRelated } from "./links";
import { isAssetPinned, toggleAssetPin } from "./pins";
import {
  addAssetToDiagram,
  cloneAsset,
  assetUrl,
  createDiagramWith,
  createNoteAbout,
  createTaskFor,
  deleteAsset,
  deleteConfirmMessage,
  duplicateAsset,
  findReferences,
  getAssetName,
  renameAsset,
  systemClipboardPayload,
  uniqueName,
  type StoredAsset,
} from "./asset-actions";

const now = "2026-01-01T00:00:00.000Z";
const pip: AssetRef = { type: "sprite", id: "sprite-pip" };
const storyRef: AssetRef = { type: "story", id: "story-pip" };
const noteRef: AssetRef = { type: "note", id: "note-1" };
const issueRef: AssetRef = { type: "issue", id: "issue-1" };
const soundRef: AssetRef = { type: "sound", id: "sound-jump" };

const spriteItem: Sprite = {
  id: pip.id,
  projectId: "p1",
  name: "Pip",
  width: 16,
  height: 16,
  frames: [{ id: "f1", pixels: "data:image/png;base64,AAA", layers: [] } as unknown as Sprite["frames"][number]],
  fps: 8,
  tags: [],
  createdAt: now,
  updatedAt: now,
};

function board(): Board {
  return {
    id: "board-1",
    projectId: "p1",
    name: "Task Board",
    keyPrefix: "PIP",
    nextNumber: 2,
    columns: [
      { id: "todo", name: "To do", color: "#000", category: "todo" },
      { id: "doing", name: "Doing", color: "#000", category: "doing" },
      { id: "done", name: "Done", color: "#000", category: "done" },
    ],
    sprints: [],
    createdAt: now,
    updatedAt: now,
  };
}

function seedProject(id: string, name: string): void {
  const project: Project = { id, name, description: "", createdAt: now, updatedAt: now };
  storage.save("projects", project);
}

beforeEach(() => {
  replaceCache(new Map());
  seedProject("p1", "Pip's Quest");
  seedProject("p2", "Other");
  storage.save("sprites", { ...spriteItem, example: true } as Sprite, "p1");
  const meadow: TilemapData = {
    id: "meadow",
    projectId: "p1",
    name: "Meadow",
    width: 1,
    height: 1,
    tileSize: 16,
    layers: [{ id: "l1", name: "Ground", visible: true, tiles: [[pip.id]] }],
    tilesetSpriteIds: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("tilemaps", meadow, "p1");
  const sheet: SpriteSheet = {
    id: "sheet",
    projectId: "p1",
    name: "Characters",
    spriteIds: [pip.id],
    padding: 0,
    powerOfTwo: false,
    createdAt: now,
  };
  storage.save("spritesheets", sheet, "p1");
  const flow: Diagram = {
    id: "flow",
    projectId: "p1",
    name: "Flow",
    nodes: [{ id: "n1", type: "custom", x: 100, y: 50, width: 140, height: 56, label: "Pip", data: { asset: pip } }],
    edges: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("diagrams", flow, "p1");
  storage.save("diagrams", { ...flow, id: "empty", name: "Empty", nodes: [] }, "p1");
  const story: StoryEntry = {
    id: storyRef.id,
    projectId: "p1",
    title: "Pip",
    content: "",
    type: "character",
    links: [{ targetId: pip.id, targetType: "sprite" }],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("stories", story, "p1");
  storage.save("boards", board(), "p1");
  const issue: Issue = {
    id: issueRef.id,
    projectId: "p1",
    key: "PIP-1",
    title: "Fix jump",
    description: "",
    type: "task",
    priority: "medium",
    status: "doing",
    sprintId: "s1",
    labels: [],
    order: 1000,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("issues", issue, "p1");
  const note: Note = { id: noteRef.id, projectId: "p1", title: "Ideas", content: "", tags: [], createdAt: now, updatedAt: now };
  storage.save("notes", note, "p1");
  const sound: SoundEffect = {
    id: soundRef.id,
    projectId: "p2",
    name: "Jump",
    params: {} as SoundEffect["params"],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("sounds", sound, "p2");
});

describe("names", () => {
  it("reads title for story / note / issue and name otherwise", () => {
    expect(getAssetName("note", { title: "Ideas" })).toBe("Ideas");
    expect(getAssetName("sprite", { name: "" })).toBe("Untitled");
  });

  it("makes names unique", () => {
    expect(uniqueName("Pip", [])).toBe("Pip");
    expect(uniqueName("Pip", ["Pip"])).toBe("Pip copy");
    expect(uniqueName("Pip", ["Pip", "Pip copy"])).toBe("Pip copy 2");
  });

  it("renames with trimming and ignores empty names", () => {
    renameAsset("p1", storyRef, "  Meadow tale  ");
    expect(storage.getById("stories", storyRef.id, "p1")!.title).toBe("Meadow tale");
    renameAsset("p1", storyRef, "   ");
    expect(storage.getById("stories", storyRef.id, "p1")!.title).toBe("Meadow tale");
    renameAsset("p1", pip, "Pop");
    expect(storage.getById("sprites", pip.id, "p1")!.name).toBe("Pop");
  });
});

describe("duplicate", () => {
  it("copies a sprite without links or example flag", () => {
    addLink("p1", pip, noteRef);
    const copy = duplicateAsset("p1", pip)!;
    const stored = storage.getById("sprites", copy.id, "p1")!;
    expect(copy.id).not.toBe(pip.id);
    expect(stored.name).toBe("Pip copy");
    expect("example" in stored).toBe(false);
    expect(stored.frames).toEqual(storage.getById("sprites", pip.id, "p1")!.frames);
    expect(getRelated("p1", "sprite", copy.id)).toEqual([]);
  });

  it("empties story links", () => {
    expect(storage.getById("stories", duplicateAsset("p1", storyRef)!.id, "p1")!.links).toEqual([]);
  });

  it("gives a duplicated issue a new key and keeps status and sprint", () => {
    const stored = storage.getById("issues", duplicateAsset("p1", issueRef)!.id, "p1")!;
    expect(stored).toMatchObject({ key: "PIP-2", status: "doing", sprintId: "s1" });
  });

  it("returns null for a missing asset", () => {
    expect(duplicateAsset("p1", { type: "sprite", id: "nope" })).toBeNull();
  });
});

describe("references and delete", () => {
  it("finds users of a sprite in a fixed order", () => {
    expect(findReferences("p1", pip).map((a) => a.name)).toEqual(["Meadow", "Characters", "Flow"]);
    expect(deleteConfirmMessage("p1", pip)).toContain("Used in Meadow, Characters, Flow.");
    expect(deleteConfirmMessage("p1", noteRef)).toBe("Delete “Ideas”? Its links are removed too.");
  });

  it("cleans links, story links and pins but leaves id references", () => {
    addLink("p1", pip, noteRef);
    toggleAssetPin("p1", pip);
    deleteAsset("p1", pip);
    expect(storage.getById("sprites", pip.id, "p1")).toBeUndefined();
    expect(storage.getAll("links", "p1").some((l) => l.from.id === pip.id || l.to.id === pip.id)).toBe(false);
    expect(storage.getById("stories", storyRef.id, "p1")!.links.some((l) => l.targetId === pip.id)).toBe(false);
    expect(isAssetPinned("p1", pip)).toBe(false);
    expect(storage.getById("tilemaps", "meadow", "p1")!.layers[0].tiles[0][0]).toBe(pip.id);
  });
});

describe("diagram, note and task helpers", () => {
  it("adds a node at 0,0 in an empty diagram", () => {
    expect(addAssetToDiagram("p1", "empty", noteRef)!.nodes.at(-1)).toMatchObject({
      type: "asset",
      x: 0,
      y: 0,
      width: 220,
      height: 64,
      data: { asset: noteRef },
    });
  });

  it("adds a node right of the rightmost one", () => {
    expect(addAssetToDiagram("p1", "flow", noteRef)!.nodes.at(-1)).toMatchObject({ x: 280, y: 50 });
  });

  it("creates a canvas containing the asset", () => {
    const diagram = createDiagramWith("p1", pip);
    expect(diagram.name).toBe("Pip canvas");
    expect(diagram.nodes[0]).toMatchObject({ label: "Pip", data: { asset: pip } });
    expect(storage.getById("diagrams", diagram.id, "p1")).toBeDefined();
  });

  it("creates a linked note that keeps wiki links to the entry resolving", () => {
    const note = createNoteAbout("p1", pip);
    expect(note.title).toBe("Notes on Pip");
    expect(getRelated("p1", "sprite", pip.id).some((r) => r.id === note.id)).toBe(true);
  });

  it("creates a task, making the default board when the project has none", () => {
    const issue = createTaskFor("p2", soundRef);
    expect(issue).toMatchObject({ title: "Jump", status: storage.getAll("boards", "p2")[0].columns[0].id });
    expect(getRelated("p2", "sound", soundRef.id).map((r) => r.id)).toContain(issue.id);
  });
});

describe("system clipboard", () => {
  const palette: Palette = { id: "pal", projectId: "p1", name: "Pal", colors: [], createdAt: now };

  it("builds text and png payloads by type", () => {
    expect(systemClipboardPayload("palette", { ...palette, colors: ["#1a1c2c", "#5d275d"] })).toEqual({
      kind: "text",
      text: "#1a1c2c\n#5d275d",
    });
    const issueItem = storage.getById("issues", issueRef.id, "p1")!;
    expect(systemClipboardPayload("issue", { ...issueItem, key: "PIP-3", title: "Fix jump" })).toEqual({
      kind: "text",
      text: "PIP-3 Fix jump",
    });
    expect(systemClipboardPayload("sprite", spriteItem)).toEqual({ kind: "png", dataUrl: spriteItem.frames[0].pixels });
    expect(systemClipboardPayload("sound", storage.getById("sounds", soundRef.id, "p2")!)).toEqual({
      kind: "text",
      text: "Jump",
    });
    const tree = {
      id: "t",
      projectId: "p1",
      name: "Talk",
      nodes: [{ speaker: "Pip", text: "Hi" }, { text: "Go?", choices: [{ text: "Yes" }] }],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as StoredAsset;
    expect(systemClipboardPayload("dialogue", tree)).toEqual({ kind: "text", text: "Pip: Hi\nGo?\n- Yes" });
  });

  it("builds an asset url", () => {
    expect(assetUrl("https://gamedev-studio.pladsen.dev", "p1", noteRef)).toBe(
      "https://gamedev-studio.pladsen.dev/project/p1/notebook?open=note-1"
    );
  });
});

describe("cloneAsset placement and isolation", () => {
  const sourceIssue = (): Issue => storage.getById("issues", issueRef.id, "p1")!;

  it("puts a backlog issue in the target board's first column with its next key", () => {
    const clone = cloneAsset("issue", sourceIssue(), "p2", "backlog") as Issue;
    const targetBoard = storage.getAll("boards", "p2")[0];
    expect(clone).toMatchObject({
      projectId: "p2",
      status: targetBoard.columns[0].id,
      sprintId: null,
      key: `${targetBoard.keyPrefix}-1`,
      archived: false,
    });
    expect(clone.resolvedAt).toBeUndefined();
    expect(clone.id).not.toBe(issueRef.id);
  });

  it("sets resolvedAt only when the target column is done", () => {
    storage.save("issues", { ...sourceIssue(), status: "done", resolvedAt: undefined }, "p1");
    const inDone = cloneAsset("issue", sourceIssue(), "p1", "in-place") as Issue;
    expect(inDone.resolvedAt).toBeDefined();
    const inBacklog = cloneAsset("issue", sourceIssue(), "p1", "backlog") as Issue;
    expect(inBacklog.status).toBe("todo");
    expect(inBacklog.resolvedAt).toBeUndefined();
  });

  it("orders after the highest order in the target status", () => {
    storage.save("issues", { ...sourceIssue(), id: "other", key: "PIP-9", order: 4500 }, "p1");
    const clone = cloneAsset("issue", sourceIssue(), "p1", "in-place") as Issue;
    expect(clone.order).toBe(5500);
  });

  it("adds ' copy' only when the name exists in the target project", () => {
    const spriteSource = getSprite();
    expect((cloneAsset("sprite", spriteSource, "p2", "in-place") as Sprite).name).toBe("Pip");
    storage.save("sprites", { ...spriteSource, id: "p2-pip", projectId: "p2" }, "p2");
    expect((cloneAsset("sprite", spriteSource, "p2", "in-place") as Sprite).name).toBe("Pip copy");
  });

  it("deep copies so editing the clone leaves the source untouched", () => {
    const spriteSource = getSprite();
    const clone = cloneAsset("sprite", spriteSource, "p2", "in-place") as Sprite;
    clone.frames[0].pixels = "changed";
    clone.frames.push(clone.frames[0]);
    expect(spriteSource.frames).toHaveLength(1);
    expect(spriteSource.frames[0].pixels).toBe("data:image/png;base64,AAA");
  });
});

function getSprite(): Sprite {
  return storage.getById("sprites", pip.id, "p1")!;
}
