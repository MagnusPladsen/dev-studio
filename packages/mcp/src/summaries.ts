import type { AssetType, Project } from "@/types";
import { assetKindLabel, assetTypesFor, summarize } from "@/lib/assets";
import { storage } from "@/lib/storage";
import { assetUrl, collectionOf, projectApp } from "./refs";

export interface AssetListItem {
  ref: { type: AssetType; id: string };
  kind: string;
  title: string;
  tags: string[];
  folder?: string;
  updatedAt?: string;
  url: string;
}

/** Every loaded asset of the project's app (or of `types`), newest first. */
export function assetList(project: Project, types?: AssetType[]): AssetListItem[] {
  const app = projectApp(project);
  const offered = assetTypesFor(app).filter((t) => !types || types.includes(t));
  const items = offered.flatMap((type) =>
    storage.getAll(collectionOf(type), project.id).map((raw) => {
      const item = raw as { tags?: string[]; folder?: string; archived?: boolean };
      const summary = summarize(type, raw);
      return {
        ref: { type, id: summary.id },
        kind: assetKindLabel(type, app),
        title: summary.name,
        tags: item.tags ?? [],
        folder: item.folder,
        updatedAt: summary.updatedAt,
        url: assetUrl(project, { type, id: summary.id }),
      };
    })
  );
  return items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export function listLine(item: AssetListItem): string {
  const tags = item.tags.length ? ` #${item.tags.join(" #")}` : "";
  const folder = item.folder ? ` in ${item.folder}` : "";
  return `- ${item.kind}: ${item.title}${folder}${tags} (${item.ref.type} ${item.ref.id}, updated ${item.updatedAt?.slice(0, 10) ?? "?"})`;
}
