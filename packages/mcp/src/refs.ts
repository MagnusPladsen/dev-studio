import * as z from "zod";
import type { AssetRef, AssetType, Project } from "@/types";
import { ASSET_KINDS, assetHref, assetTypesFor, getAsset } from "@/lib/assets";
import { appConfigFor, type AppId } from "@/lib/app-config";
import { findElement } from "@/lib/diagrams/elements";
import { storage, type ProjectCollection } from "@/lib/storage";

export const ASSET_TYPE_NAMES = Object.keys(ASSET_KINDS) as [AssetType, ...AssetType[]];

export const assetTypeSchema = z.enum(ASSET_TYPE_NAMES);

export const assetRefSchema = z.object({
  type: assetTypeSchema.describe("Kind of asset: issue, note, story (Wiki page in Dev Studio), decision, diagram (Canvas), …"),
  id: z.string().min(1).max(100),
  elementId: z.string().min(1).max(100).optional().describe("One element on a canvas (only with type diagram)."),
});

export const projectIdSchema = z.string().min(1).max(100).describe("Project id from list_projects.");

export function projectApp(project: Pick<Project, "app"> | undefined): AppId {
  return project?.app ?? "gamedev-studio";
}

export function collectionOf(type: AssetType): ProjectCollection {
  return ASSET_KINDS[type].collection;
}

export function typeOfCollection(collection: string): AssetType | undefined {
  return ASSET_TYPE_NAMES.find((type) => ASSET_KINDS[type].collection === collection);
}

/** The project's own app link to an asset (`?open=<id>`, `&element=<id>` for a canvas element). */
export function assetUrl(project: Pick<Project, "id" | "app">, ref: AssetRef): string {
  return appConfigFor(projectApp(project)).url + assetHref(project.id, ref.type, ref.id, ref.elementId);
}

export function projectUrl(project: Pick<Project, "id" | "app">): string {
  return `${appConfigFor(projectApp(project)).url}/project/${project.id}/assets`;
}

export function requireProject(projectId: string): Project {
  const project = storage.getById("projects", projectId);
  if (!project) throw new Error(`No project with id ${projectId}.`);
  return project;
}

/** Throws a clear error when a ref doesn't exist in the loaded project (or its element is gone). */
export function requireRef(projectId: string, ref: AssetRef): void {
  const project = requireProject(projectId);
  if (!assetTypesFor(projectApp(project)).includes(ref.type)) {
    throw new Error(`${appConfigFor(projectApp(project)).name} projects have no ${ASSET_KINDS[ref.type].label.toLowerCase()} assets.`);
  }
  if (!getAsset(projectId, ref.type, ref.id)) throw new Error(`No ${ref.type} with id ${ref.id} in this project.`);
  if (ref.elementId && ref.type !== "diagram") throw new Error("elementId only works with type diagram.");
  if (ref.elementId && !findElement(projectId, ref.id, ref.elementId)) throw new Error(`Canvas ${ref.id} has no element ${ref.elementId}.`);
}

const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const ADR = /^ADR-?0*(\d+)$/i;

/** An issue key ("TIDE-12"), an ADR ("ADR-003") or an exact, unique title among the loaded assets. */
export function resolveName(projectId: string, name: string): AssetRef {
  const trimmed = name.trim();
  if (ISSUE_KEY.test(trimmed) && !ADR.test(trimmed)) {
    const issue = storage.getAll("issues", projectId).find((i) => i.key.toLowerCase() === trimmed.toLowerCase());
    if (issue) return { type: "issue", id: issue.id };
  }
  const adr = ADR.exec(trimmed);
  if (adr) {
    const decision = storage.getAll("decisions", projectId).find((d) => d.number === Number(adr[1]));
    if (decision) return { type: "decision", id: decision.id };
  }
  const lower = trimmed.toLowerCase();
  const hits = ASSET_TYPE_NAMES.flatMap((type) =>
    storage
      .getAll(collectionOf(type), projectId)
      .filter((item) => {
        const named = item as { name?: string; title?: string };
        return (named.title ?? named.name ?? "").trim().toLowerCase() === lower;
      })
      .map((item) => ({ type, id: item.id }))
  );
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error(`"${name}" matches ${hits.length} assets. Pass a ref with type and id instead.`);
  throw new Error(`Nothing called "${name}" in this project. Try search.`);
}
