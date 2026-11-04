import * as z from "zod";
import type { AssetRef } from "@/types";
import { addLink, removeLink, refKey } from "@/lib/links";
import { storage } from "@/lib/storage";
import { assetRefSchema, projectIdSchema, requireRef } from "../refs";
import { relatedOf } from "./assets";
import { guarded, READ_ONLY, result, WRITES, type ToolContext } from "./context";

/** Everything a link needs to check both ends and describe them: all kinds, art and audio by name only. */
const LINK_SCOPE = "all" as const;

function sameEnds(a: AssetRef, b: AssetRef) {
  return refKey(a) === refKey(b);
}

function linkExists(projectId: string, from: AssetRef, to: AssetRef): boolean {
  return storage
    .getAll("links", projectId)
    .some((l) => (sameEnds(l.from, from) && sameEnds(l.to, to)) || (sameEnds(l.from, to) && sameEnds(l.to, from)));
}

function storyLinks(projectId: string, a: AssetRef, b: AssetRef): boolean {
  return [[a, b], [b, a]].some(
    ([story, other]) => story.type === "story" && !other.elementId && !!storage.getById("stories", story.id, projectId)?.links?.some((l) => l.targetId === other.id)
  );
}

export function registerLinkTools(ctx: ToolContext): void {
  const { server, studio } = ctx;
  const pair = z.object({ projectId: projectIdSchema, from: assetRefSchema, to: assetRefSchema });

  server.registerTool(
    "get_related",
    {
      title: "Get related",
      description: "Everything linked to an asset or one canvas element: explicit links, wiki/story links and [[wiki links]].",
      inputSchema: z.object({ projectId: projectIdSchema, ref: assetRefSchema }),
      annotations: READ_ONLY,
    },
    ({ projectId, ref }) =>
      guarded(async () => {
        const related = await studio.read({ projectId, collections: LINK_SCOPE }, () => {
          requireRef(projectId, ref);
          return relatedOf(projectId, ref);
        });
        const text = related.length ? related.map((r) => `- ${r.title} (${r.ref.type} ${r.ref.id}, ${r.source})`).join("\n") : "Nothing linked yet.";
        return result(text, { related });
      })
  );

  server.registerTool(
    "link",
    {
      title: "Link",
      description: "Links two assets (either end may be one canvas element). Does nothing if they are already linked.",
      inputSchema: pair,
      annotations: { ...WRITES, idempotentHint: true },
    },
    ({ projectId, from, to }) =>
      guarded(async () => {
        const isNew = await studio.write({ projectId, collections: LINK_SCOPE }, () => {
          requireRef(projectId, from);
          requireRef(projectId, to);
          if (sameEnds(from, to)) throw new Error("Can't link an asset to itself.");
          const existed = linkExists(projectId, from, to);
          addLink(projectId, from, to);
          return !existed;
        });
        return result(isNew ? "Linked." : "They were already linked.", { linked: true, created: isNew });
      })
  );

  server.registerTool(
    "unlink",
    {
      title: "Unlink",
      description: "Removes the link between two assets, including a wiki/story page's link to an asset.",
      inputSchema: pair,
      annotations: { ...WRITES, idempotentHint: true },
    },
    ({ projectId, from, to }) =>
      guarded(async () => {
        const removed = await studio.write({ projectId, collections: LINK_SCOPE }, () => {
          const found = linkExists(projectId, from, to) || storyLinks(projectId, from, to);
          removeLink(projectId, from, to);
          return found;
        });
        return result(removed ? "Unlinked." : "They weren't linked.", { removed });
      })
  );
}
