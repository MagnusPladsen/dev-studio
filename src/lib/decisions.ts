import { v4 as uuid } from "uuid";
import type { Decision, DecisionStatus } from "@/types";

export const DECISION_STATUSES: { value: DecisionStatus; label: string; color: string; hint: string }[] = [
  { value: "proposed", label: "Proposed", color: "var(--blue)", hint: "Up for discussion" },
  { value: "accepted", label: "Accepted", color: "var(--green)", hint: "In effect" },
  { value: "superseded", label: "Superseded", color: "var(--text-secondary)", hint: "Replaced by a newer decision" },
  { value: "deprecated", label: "Deprecated", color: "var(--orange)", hint: "No longer applies" },
  { value: "rejected", label: "Rejected", color: "var(--red)", hint: "Considered and turned down" },
];

export function statusMeta(status: DecisionStatus): (typeof DECISION_STATUSES)[number] {
  return DECISION_STATUSES.find((s) => s.value === status) ?? DECISION_STATUSES[0];
}

/** "ADR-007" for decision number 7. */
export function decisionCode(number: number): string {
  return `ADR-${String(number).padStart(3, "0")}`;
}

export function nextDecisionNumber(decisions: Pick<Decision, "number">[]): number {
  return decisions.reduce((max, d) => Math.max(max, d.number || 0), 0) + 1;
}

export function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export const DECISION_FIELDS = [
  { key: "context", label: "Context", placeholder: "What is the situation, and what forces us to decide?" },
  { key: "options", label: "Options considered", placeholder: "- **Option A**: pros and cons\n- **Option B**: pros and cons" },
  { key: "decision", label: "Decision", placeholder: "What we will do, stated plainly." },
  { key: "consequences", label: "Consequences", placeholder: "What gets easier, what gets harder, what we must now do." },
] as const;

export type DecisionField = (typeof DECISION_FIELDS)[number]["key"];

export function createDecision(projectId: string, existing: Decision[], patch: Partial<Decision> = {}): Decision {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    projectId,
    number: nextDecisionNumber(existing),
    title: "Untitled decision",
    status: "proposed",
    date: today(),
    context: "",
    options: "",
    decision: "",
    consequences: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/**
 * Replaces `old` with a new proposed decision: the old one becomes superseded and points at the new one.
 * Returns both records; the caller saves them.
 */
export function supersedeDecision(old: Decision, existing: Decision[]): { replaced: Decision; replacement: Decision } {
  const replacement = createDecision(old.projectId, existing, {
    title: old.title,
    context: `Replaces ${decisionCode(old.number)} (${old.title}).\n\n${old.context}`.trim(),
    options: old.options,
    tags: [...old.tags],
  });
  const replaced: Decision = { ...old, status: "superseded", supersededBy: replacement.id, updatedAt: replacement.createdAt };
  return { replaced, replacement };
}

/** The decisions `decision` replaced (those whose "superseded by" points at it). */
export function supersededDecisions(decision: Decision, all: Decision[]): Decision[] {
  return all.filter((d) => d.supersededBy === decision.id).sort((a, b) => a.number - b.number);
}

export function sortDecisions(decisions: Decision[]): Decision[] {
  return [...decisions].sort((a, b) => a.number - b.number);
}

export function matchesDecisionQuery(decision: Decision, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    decisionCode(decision.number),
    decision.title,
    decision.context,
    decision.options,
    decision.decision,
    decision.consequences,
    ...decision.tags,
  ];
  return haystack.some((text) => text.toLowerCase().includes(q));
}

/** Pushes a field's own headings below `minLevel`, so they nest under the section heading. */
function nestHeadings(markdown: string, minLevel: number): string {
  const levels = [...markdown.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  const shift = levels.length ? minLevel - Math.min(...levels) : 0;
  if (shift <= 0) return markdown;
  return markdown.replace(/^(#{1,6})(\s)/gm, (_, hashes: string, space: string) => `${"#".repeat(Math.min(6, hashes.length + shift))}${space}`);
}

/** One decision as a Markdown ADR. `level` is the heading level of its title. */
export function decisionToMarkdown(decision: Decision, all: Decision[], level = 1): string {
  const h = "#".repeat(level);
  const sub = "#".repeat(level + 1);
  const replacement = decision.supersededBy ? all.find((d) => d.id === decision.supersededBy) : undefined;
  const replaces = supersededDecisions(decision, all);
  const meta = [
    `**Status:** ${statusMeta(decision.status).label}`,
    `**Date:** ${decision.date || "–"}`,
    replacement && `**Superseded by:** ${decisionCode(replacement.number)} ${replacement.title}`,
    replaces.length > 0 && `**Supersedes:** ${replaces.map((d) => `${decisionCode(d.number)} ${d.title}`).join(", ")}`,
    decision.tags.length > 0 && `**Tags:** ${decision.tags.join(", ")}`,
  ].filter(Boolean);
  const sections = DECISION_FIELDS.filter((f) => decision[f.key].trim()).map(
    (f) => `${sub} ${f.label}\n\n${nestHeadings(decision[f.key].trim(), level + 2)}`
  );
  return [`${h} ${decisionCode(decision.number)}: ${decision.title || "Untitled decision"}`, meta.join("  \n"), ...sections].join("\n\n") + "\n";
}

/** Every decision in one Markdown file, with an index table first. */
export function decisionLogMarkdown(projectName: string, decisions: Decision[]): string {
  const sorted = sortDecisions(decisions);
  const escape = (text: string) => text.replace(/\|/g, "\\|");
  const index = [
    "| ADR | Title | Status | Date |",
    "| --- | --- | --- | --- |",
    ...sorted.map((d) => `| ${decisionCode(d.number)} | ${escape(d.title)} | ${statusMeta(d.status).label} | ${d.date} |`),
  ].join("\n");
  const records = sorted.map((d) => decisionToMarkdown(d, decisions, 2).trimEnd());
  return [`# ${projectName}: decision log`, index, ...records].join("\n\n") + "\n";
}

export function decisionFileName(decision: Decision): string {
  const slug = decision.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "decision";
  return `${decisionCode(decision.number).toLowerCase()}-${slug}.md`;
}
