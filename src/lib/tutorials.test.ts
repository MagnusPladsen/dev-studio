import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@/types";
import { replaceCache, storage } from "./storage";
import { HELP } from "./help-content";
import {
  TUTORIALS_SEEN_KEY,
  areTutorialsOn,
  getSeenTutorials,
  markTutorialSeen,
  setProjectTutorials,
  shouldShowTutorial,
  tutorialTopicForPath,
} from "./tutorials";

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const showable = { isEnabled: true, topic: "music", seen: [], isOtherDialogOpen: false } as const;

describe("shouldShowTutorial", () => {
  it("should show when tutorials are on and the tool is unseen", () => {
    expect(shouldShowTutorial(showable)).toBe(true);
  });

  it("should not show when tutorials are off", () => {
    expect(shouldShowTutorial({ ...showable, isEnabled: false })).toBe(false);
  });

  it("should not show when the tool was already seen", () => {
    expect(shouldShowTutorial({ ...showable, seen: ["music"] })).toBe(false);
  });

  it("should not show when the page is not a tool", () => {
    expect(shouldShowTutorial({ ...showable, topic: null })).toBe(false);
  });

  it("should not show when another dialog is open", () => {
    expect(shouldShowTutorial({ ...showable, isOtherDialogOpen: true })).toBe(false);
  });
});

describe("seen tutorials", () => {
  it("should return nothing when nothing was stored", () => {
    expect(getSeenTutorials("p1", memoryStore())).toEqual([]);
  });

  it("should remember a tool when it is marked seen", () => {
    const store = memoryStore();
    markTutorialSeen("p1", "music", store);
    expect(getSeenTutorials("p1", store)).toEqual(["music"]);
  });

  it("should keep projects apart when a tool is marked seen in one", () => {
    const store = memoryStore();
    markTutorialSeen("p1", "music", store);
    expect(getSeenTutorials("p2", store)).toEqual([]);
  });

  it("should not duplicate a tool when it is marked seen twice", () => {
    const store = memoryStore();
    markTutorialSeen("p1", "sfx", store);
    markTutorialSeen("p1", "sfx", store);
    expect(getSeenTutorials("p1", store)).toEqual(["sfx"]);
  });

  it("should return nothing when the stored value is broken", () => {
    expect(getSeenTutorials("p1", memoryStore({ [TUTORIALS_SEEN_KEY]: "{not json" }))).toEqual([]);
  });

  it("should not throw when storage refuses writes", () => {
    const store = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => markTutorialSeen("p1", "music", store)).not.toThrow();
  });

  it("should not throw when there is no storage", () => {
    expect(() => markTutorialSeen("p1", "music", null)).not.toThrow();
  });
});

describe("tutorialTopicForPath", () => {
  it("should return the tool when the path is a tool page", () => {
    expect(tutorialTopicForPath("/project/p1/pixel-art", "p1")).toBe("pixel-art");
  });

  it("should return the dashboard when the path is the assets page", () => {
    expect(tutorialTopicForPath("/project/p1/assets", "p1")).toBe("assets");
  });

  it("should return null when the path is outside the project", () => {
    expect(tutorialTopicForPath("/projects", "p1")).toBeNull();
  });

  it("should return null when the segment is not a tool", () => {
    expect(tutorialTopicForPath("/project/p1/settings", "p1")).toBeNull();
  });
});

describe("project tutorial flag", () => {
  const now = "2026-01-01T00:00:00.000Z";
  const project: Project = { id: "p1", name: "Pip's Quest", description: "", createdAt: now, updatedAt: now };

  beforeEach(() => {
    replaceCache(new Map());
    storage.save("projects", project);
  });

  it("should be off when an older project has no flag", () => {
    expect(areTutorialsOn(project)).toBe(false);
  });

  it("should be on when the flag is set", () => {
    setProjectTutorials("p1", true);
    expect(areTutorialsOn(storage.getById("projects", "p1"))).toBe(true);
  });

  it("should be off when the flag is turned off", () => {
    setProjectTutorials("p1", true);
    setProjectTutorials("p1", false);
    expect(areTutorialsOn(storage.getById("projects", "p1"))).toBe(false);
  });
});

describe("help features", () => {
  it("should list three to five features when a tool's help is defined", () => {
    for (const help of Object.values(HELP)) expect(help.canDo.length).toBeGreaterThanOrEqual(3);
    for (const help of Object.values(HELP)) expect(help.canDo.length).toBeLessThanOrEqual(5);
  });
});
