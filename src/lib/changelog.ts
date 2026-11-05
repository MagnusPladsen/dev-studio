import type { AssetType } from "@/types";

export interface ChangelogItem {
  text: string;
  /** Only shown in apps that have this tool (`APP.assetTypes`). Leave out for changes both apps get. */
  tool?: AssetType;
}

export interface ChangelogEntry {
  /** Semver, like `package.json`'s `version`. */
  version: string;
  /** `YYYY-MM-DD`. */
  date: string;
  items: ChangelogItem[];
}

/**
 * What changed, newest first, in words for the people using the app. The first entry is the app's version:
 * add one here (and bump `package.json`, a test keeps them equal) when a release has something worth telling.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0-beta",
    date: "2026-11-04",
    items: [
      { text: "Use with Claude: connect Claude Desktop or Claude Code to your projects from the sidebar." },
      { text: "Changes Claude makes show up live in the editor you have open." },
      { text: "Canvas auto-layout arranges a board as a grid, flow, tree or table diagram." },
      { text: "Tilemap auto-tiling and a collision layer.", tool: "tilemap" },
      { text: "Pixel Art animation tags and per-frame durations.", tool: "sprite" },
    ],
  },
  {
    version: "0.1.0-beta",
    date: "2026-11-03",
    items: [
      { text: "Import in every tool: drop a file on the editor or use the Import menu." },
      { text: "Edits from your other tabs and devices appear live." },
      { text: "Link a single Canvas element to any asset, and right-click for more actions." },
      { text: "Canvas shape library, templates and a table shape for database diagrams." },
      { text: "Decision log for recording architecture decisions." },
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;

interface ParsedVersion {
  numbers: number[];
  prerelease: string;
}

function parseVersion(version: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());
  if (!match) return null;
  return { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] ?? "" };
}

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. A release beats its own prerelease. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return Number(!!left) - Number(!!right);
  for (let index = 0; index < 3; index++) {
    const difference = left.numbers[index] - right.numbers[index];
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease, "en", { numeric: true });
}

/** The changelog with items for tools this app doesn't have dropped, and entries left empty by that removed. */
export function changelogForApp(assetTypes: readonly AssetType[], changelog: ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  return changelog
    .map((entry) => ({ ...entry, items: entry.items.filter((item) => !item.tool || assetTypes.includes(item.tool)) }))
    .filter((entry) => entry.items.length > 0);
}

/** Entries newer than the version the visitor last saw. Nothing on a first visit (`seen` null) or a version we can't read. */
export function entriesNewerThan(seen: string | null, assetTypes: readonly AssetType[], changelog: ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  if (seen === null || !parseVersion(seen)) return [];
  return changelogForApp(assetTypes, changelog).filter((entry) => compareVersions(entry.version, seen) > 0);
}
