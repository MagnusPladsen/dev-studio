import * as z from "zod";
import type { AssetRef, AssetType } from "@/types";
import { getRelated } from "@/lib/links";
import { storage } from "@/lib/storage";
import { LIGHT_COLLECTIONS, selectAssetById } from "../store/loader";
import { assetJson, assetMarkdown } from "../format";
import { assetRefSchema, assetTypeSchema, assetUrl, collectionOf, projectIdSchema, requireProject, requireRef, resolveName, typeOfCollection } from "../refs";
import { assetList, listLine } from "../summaries";
import { guarded, READ_ONLY, result, type ToolContext } from "./context";

const PAGE_SIZE = 50;

export function relatedOf(projectId: string, ref: AssetRef) {
  const project = requireProject(projectId);
  return getRelated(projectId, ref.type, ref.id, ref.elementId).map((r) => {
    const target = { type: r.type, id: r.id, ...(r.elementId ? { elementId: r.elementId } : {}) };
    return {
      ref: target,
      title: r.elementName ? `${r.name} › ${r.elementName}` : r.name,
      source: r.source,
      ...(r.viaElementName ? { viaElement: r.viaElementName } : {}),
      url: assetUrl(project, target),
    };
  });
}

/** The project an asset id lives in, for calls that pass a ref without a projectId. */
async function locate(ctx: ToolContext, ref: AssetRef): Promise<string> {
  const row = await selectAssetById(ctx.studio.client, ref.id);
  if (!row?.project_id || typeOfCollection(row.collection ?? "") !== ref.type) throw new Error(`No ${ref.type} with id ${ref.id} in this account.`);
  return row.project_id;
}

export async function readAsset(ctx: ToolContext, projectId: string, input: { ref?: AssetRef; name?: string }) {
  return ctx.studio.read({ projectId, collections: "all", fullBodies: input.ref ? [collectionOf(input.ref.type)] : [] }, () => {
    const ref = input.ref ?? resolveName(projectId, input.name ?? "");
    requireRef(projectId, ref);
    const project = requireProject(projectId);
    const item = storage.getById(collectionOf(ref.type), ref.id, projectId)!;
    const isNameOnly = LIGHT_COLLECTIONS.includes(collectionOf(ref.type)) && !input.ref;
    const board = storage.getAll("boards", projectId)[0];
    return {
      ref,
      url: assetUrl(project, ref),
      markdown: isNameOnly ? `# ${(item as { name?: string }).name}\n(${ref.type}: art and audio are edited in the app only.)` : assetMarkdown(ref.type, item, board),
      json: assetJson(ref.type, item),
      related: relatedOf(projectId, { type: ref.type, id: ref.id }),
    };
  });
}

export function registerAssetTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "list_assets",
    {
      title: "List assets",
      description: "Lists a project's assets (issues, notes, wiki/story pages, decisions, canvases, …), newest first, 50 per page.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        type: assetTypeSchema.optional(),
        folder: z.string().max(200).optional().describe("Notes in this folder."),
        tag: z.string().max(100).optional(),
        updatedSince: z.string().max(40).optional().describe("ISO date or time."),
        cursor: z.string().max(20).optional().describe("nextCursor from the previous page."),
      }),
      annotations: READ_ONLY,
    },
    ({ projectId, type, folder, tag, updatedSince, cursor }) =>
      guarded(async () => {
        const types: AssetType[] | undefined = type ? [type] : undefined;
        const items = await ctx.studio.read({ projectId, collections: types ? types.map(collectionOf) : "all" }, () =>
          assetList(requireProject(projectId), types)
        );
        const wantedTag = tag?.replace(/^#/, "").toLowerCase();
        const filtered = items.filter(
          (i) =>
            (!folder || i.folder === folder) &&
            (!wantedTag || i.tags.some((t) => t.toLowerCase() === wantedTag)) &&
            (!updatedSince || (i.updatedAt ?? "") >= updatedSince)
        );
        const start = Number(cursor ?? 0) || 0;
        const page = filtered.slice(start, start + PAGE_SIZE);
        const nextCursor = start + PAGE_SIZE < filtered.length ? String(start + PAGE_SIZE) : undefined;
        const text = page.length ? page.map(listLine).join("\n") + (nextCursor ? `\n… more: cursor ${nextCursor}` : "") : "Nothing matches.";
        return result(text, { total: filtered.length, items: page, ...(nextCursor ? { nextCursor } : {}) });
      })
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get asset",
      description:
        "Reads one asset as Markdown: issue, note, wiki/story page, decision, or a canvas outline. Art and audio show metadata only. Pass ref, or projectId plus name (issue key like TIDE-12, ADR-003, or an exact title).",
      inputSchema: z.object({
        ref: assetRefSchema.optional(),
        projectId: projectIdSchema.optional(),
        name: z.string().max(200).optional(),
        format: z.enum(["markdown", "json"]).optional(),
      }),
      annotations: READ_ONLY,
    },
    ({ ref, projectId, name, format }) =>
      guarded(async () => {
        if (!ref && !(projectId && name)) throw new Error("Pass ref, or projectId and name.");
        const where = projectId ?? (await locate(ctx, ref!));
        const asset = await readAsset(ctx, where, { ref, name });
        const related = asset.related.map((r) => `- ${r.title} (${r.ref.type} ${r.ref.id})`).join("\n");
        const body = format === "json" ? JSON.stringify(asset.json, null, 2) : asset.markdown;
        const text = `${body}\n\nOpen: ${asset.url}${related ? `\n\nRelated:\n${related}` : ""}`;
        return result(text, { ref: asset.ref, projectId: where, url: asset.url, related: asset.related, ...(format === "json" ? { asset: asset.json } : {}) });
      })
  );
}
