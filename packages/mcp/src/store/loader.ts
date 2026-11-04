import type { SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_COLLECTIONS, type ProjectCollection } from "@/lib/storage";
import type { CloudRow } from "@/lib/sync/cloud";

/**
 * Art and audio bodies can be megabytes of pixels or notes. Link lookups only need their names, so
 * these load as `{ id, name, updatedAt }` unless a tool asks for the full row.
 */
export const LIGHT_COLLECTIONS: ProjectCollection[] = ["sprites", "sounds", "music", "tilemaps", "palettes", "spritesheets", "models"];

const PAGE = 500;
const FULL = "id, project_id, collection, data, updated_at, rev";
const LIGHT = "id, project_id, collection, updated_at, rev, name:data->>name, updatedAt:data->>updatedAt";

type LightRow = Omit<CloudRow, "data"> & { name?: string | null; updatedAt?: string | null };

async function paged<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const list = (data ?? []) as T[];
    rows.push(...list);
    if (list.length < PAGE) return rows;
  }
}

export function selectProjects(client: SupabaseClient): Promise<CloudRow[]> {
  return paged((from, to) => client.from("projects").select("id, data, updated_at, rev").order("id").range(from, to));
}

export async function selectProject(client: SupabaseClient, projectId: string): Promise<CloudRow | null> {
  const { data, error } = await client.from("projects").select("id, data, updated_at, rev").eq("id", projectId).maybeSingle();
  if (error) throw error;
  return (data as CloudRow | null) ?? null;
}

function selectFull(client: SupabaseClient, projectId: string, collections: ProjectCollection[]): Promise<CloudRow[]> {
  if (!collections.length) return Promise.resolve([]);
  return paged((from, to) =>
    client.from("assets").select(FULL).eq("project_id", projectId).in("collection", collections).order("id").range(from, to)
  );
}

async function selectLight(client: SupabaseClient, projectId: string, collections: ProjectCollection[]): Promise<CloudRow[]> {
  if (!collections.length) return [];
  const rows = await paged<LightRow>((from, to) =>
    client.from("assets").select(LIGHT).eq("project_id", projectId).in("collection", collections).order("id").range(from, to)
  );
  return rows.map(({ name, updatedAt, ...row }) => ({ ...row, data: { id: row.id, name: name ?? "Untitled", updatedAt: updatedAt ?? row.updated_at } }));
}

export interface ProjectRows {
  full: CloudRow[];
  /** Name-only stand-ins, never written back. */
  light: CloudRow[];
}

/** One project's rows of `collections`; art and audio come name-only unless listed in `fullBodies`. */
export async function selectAssets(
  client: SupabaseClient,
  projectId: string,
  collections: ProjectCollection[] | "all",
  fullBodies: ProjectCollection[] = []
): Promise<ProjectRows> {
  const wanted = collections === "all" ? PROJECT_COLLECTIONS : collections;
  const isLight = (c: ProjectCollection) => LIGHT_COLLECTIONS.includes(c) && !fullBodies.includes(c);
  const [full, light] = await Promise.all([
    selectFull(client, projectId, wanted.filter((c) => !isLight(c))),
    selectLight(client, projectId, wanted.filter(isLight)),
  ]);
  return { full, light };
}

/** One asset by id, wherever it lives (any project, any collection). */
export async function selectAssetById(client: SupabaseClient, id: string): Promise<CloudRow | null> {
  const { data, error } = await client.from("assets").select(FULL).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as CloudRow | null) ?? null;
}

/** How many assets of each collection every project has, without reading any bodies. */
export async function selectAssetCounts(client: SupabaseClient): Promise<Map<string, Record<string, number>>> {
  const rows = await paged<{ project_id: string; collection: string }>((from, to) =>
    client.from("assets").select("id, project_id, collection").order("id").range(from, to)
  );
  const counts = new Map<string, Record<string, number>>();
  for (const { project_id, collection } of rows) {
    const perProject = counts.get(project_id) ?? {};
    perProject[collection] = (perProject[collection] ?? 0) + 1;
    counts.set(project_id, perProject);
  }
  return counts;
}
