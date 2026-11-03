import type { ProjectCollection } from "../storage";

export interface ExampleContext {
  projectId: string;
  /** Stable id for an example slug in this project, e.g. id("hero"). Use it for cross-references. */
  id(slug: string): string;
}

export interface ExampleModule {
  collection: ProjectCollection;
  /** Names/titles that examples from older versions were saved under (without the `example` flag). */
  legacyNames?: string[];
  /**
   * Builds this tool's example assets. Runs in the browser (canvas is available).
   * Each item needs `id: ctx.id(slug)` and its name/title; projectId, timestamps, tags and the
   * `example` flag are filled in for you.
   */
  build(ctx: ExampleContext): Promise<Record<string, unknown>[]> | Record<string, unknown>[];
}

/** Slugs every example module can rely on (for links and cross-references between tools). */
export const EXAMPLE_SLUGS = {
  sprites: ["hero", "slime", "coin", "heart", "sword", "chest", "tile-grass", "tile-dirt", "tile-stone", "tile-water"],
  sounds: ["jump", "coin", "laser", "explosion", "hurt", "powerup", "select", "door"],
  music: ["melody", "chill-loop", "title-theme", "boss-battle"],
  tilemaps: ["meadow"],
  spritesheets: ["characters"],
  models: ["hero-3d", "coin-3d", "chest-3d", "slime-3d", "tree-3d"],
  palettes: ["meadow-palette", "dungeon-palette"],
  diagrams: ["pip-moodboard", "meadow-plan", "core-loop", "player-states", "enemy-ai", "screen-flow", "save-data"],
  dialogues: ["merchant", "elder-quest", "gate-guard"],
  stories: ["hero", "village", "sword", "elder", "forest", "shadow-king", "quest-sword", "lore-fall"],
  notes: ["welcome", "design-doc", "todo", "bugs"],
  decisions: ["adr-pixel-scale", "adr-checkpoint-saves", "adr-autosave"],
  issues: ["i-movement", "i-jump-feel", "i-slime-ai", "i-meadow-level", "i-title-music", "i-coin-sfx", "i-jump-bug", "i-dialogue-ui", "i-sword-sprite", "i-save-system"],
} as const;
