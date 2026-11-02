import { describe, expect, it } from "vitest";
import type { AssetRef } from "@/types";
import { ASSET_KINDS } from "@/lib/assets";
import { embedFor, linkKind } from "@/lib/diagrams/embeds";
import { diagramBoardExamples } from "./diagram-boards";
import { EXAMPLE_SLUGS } from "./types";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };

describe("diagram board examples", () => {
  const boards = diagramBoardExamples(ctx);

  it("links only to example assets that exist", () => {
    for (const board of boards) {
      for (const node of board.nodes) {
        const asset = node.data?.asset as AssetRef | undefined;
        if (!asset) continue;
        const slugs: readonly string[] = EXAMPLE_SLUGS[ASSET_KINDS[asset.type].collection as keyof typeof EXAMPLE_SLUGS];
        expect(slugs.map(ctx.id), `${board.name}: ${node.label}`).toContain(asset.id);
      }
    }
  });

  it("connects only cards on the same board", () => {
    for (const board of boards) {
      const ids = new Set(board.nodes.map((n) => n.id));
      for (const edge of board.edges) expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
    }
  });

  it("shows off playable links and images", () => {
    const nodes = boards.flatMap((b) => b.nodes);
    expect(nodes.some((n) => n.type === "link" && embedFor(n.data?.url as string)?.provider === "youtube")).toBe(true);
    expect(nodes.some((n) => n.type === "link" && embedFor(n.data?.url as string)?.provider === "spotify")).toBe(true);
    expect(nodes.filter((n) => n.type === "image").every((n) => String(n.data?.src).startsWith("data:image/svg+xml"))).toBe(true);
  });

  it("should give every board sections, a to-do list, studio assets and a freehand sketch", () => {
    for (const board of boards) {
      const types = new Set(board.nodes.map((n) => n.type));
      for (const type of ["group", "checklist", "asset", "drawing"] as const) expect(types.has(type), `${board.name}: ${type}`).toBe(true);
    }
  });

  it("should use unique card ids on each board", () => {
    for (const board of boards) expect(new Set(board.nodes.map((n) => n.id)).size).toBe(board.nodes.length);
  });

  it("should draw the core loop with flow-chart and basic shapes", () => {
    const loop = boards.find((b) => b.name === "Pip's Core Loop");
    const types = new Set(loop?.nodes.map((n) => n.type));
    for (const type of ["state", "action", "condition", "event", "rectangle", "ellipse", "diamond"] as const) expect(types.has(type), type).toBe(true);
  });

  it("should show the Spotify album as a song when the saved card only holds its URL", () => {
    const album = boards.flatMap((b) => b.nodes).find((n) => n.data?.url === "https://open.spotify.com/album/1ZfETfec0U02KrKNI8w3Gf");
    expect(linkKind(album?.data?.url as string)).toBe("audio");
  });
});
