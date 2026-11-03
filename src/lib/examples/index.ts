import type { AssetRef } from "@/types";
import { storage, PROJECT_COLLECTIONS, type ProjectCollection } from "../storage";
import { addLink } from "../links";
import type { ExampleContext, ExampleModule } from "./types";
import { artExamples } from "./art";
import { audioExamples } from "./audio";
import { levelExamples } from "./levels";
import { planningExamples } from "./planning";
import { writingExamples } from "./writing";
import { boardExamples, removeExampleSprints } from "./board";
import { modelExamples } from "./models";
import { devStudioExamples, DEV_STUDIO_LINKS } from "./dev-studio";
import { isDevStudio } from "../app-config";

export type { ExampleModule, ExampleContext } from "./types";
export { EXAMPLE_SLUGS } from "./types";

const GAME_MODULES: ExampleModule[] = [...artExamples, ...audioExamples, ...levelExamples, ...planningExamples, ...writingExamples, ...boardExamples, ...modelExamples];

export const exampleId = (projectId: string, slug: string) => `${projectId}--ex--${slug}`;

/** Links between the example assets, so the sample game shows how everything connects. */
const GAME_LINKS: [AssetRef["type"], string, AssetRef["type"], string][] = [
  ["story", "hero", "sprite", "hero"],
  ["story", "hero", "sound", "jump"],
  ["story", "sword", "sprite", "sword"],
  ["story", "village", "tilemap", "meadow"],
  ["story", "elder", "dialogue", "elder-quest"],
  ["story", "quest-sword", "dialogue", "elder-quest"],
  ["story", "forest", "sprite", "slime"],
  ["model", "hero-3d", "sprite", "hero"],
  ["model", "coin-3d", "sprite", "coin"],
  ["model", "chest-3d", "sprite", "chest"],
  ["model", "slime-3d", "sprite", "slime"],
  ["model", "tree-3d", "tilemap", "meadow"],
  ["diagram", "player-states", "sprite", "hero"],
  ["diagram", "enemy-ai", "sprite", "slime"],
  ["dialogue", "merchant", "sound", "coin"],
  ["note", "design-doc", "music", "title-theme"],
  ["note", "design-doc", "diagram", "screen-flow"],
  ["tilemap", "meadow", "palette", "meadow-palette"],
  ["spritesheet", "characters", "sprite", "hero"],
  ["issue", "i-slime-ai", "diagram", "enemy-ai"],
  ["issue", "i-meadow-level", "tilemap", "meadow"],
  ["issue", "i-title-music", "music", "title-theme"],
  ["issue", "i-coin-sfx", "sound", "coin"],
  ["issue", "i-jump-bug", "note", "bugs"],
  ["issue", "i-dialogue-ui", "dialogue", "elder-quest"],
  ["issue", "i-sword-sprite", "sprite", "sword"],
  ["issue", "i-jump-feel", "diagram", "player-states"],
];

const MODULES = isDevStudio ? devStudioExamples : GAME_MODULES;
const EXAMPLE_LINKS = isDevStudio ? DEV_STUDIO_LINKS : GAME_LINKS;

type Item = { id: string; name?: string; title?: string; example?: boolean };

const nameOf = (i: Item) => (i.name ?? i.title ?? "").trim().toLowerCase();

function modulesFor(collections?: ProjectCollection[]) {
  return MODULES.filter((m) => !collections || collections.includes(m.collection));
}

export function isExample(item: unknown, collection?: ProjectCollection): boolean {
  const i = item as Item;
  if (i?.example) return true;
  if (!collection) return false;
  const legacy = MODULES.filter((m) => m.collection === collection).flatMap((m) => m.legacyNames ?? []);
  return legacy.some((n) => n.toLowerCase() === nameOf(i));
}

export function countExamples(projectId: string, collections: ProjectCollection[] = PROJECT_COLLECTIONS): number {
  return collections
    .filter((c) => c !== "links")
    .reduce((n, c) => n + storage.getAll(c, projectId).filter((i) => isExample(i, c)).length, 0);
}

/** Adds the example assets that aren't in the project yet. Returns how many were added. */
export async function addExamples(projectId: string, collections?: ProjectCollection[]): Promise<number> {
  const ctx: ExampleContext = { projectId, id: (slug) => exampleId(projectId, slug) };
  const now = new Date().toISOString();
  let added = 0;
  // build everything first so a failure in one tool doesn't leave a half-written set
  const built = await Promise.all(modulesFor(collections).map(async (m) => ({ m, items: (await m.build(ctx)) as Item[] })));
  for (const { m, items } of built) {
    const existing = storage.getAll(m.collection, projectId) as unknown as Item[];
    const ids = new Set(existing.map((i) => i.id));
    const names = new Set(existing.map(nameOf));
    for (const item of items) {
      if (ids.has(item.id) || (nameOf(item) && names.has(nameOf(item)))) continue;
      storage.save(
        m.collection,
        { tags: [], createdAt: now, updatedAt: now, ...item, projectId, example: true } as never,
        projectId
      );
      added++;
    }
  }
  for (const [ft, fs, tt, ts] of EXAMPLE_LINKS) {
    const from = { type: ft, id: exampleId(projectId, fs) };
    const to = { type: tt, id: exampleId(projectId, ts) };
    if (assetExists(projectId, from) && assetExists(projectId, to)) addLink(projectId, from, to);
  }
  return added;
}

/** Deletes example assets (and their links). Your own work is never touched. */
export function removeExamples(projectId: string, collections: ProjectCollection[] = PROJECT_COLLECTIONS): number {
  let removed = 0;
  for (const c of collections) {
    if (c === "links") continue;
    for (const item of storage.getAll(c, projectId)) {
      if (!isExample(item, c)) continue;
      storage.delete(c, (item as Item).id, projectId);
      removed++;
    }
  }
  if (collections.includes("issues")) removeExampleSprints(projectId);
  return removed;
}

const COLLECTION_OF: Record<AssetRef["type"], ProjectCollection> = {
  sprite: "sprites",
  sound: "sounds",
  music: "music",
  diagram: "diagrams",
  story: "stories",
  tilemap: "tilemaps",
  dialogue: "dialogues",
  palette: "palettes",
  spritesheet: "spritesheets",
  note: "notes",
  issue: "issues",
  model: "models",
};

function assetExists(projectId: string, ref: AssetRef) {
  return !!storage.getById(COLLECTION_OF[ref.type], ref.id, projectId);
}
