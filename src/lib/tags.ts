/** Where a tag is typed. Each tool has always cleaned tags its own way; this keeps the app and the MCP server agreeing. */
export type TagKind = "story" | "note" | "decision" | "label";

/**
 * A typed tag as the tool stores it, or "" when nothing is left.
 * Story tags are lower case; note and decision tags drop a leading "#"; issue labels are lower case with dashes.
 */
export function normalizeTag(kind: TagKind, typed: string): string {
  const tag = typed.trim();
  switch (kind) {
    case "story":
      return tag.toLowerCase();
    case "note":
    case "decision":
      return tag.replace(/^#/, "");
    case "label":
      return tag.toLowerCase().replace(/\s+/g, "-");
  }
}
