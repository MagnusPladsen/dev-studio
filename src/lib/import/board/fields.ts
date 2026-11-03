import type { ColumnCategory, IssuePriority, IssueType } from "@/types";

/** Words other trackers use for each issue type. */
const TYPE_WORDS: [IssueType, RegExp][] = [
  ["bug", /^(bug|defect|incident|problem|error|fix)$/],
  ["feature", /^(feature|story|user story|epic|new feature|enhancement|improvement|request)$/],
  ["task", /^(task|sub-?task|todo|to-?do|issue|item)$/],
  ["chore", /^(chore|maintenance|tech(nical)? debt|refactor(ing)?|ops|infra(structure)?)$/],
  ["docs", /^(docs?|documentation)$/],
  ["design", /^(design|ux|ui|ui\/ux)$/],
  ["art", /^(art|graphics?|sprites?)$/],
  ["audio", /^(audio|sound|music|sfx)$/],
  ["writing", /^(writing|copy|narrative|story writing|dialogue)$/],
];

/** One of the app's issue types for a word like "Story" or "Bug", or null when it isn't one. */
export function issueTypeFrom(text: string): IssueType | null {
  const word = text.trim().toLowerCase();
  return TYPE_WORDS.find(([, pattern]) => pattern.test(word))?.[0] ?? null;
}

const PRIORITY_WORDS: [IssuePriority, RegExp][] = [
  ["highest", /^(highest|urgent|critical|blocker|p0|showstopper|1 - urgent)$/],
  ["high", /^(high|major|important|p1|2 - high)$/],
  ["medium", /^(medium|normal|moderate|p2|3 - medium)$/],
  ["low", /^(low|minor|p3|4 - low)$/],
  ["lowest", /^(lowest|trivial|p4|p5|someday)$/],
];

/** "Urgent", "P1", "Minor"… as a priority; anything else (or "No priority") is medium. */
export function priorityFrom(text: string): IssuePriority {
  const word = text.trim().toLowerCase();
  return PRIORITY_WORDS.find(([, pattern]) => pattern.test(word))?.[0] ?? "medium";
}

/** Which kind of column a status like "In Review" or "Won't do" belongs in. */
export function categoryFrom(status: string): ColumnCategory {
  const word = status.trim().toLowerCase();
  if (/done|closed|resolved|complete|finished|shipped|released|cancel|duplicate|won'?t/.test(word)) return "done";
  if (/progress|doing|review|testing|\bqa\b|started|active|blocked|develop|wip|working/.test(word)) return "doing";
  return "todo";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** A due date as yyyy-mm-dd: ISO dates, Jira's "12/Mar/24 9:00 AM", US "3/12/2024", or anything `Date` reads. */
export function dateFrom(text: string): string | undefined {
  const value = text.trim();
  if (!value) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return iso.slice(1, 4).join("-");
  const jira = /^(\d{1,2})\/([a-z]{3})\/(\d{2}|\d{4})\b/i.exec(value);
  if (jira && MONTHS.includes(jira[2].toLowerCase())) {
    const year = Number(jira[3]) < 100 ? 2000 + Number(jira[3]) : Number(jira[3]);
    return ymd(year, MONTHS.indexOf(jira[2].toLowerCase()) + 1, Number(jira[1]));
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(value);
  if (us) return ymd(Number(us[3]), Number(us[1]), Number(us[2]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : ymd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

export function pointsFrom(text: string): number | undefined {
  const points = parseFloat(text.replace(",", "."));
  return Number.isFinite(points) && points >= 0 ? points : undefined;
}

export function isYes(text: string): boolean {
  return text.trim() !== "" && !/^(no|false|0|n)$/i.test(text.trim());
}
