import { describe, expect, it } from "vitest";
import type { Decision } from "@/types";
import { decisionExamples } from "./decisions";
import { devStudioExamples } from "./dev-studio";
import { EXAMPLE_SLUGS } from "./types";

const ctx = { projectId: "p", id: (slug: string) => `p--ex--${slug}` };

function built(modules: typeof decisionExamples): Decision[] {
  return modules.filter((m) => m.collection === "decisions").flatMap((m) => m.build(ctx) as unknown as Decision[]);
}

describe.each([
  ["GameDev Studio", built(decisionExamples)],
  ["Dev Studio", built(devStudioExamples)],
])("%s example decisions", (_, decisions) => {
  it("should number the records 1, 2, 3… in order", () => {
    expect(decisions.map((d) => d.number)).toEqual(decisions.map((_, i) => i + 1));
  });

  it("should only point superseded decisions at a decision that exists", () => {
    const ids = new Set(decisions.map((d) => d.id));
    for (const d of decisions.filter((x) => x.status === "superseded")) expect(ids).toContain(d.supersededBy);
  });

  it("should show at least one supersede, so the flow is visible", () => {
    expect(decisions.some((d) => d.supersededBy)).toBe(true);
  });

  it("should give every record a date and all four sections", () => {
    for (const d of decisions) {
      expect(d.date, d.title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const field of [d.context, d.options, d.decision, d.consequences]) expect(field.trim(), d.title).not.toBe("");
    }
  });
});

describe("GameDev Studio decision slugs", () => {
  it("should build exactly the listed slugs", () => {
    expect(built(decisionExamples).map((d) => d.id)).toEqual(EXAMPLE_SLUGS.decisions.map(ctx.id));
  });
});
