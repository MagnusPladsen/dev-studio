import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { APP_VERSION, CHANGELOG, changelogForApp, compareVersions, entriesNewerThan, type ChangelogEntry } from "./changelog";

const SAMPLE: ChangelogEntry[] = [
  { version: "0.3.0-beta", date: "2026-11-06", items: [{ text: "Tilemap only", tool: "tilemap" }] },
  { version: "0.2.0-beta", date: "2026-11-04", items: [{ text: "Both apps" }, { text: "Sprites", tool: "sprite" }] },
  { version: "0.1.0-beta", date: "2026-11-03", items: [{ text: "First" }] },
];

describe("compareVersions", () => {
  it.each([
    ["0.1.0-beta", "0.2.0-beta", -1],
    ["0.2.0-beta", "0.1.0-beta", 1],
    ["0.2.0-beta", "0.2.0-beta", 0],
    ["0.10.0", "0.9.0", 1],
    ["1.0.0", "1.0.0-beta", 1],
    ["1.0.0-beta.2", "1.0.0-beta.10", -1],
    ["1.0.0-alpha", "1.0.0-beta", -1],
    ["2.0.0", "1.99.99", 1],
  ])("compares %s with %s", (a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected);
  });

  it("counts a version it can't read as older", () => {
    expect(compareVersions("rubbish", "0.1.0")).toBeLessThan(0);
    expect(compareVersions("0.1.0", "rubbish")).toBeGreaterThan(0);
  });
});

describe("entriesNewerThan", () => {
  const gamedev = ["tilemap", "sprite"] as const;

  it("shows nothing on a first visit", () => {
    expect(entriesNewerThan(null, gamedev, SAMPLE)).toEqual([]);
  });

  it("shows nothing when the stored version is current or unreadable", () => {
    expect(entriesNewerThan("0.3.0-beta", gamedev, SAMPLE)).toEqual([]);
    expect(entriesNewerThan("garbage", gamedev, SAMPLE)).toEqual([]);
  });

  it("lists every entry newer than the stored version, newest first", () => {
    expect(entriesNewerThan("0.1.0-beta", gamedev, SAMPLE).map((entry) => entry.version)).toEqual(["0.3.0-beta", "0.2.0-beta"]);
  });

  it("drops items for tools the app doesn't have, and entries left empty", () => {
    const devStudio = entriesNewerThan("0.1.0-beta", ["issue", "diagram"], SAMPLE);
    expect(devStudio).toEqual([{ version: "0.2.0-beta", date: "2026-11-04", items: [{ text: "Both apps" }] }]);
  });
});

describe("CHANGELOG", () => {
  it("has the package.json version as its newest entry", () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it("is sorted newest first with unique, readable versions and dates", () => {
    for (let index = 1; index < CHANGELOG.length; index++) {
      expect(compareVersions(CHANGELOG[index - 1].version, CHANGELOG[index].version)).toBeGreaterThan(0);
    }
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it("keeps something to show in Dev Studio", () => {
    expect(changelogForApp(["issue", "diagram", "story", "note", "decision"]).length).toBeGreaterThan(0);
  });
});
