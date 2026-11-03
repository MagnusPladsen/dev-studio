import { describe, expect, it } from "vitest";
import { ASSET_KINDS } from "@/lib/assets";
import { appConfigFor } from "@/lib/app-config";
import { DEV_STUDIO_LINKS, DEV_STUDIO_SLUGS, devStudioExamples } from "./dev-studio";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
type ExampleItem = { id: string; title?: string; content?: string; context?: string; options?: string; decision?: string; consequences?: string };
const textOf = (i: ExampleItem) => [i.content, i.context, i.options, i.decision, i.consequences].filter(Boolean).join("\n");
const slugsOf = (collection: string): readonly string[] => DEV_STUDIO_SLUGS[collection as keyof typeof DEV_STUDIO_SLUGS] ?? [];

describe("Dev Studio examples", () => {
  const built = devStudioExamples
    .filter((m) => m.collection !== "issues")
    .map((m) => ({ collection: m.collection, items: m.build(ctx) as ExampleItem[] }));

  it("only use Dev Studio's tools", () => {
    const collections = appConfigFor("dev-studio").assetTypes.map((type) => ASSET_KINDS[type].collection);
    for (const m of devStudioExamples) expect(collections).toContain(m.collection);
  });

  it("build exactly the listed slugs", () => {
    for (const { collection, items } of built) {
      expect(items.map((i) => i.id).sort()).toEqual(slugsOf(collection).map(ctx.id).sort());
    }
  });

  it("link only to examples that exist", () => {
    for (const [fromType, fromSlug, toType, toSlug] of DEV_STUDIO_LINKS) {
      expect(slugsOf(ASSET_KINDS[fromType].collection)).toContain(fromSlug);
      expect(slugsOf(ASSET_KINDS[toType].collection)).toContain(toSlug);
    }
  });

  it("wiki links point at existing wiki pages or notes", () => {
    const titles = new Set(built.filter((b) => b.collection === "stories" || b.collection === "notes").flatMap(({ items }) => items.map((i) => i.title)));
    for (const { items } of built) {
      for (const item of items) {
        for (const [, target] of textOf(item).matchAll(/\[\[([^\]|`]+)(?:\|[^\]]*)?\]\]/g)) expect(titles, item.title).toContain(target);
      }
    }
  });
});
