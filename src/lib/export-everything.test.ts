import { beforeEach, describe, expect, it } from "vitest";
import type { AssetRelation, Note, Project } from "@/types";
import { BUNDLE_FORMAT, replaceCache, storage } from "./storage";
import { buildEverythingExport, everythingFileName } from "./export-everything";

const TIME = "2026-11-03T10:00:00.000Z";

const project = (id: string, app?: Project["app"]): Project => ({ id, name: id, description: "", app, createdAt: TIME, updatedAt: TIME });
const note = (id: string, projectId: string): Note => ({ id, projectId, title: id, content: "", tags: [], createdAt: TIME, updatedAt: TIME });
const link = (id: string, projectId: string, from: string, to: string): AssetRelation => ({
  id,
  projectId,
  from: { type: "note", id: from },
  to: { type: "note", id: to },
  createdAt: TIME,
  updatedAt: TIME,
});

beforeEach(() => {
  replaceCache(new Map());
  storage.save("projects", project("game", "gamedev-studio"));
  storage.save("projects", project("app", "dev-studio"));
  storage.save("notes", note("n1", "game"), "game");
  storage.save("notes", note("n2", "game"), "game");
  storage.save("links", link("l1", "game", "n1", "n2"), "game");
  storage.save("notes", note("n3", "app"), "app");
});

describe("buildEverythingExport", () => {
  it("holds every project of both apps, each in the single-project export format", () => {
    const bundle = JSON.parse(buildEverythingExport(new Date(TIME)));
    expect(bundle).toMatchObject({ format: BUNDLE_FORMAT, version: 1, exportedAt: TIME });
    expect(bundle.projects).toHaveLength(2);
    expect(bundle.projects[0]).toEqual(JSON.parse(storage.exportProject("game")));
    expect(bundle.projects[0].links).toHaveLength(1);
    expect(bundle.projects[1].project.app).toBe("dev-studio");
  });

  it("re-imports through the projects list import, keeping each project's app and links", () => {
    const file = buildEverythingExport();
    replaceCache(new Map());

    expect(storage.importProject(file)?.id).toBe("game");
    expect(storage.getAll("projects").map((p) => [p.id, p.app])).toEqual([
      ["game", "gamedev-studio"],
      ["app", "dev-studio"],
    ]);
    expect(storage.getAll("notes", "game").map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(storage.getAll("links", "game")).toHaveLength(1);
    expect(storage.getAll("notes", "app").map((n) => n.id)).toEqual(["n3"]);
  });

  it("still makes a single project file a project of this app", () => {
    const single = storage.exportProject("app");
    replaceCache(new Map());
    expect(storage.importProject(single)?.app).toBe("gamedev-studio");
  });

  it("rejects a bundle without projects", () => {
    expect(storage.importProject(JSON.stringify({ format: BUNDLE_FORMAT, version: 1, projects: [] }))).toBeNull();
  });
});

describe("everythingFileName", () => {
  it("names the file after the app and the local date", () => {
    expect(everythingFileName("dev-studio", new Date(2026, 0, 5, 23, 30))).toBe("dev-studio-export-2026-01-05.json");
  });
});
