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
    version: "0.4.1-beta",
    date: "2026-11-10",
    items: [
      { text: "Projects are grouped into My projects and Shared with me, and each one shows who owns it, your role, or how many people you shared it with." },
    ],
  },
  {
    version: "0.4.0-beta",
    date: "2026-11-10",
    items: [
      { text: "Share a project: invite people with a link as editors or viewers, and work on it together live. Find Share on the project page." },
    ],
  },
  {
    version: "0.3.0-beta",
    date: "2026-11-06",
    items: [
      {
        text: "Export for game: OGG or WAV that loops cleanly in your engine, an intro + loop pair, a fade-out version, stems, and MIDI.",
        tool: "music",
      },
    ],
  },
  {
    version: "0.2.0-beta",
    date: "2026-11-04",
    items: [
      { text: "Use with Claude: connect Claude Desktop or Claude Code to your projects from the sidebar." },
      { text: "Changes Claude makes show up live in the editor you have open." },
      { text: "Canvas auto-layout arranges a board as a grid, flow, tree or table diagram." },
      { text: "Tilemap auto-tiling and a collision layer.", tool: "tilemap" },
      { text: "Pixel Art animation tags and per-frame durations.", tool: "sprite" },
      { text: "Music WAV export now sounds the same as Play: notes fade out the same way and drums keep their filter.", tool: "music" },
      {
        text: "Sound Effects sound the same in the waveform, on Play and in the WAV. The high-pass filter really filters, pitch slides curve, and Repeat Speed works like sfxr. Sounds you already saved keep their old sound.",
        tool: "sound",
      },
      {
        text: "Sound Effects Finish panel: trim with drag handles, fade in/out, normalize, gain, pitch & speed and reverse, all still editable later.",
        tool: "sound",
      },
      { text: "Lock the grid to a key and scale so every note you place fits, and hear each note as you place it.", tool: "music" },
      {
        text: "Export WAV at 22/44.1/48 kHz in 8 or 16-bit, zip 5 variations or all your sounds, lock settings while you Random or Mutate, and get back any of your last 10 drafts.",
        tool: "sound",
      },
      { text: "Undo right after an undo or redo now steps back one change at a time." },
      { text: "Hold Space and drag to move around Canvas, Dialogue, the connection graph, Pixel Art, the Music piano roll and 3D Pixel Art without moving or drawing anything." },
      { text: "Right-click works everywhere in the studio: links can be opened or copied, and spots with nothing to do say so. Deletes and renames ask in the app instead of a browser popup." },
      {
        text: "Export for engine: Pixel Art and Tilemap download a ready-to-load zip for Godot 4, Unity, Phaser 3 or Tiled.",
        tool: "sprite",
      },
      {
        text: "Dialogue variables, condition else-branches and set nodes, a live preview, plus Yarn Spinner export and a localisation CSV you can translate and import back.",
        tool: "dialogue",
      },
      {
        text: "Music instrument presets (Lead, Soft Pad, Bass, Pluck, Bell, Chip Square, drum kits) with attack, decay, sustain, release and vibrato for each channel.",
        tool: "music",
      },
      {
        text: "Build a song from sections: an intro that plays once, then parts that loop. Export the whole song or one section, and use Show channels to share patterns between sections.",
        tool: "music",
      },
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
