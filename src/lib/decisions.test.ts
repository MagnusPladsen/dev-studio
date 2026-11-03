import { describe, expect, it } from "vitest";
import type { Decision } from "@/types";
import {
  createDecision,
  decisionCode,
  decisionFileName,
  decisionLogMarkdown,
  decisionToMarkdown,
  matchesDecisionQuery,
  nextDecisionNumber,
  supersedeDecision,
  supersededDecisions,
} from "./decisions";

const base = (patch: Partial<Decision>): Decision => ({ ...createDecision("p", []), ...patch });

describe("decision numbers", () => {
  it("pads codes to three digits", () => {
    expect(decisionCode(1)).toBe("ADR-001");
    expect(decisionCode(42)).toBe("ADR-042");
    expect(decisionCode(1234)).toBe("ADR-1234");
  });

  it("numbers after the highest, even with gaps", () => {
    expect(nextDecisionNumber([])).toBe(1);
    expect(nextDecisionNumber([{ number: 1 }, { number: 5 }, { number: 3 }])).toBe(6);
  });

  it("starts new decisions as proposed, dated today", () => {
    const d = createDecision("p", [base({ number: 2 })]);
    expect(d.number).toBe(3);
    expect(d.status).toBe("proposed");
    expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("superseding", () => {
  it("marks the old decision superseded and points it at a new proposed one", () => {
    const old = base({ number: 1, title: "Use REST", status: "accepted", context: "We need an API.", tags: ["api"] });
    const { replaced, replacement } = supersedeDecision(old, [old]);
    expect(replaced.status).toBe("superseded");
    expect(replaced.supersededBy).toBe(replacement.id);
    expect(replacement.number).toBe(2);
    expect(replacement.status).toBe("proposed");
    expect(replacement.context).toContain("Replaces ADR-001");
    expect(replacement.tags).toEqual(["api"]);
    expect(supersededDecisions(replacement, [replaced, replacement])).toEqual([replaced]);
  });
});

describe("search", () => {
  it("matches the code, title, fields and tags", () => {
    const d = base({ number: 4, title: "Offline first", consequences: "Conflicts need rules", tags: ["sync"] });
    expect(matchesDecisionQuery(d, "adr-004")).toBe(true);
    expect(matchesDecisionQuery(d, "OFFLINE")).toBe(true);
    expect(matchesDecisionQuery(d, "conflicts")).toBe(true);
    expect(matchesDecisionQuery(d, "sync")).toBe(true);
    expect(matchesDecisionQuery(d, "graphql")).toBe(false);
  });
});

describe("Markdown export", () => {
  const old = base({ number: 1, title: "Use REST", status: "superseded", date: "2026-01-02" });
  const next = base({ number: 2, title: "Use GraphQL", status: "accepted", decision: "## Why\nOne endpoint.", tags: ["api"] });
  old.supersededBy = next.id;

  it("writes one ADR with status, links and only the filled-in sections", () => {
    const md = decisionToMarkdown(old, [old, next]);
    expect(md).toContain("# ADR-001: Use REST");
    expect(md).toContain("**Status:** Superseded");
    expect(md).toContain("**Superseded by:** ADR-002 Use GraphQL");
    expect(md).not.toContain("## Context");
  });

  it("nests headings written inside a field under the section", () => {
    const md = decisionToMarkdown(next, [old, next]);
    expect(md).toContain("**Supersedes:** ADR-001 Use REST");
    expect(md).toContain("## Decision\n\n### Why\nOne endpoint.");
  });

  it("writes the whole log with an index table in number order", () => {
    const md = decisionLogMarkdown("Tidepool", [next, old]);
    expect(md.startsWith("# Tidepool: decision log")).toBe(true);
    expect(md).toContain("| ADR-001 | Use REST | Superseded | 2026-01-02 |");
    expect(md.indexOf("## ADR-001")).toBeLessThan(md.indexOf("## ADR-002"));
  });

  it("names files after the code and title", () => {
    expect(decisionFileName(next)).toBe("adr-002-use-graphql.md");
  });
});
