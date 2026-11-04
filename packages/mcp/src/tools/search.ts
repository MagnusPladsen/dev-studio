import * as z from "zod";
import type { AssetType } from "@/types";
import { storage } from "@/lib/storage";
import { assetTypeSchema, assetUrl, collectionOf, projectIdSchema, typeOfCollection } from "../refs";
import { guarded, READ_ONLY, result, type ToolContext } from "./context";

type SearchRow = { id: string; project_id: string; collection: string; title: string; snippet: string; rank: number };

export async function searchAssets(ctx: ToolContext, query: string, projectId?: string, types?: AssetType[], limit = 20) {
  const projects = await ctx.studio.read({}, () => new Map(storage.getAll("projects").map((p) => [p.id, p])));
  const { data, error } = await ctx.studio.client.rpc("search_assets", {
    p_project_id: projectId ?? null,
    p_query: query,
    p_collections: types?.length ? types.map(collectionOf) : null,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as SearchRow[]).flatMap((row) => {
    const type = typeOfCollection(row.collection);
    const project = projects.get(row.project_id);
    if (!type || !project) return [];
    const ref = { type, id: row.id };
    return [{ ref, projectId: row.project_id, projectName: project.name, title: row.title, snippet: row.snippet, url: assetUrl(project, ref) }];
  });
}

export function registerSearchTool(ctx: ToolContext): void {
  ctx.server.registerTool(
    "search",
    {
      title: "Search",
      description: "Full-text search over issues, notes, wiki/story pages, decisions and canvases (titles, text, canvas labels). Supports \"quoted phrases\", OR and -exclude.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(500),
        projectId: projectIdSchema.optional().describe("Leave out to search every project."),
        types: z.array(assetTypeSchema).max(13).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: READ_ONLY,
    },
    ({ query, projectId, types, limit }) =>
      guarded(async () => {
        const hits = await searchAssets(ctx, query, projectId, types, limit);
        const text = hits.length
          ? hits.map((h) => `- ${h.title} (${h.ref.type} ${h.ref.id}, ${h.projectName}): ${h.snippet}`).join("\n")
          : `No matches for "${query}".`;
        return result(text, { hits });
      })
  );
}
