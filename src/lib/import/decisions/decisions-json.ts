import type { Decision } from "@/types";
import { ImportError, jsonReimporter, oneOrMany } from "@/lib/import";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const TEXT_FIELDS = ["context", "options", "decision", "consequences"] as const;

function readDecision(value: unknown): Decision {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.status !== "string" || !TEXT_FIELDS.some((field) => typeof value[field] === "string")) {
    throw new ImportError("This isn't a decision log file. Export one with Export → Decision log (JSON).");
  }
  const text = Object.fromEntries(TEXT_FIELDS.map((field) => [field, typeof value[field] === "string" ? value[field] : ""]));
  return {
    ...(value as unknown as Decision),
    ...text,
    id: typeof value.id === "string" ? value.id : `decision-${value.title}`,
    number: typeof value.number === "number" ? value.number : 0,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

/**
 * Re-imports the Decision log's JSON export (all decisions, or one) as new decisions. They keep their order and
 * "superseded by" links among themselves; the tool renumbers them after the project's last decision.
 */
export const decisionsJsonImporter = jsonReimporter<Decision>({
  id: "decisions-json",
  label: "Decision log JSON (.json)",
  description: "Decisions exported from here, added to this log",
  refKeys: ["supersededBy"],
  read: (data) => oneOrMany(data).map(readDecision),
  finish(decisions, { isImported }) {
    let unlinked = 0;
    const items = [...decisions]
      .sort((a, b) => a.number - b.number)
      .map((decision) => {
        if (!decision.supersededBy || isImported(decision.supersededBy)) return decision;
        unlinked++;
        return { ...decision, supersededBy: undefined };
      });
    const warnings = unlinked ? [`${unlinked} "superseded by" ${unlinked === 1 ? "link points" : "links point"} at decisions that weren't in the file, so ${unlinked === 1 ? "it was" : "they were"} left out`] : [];
    return { items, warnings };
  },
});
