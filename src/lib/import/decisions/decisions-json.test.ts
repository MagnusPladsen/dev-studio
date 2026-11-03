import { describe, expect, it } from "vitest";
import type { Decision } from "@/types";
import { decisionExamples } from "@/lib/examples/decisions";
import { runImporter } from "@/lib/import";
import { differenceIgnoringIds, textFile } from "@/lib/import/test-helpers";
import { decisionsJsonImporter } from "./decisions-json";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };
const log = decisionExamples
  .flatMap((module) => module.build(ctx) as unknown as Decision[])
  .map((decision) => ({ ...decision, projectId: "p", tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }))
  .sort((a, b) => a.number - b.number);

describe("Decision log JSON import", () => {
  it("round-trips the example log with new ids and its supersede links", async () => {
    expect(log.some((decision) => decision.supersededBy)).toBe(true);
    const outcome = await runImporter(decisionsJsonImporter, textFile(JSON.stringify(log, null, 2)));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.warnings).toEqual([]);
    expect(differenceIgnoringIds(log, outcome.result.items, ["supersededBy"])).toBeNull();
  });

  it("drops supersede links to decisions outside the file", async () => {
    const lone = log.find((decision) => decision.supersededBy)!;
    const outcome = await runImporter(decisionsJsonImporter, textFile(JSON.stringify(lone)));
    expect(outcome.ok && outcome.result.items[0].supersededBy).toBeUndefined();
    expect(outcome.ok && outcome.result.warnings).toHaveLength(1);
  });

  it("rejects files that aren't decision logs", async () => {
    expect(await runImporter(decisionsJsonImporter, textFile(JSON.stringify({ nodes: [], edges: [] })))).toEqual({ ok: false, message: expect.stringContaining("isn't a decision log") });
  });
});
