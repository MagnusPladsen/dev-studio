import * as z from "zod";
import { v4 as uuid } from "uuid";
import type { AssetRef, AssetType, Decision, Note, Project, StoryEntry } from "@/types";
import { copyFor, type StoryEntryType } from "@/copy";
import { createDecision, decisionCode, supersedeDecision } from "@/lib/decisions";
import { addLink, removeLink, wikiTargets } from "@/lib/links";
import { DECISION_STATUSES, STORY_ENTRY_TYPES } from "@/lib/schema/text";
import { storage } from "@/lib/storage";
import { normalizeTag, type TagKind } from "@/lib/tags";
import { assetRefSchema, assetUrl, projectApp, projectIdSchema, requireProject, requireRef, resolveName } from "../refs";
import { guarded, result, WRITES, type ToolContext } from "./context";

/** Notes and decisions link by `[[Title]]` to notes and wiki pages; wiki pages to wiki pages (as in the app). */
const DOC_SCOPE = ["notes", "stories", "decisions", "links"] as const;
const scope = (projectId: string) => ({ projectId, collections: [...DOC_SCOPE] });
/** Wiki pages link to any kind of asset (art and audio load name-only). */
const wikiScope = (projectId: string) => ({ projectId, collections: "all" as const });

const title = z.string().trim().min(1).max(300);
const text = z.string().max(200_000);
const tagList = z.array(z.string().max(100)).max(50);
const replaceSchema = z
  .array(z.object({ find: z.string().min(1).max(10_000), with: z.string().max(200_000) }))
  .max(50)
  .describe("Exact text swaps, applied in order. Each find must occur exactly once.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd.");
const docRef = (what: string) => z.string().min(1).max(300).describe(`The ${what}'s id or exact title.`);

type TextEdit = { content?: string; appendContent?: string; replace?: { find: string; with: string }[] };

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** `content` replaces the text, then each `replace` swaps one exact passage, then `appendContent` goes at the end. */
export function editText(current: string, edit: TextEdit): string {
  let next = edit.content ?? current;
  for (const swap of edit.replace ?? []) {
    const found = occurrences(next, swap.find);
    if (found !== 1) throw new Error(`"${swap.find.slice(0, 60)}" occurs ${found} times; replace needs exactly one. Nothing was saved.`);
    next = next.replace(swap.find, () => swap.with);
  }
  if (edit.appendContent) next = next && !next.endsWith("\n") ? `${next}\n${edit.appendContent}` : next + edit.appendContent;
  return next;
}

function cleanTags(kind: TagKind, typed: string[]): string[] {
  return [...new Set(typed.map((t) => normalizeTag(kind, t)).filter(Boolean))];
}

/** A note, wiki page or decision by id, exact title, or (decisions) "ADR-003". */
function findDoc<T extends { id: string }>(projectId: string, type: AssetType, collection: "notes" | "stories" | "decisions", value: string): T {
  const byId = storage.getById(collection, value.trim(), projectId);
  if (byId) return byId as unknown as T;
  const ref = resolveName(projectId, value);
  if (ref.type !== type) throw new Error(`"${value}" is a ${ref.type}, not a ${type}.`);
  return storage.getById(collection, ref.id, projectId) as unknown as T;
}

interface WikiLinks {
  resolved: { title: string; ref: AssetRef; url: string }[];
  unresolved: string[];
}

/** Where each `[[Title]]` in `content` points, using the same title lookup as the app's editor. */
function resolveWikiLinks(project: Project, content: string, targets: ("stories" | "notes")[]): WikiLinks {
  const index = new Map<string, AssetRef & { title: string }>();
  for (const collection of targets) {
    for (const item of storage.getAll(collection, project.id)) {
      index.set(item.title.trim().toLowerCase(), { type: collection === "stories" ? "story" : "note", id: item.id, title: item.title });
    }
  }
  const links: WikiLinks = { resolved: [], unresolved: [] };
  for (const target of new Set(wikiTargets(content))) {
    const hit = index.get(target);
    if (hit) links.resolved.push({ title: hit.title, ref: { type: hit.type, id: hit.id }, url: assetUrl(project, hit) });
    else links.unresolved.push(target);
  }
  return links;
}

function wikiLinkLine(links: WikiLinks): string {
  const parts = [];
  if (links.resolved.length) parts.push(`[[links]] to: ${links.resolved.map((l) => l.title).join(", ")}`);
  if (links.unresolved.length) parts.push(`[[links]] with no page yet: ${links.unresolved.join(", ")}`);
  return parts.join("\n");
}

function describeSaved(kind: string, name: string, url: string, links: WikiLinks, extra: string[] = []): string {
  return [`${kind}: ${name}`, `Open: ${url}`, wikiLinkLine(links), ...extra].filter(Boolean).join("\n");
}

// ─── Notebook ──────────────────────────────────────────────────────────

function noteTemplate(project: Project, key: string | undefined) {
  if (!key) return undefined;
  const templates = copyFor(projectApp(project)).notebook.templates;
  const template = templates.find((t) => t.key === key);
  if (!template) throw new Error(`No note template "${key}" in this app. Templates: ${templates.map((t) => t.key).join(", ")}.`);
  return template;
}

function noteResult(project: Project, note: Note) {
  const ref = { type: "note" as const, id: note.id };
  const url = assetUrl(project, ref);
  const wikiLinks = resolveWikiLinks(project, note.content, ["stories", "notes"]);
  const folder = note.folder ? ` (in ${note.folder})` : "";
  return result(describeSaved("Note", `${note.title}${folder}`, url, wikiLinks), { ref, title: note.title, folder: note.folder ?? "", tags: note.tags, url, wikiLinks });
}

function registerNoteTools(ctx: ToolContext): void {
  const { server, studio } = ctx;

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Creates a Notebook note (Markdown; \"- [ ] task\" lines are checklists, [[Title]] links a note or wiki page). template starts from one of the app's note templates: Dev Studio blank, todo, spec, bugs, meeting; GameDev Studio blank, todo, gdd, bugs, playtest. content replaces the template's text.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        title: title.optional().describe("Default: the template's title, or \"Untitled note\"."),
        content: text.optional(),
        template: z.string().max(40).optional(),
        folder: z.string().trim().max(200).optional(),
        pinned: z.boolean().optional(),
        tags: tagList.optional(),
      }),
      annotations: WRITES,
    },
    (input) =>
      guarded(async () => {
        const { project, note } = await studio.write(scope(input.projectId), () => {
          const project = requireProject(input.projectId);
          const template = noteTemplate(project, input.template);
          const now = new Date().toISOString();
          const note: Note = {
            id: uuid(),
            projectId: project.id,
            title: input.title ?? template?.title ?? "Untitled note",
            content: input.content ?? template?.content ?? "",
            folder: input.folder ?? "",
            pinned: input.pinned ?? false,
            tags: cleanTags("note", input.tags ?? []),
            createdAt: now,
            updatedAt: now,
          };
          storage.save("notes", note, project.id);
          return { project, note };
        });
        return noteResult(project, note);
      })
  );

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description:
        "Edits a note. Prefer appendContent or replace over resending the whole content: they keep the user's other edits. tags replaces the tag list.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        note: docRef("note"),
        title: title.optional(),
        content: text.optional().describe("The whole new text."),
        appendContent: text.optional(),
        replace: replaceSchema.optional(),
        folder: z.string().trim().max(200).optional().describe("\"\" takes it out of its folder."),
        pinned: z.boolean().optional(),
        tags: tagList.optional(),
      }),
      annotations: WRITES,
    },
    (input) =>
      guarded(async () => {
        const { project, note } = await studio.write(scope(input.projectId), () => {
          const project = requireProject(input.projectId);
          const current = findDoc<Note>(project.id, "note", "notes", input.note);
          const note: Note = {
            ...current,
            title: input.title ?? current.title,
            content: editText(current.content, input),
            folder: input.folder ?? current.folder,
            pinned: input.pinned ?? current.pinned,
            tags: input.tags ? cleanTags("note", input.tags) : current.tags,
            updatedAt: new Date().toISOString(),
          };
          storage.save("notes", note, project.id);
          return { project, note };
        });
        return noteResult(project, note);
      })
  );
}

// ─── Wiki / Story ──────────────────────────────────────────────────────

/** An entry type by its stored name ("character") or the app's label for it ("Person" in Dev Studio). */
function entryType(project: Project, typed: string): StoryEntryType {
  const labels = copyFor(projectApp(project)).story.entryTypes;
  const wanted = typed.trim().toLowerCase();
  const match = STORY_ENTRY_TYPES.find((t) => t === wanted || labels[t].toLowerCase() === wanted);
  if (!match) throw new Error(`No page type "${typed}". Types: ${STORY_ENTRY_TYPES.map((t) => `${labels[t]} (${t})`).join(", ")}.`);
  return match;
}

function sameTitleWarning(projectId: string, page: StoryEntry): string[] {
  const lower = page.title.trim().toLowerCase();
  const twins = storage.getAll("stories", projectId).filter((s) => s.id !== page.id && s.title.trim().toLowerCase() === lower);
  return twins.length ? [`Another page is also called "${page.title}", so [[${page.title}]] may open either.`] : [];
}

function linkPages(projectId: string, page: StoryEntry, refs: AssetRef[] = []) {
  for (const ref of refs) {
    requireRef(projectId, ref);
    addLink(projectId, { type: "story", id: page.id }, ref);
  }
}

function pageResult(project: Project, page: StoryEntry, extra: string[] = []) {
  const ref = { type: "story" as const, id: page.id };
  const url = assetUrl(project, ref);
  const label = copyFor(projectApp(project)).story.entryTypes[page.type];
  const wikiLinks = resolveWikiLinks(project, page.content, ["stories"]);
  const kind = copyFor(projectApp(project)).assetKinds.story;
  return result(describeSaved(kind, `${page.title} (${label})`, url, wikiLinks, extra), { ref, title: page.title, type: page.type, typeLabel: label, tags: page.tags, url, wikiLinks });
}

const typeDescription =
  "Dev Studio: Person, System, Component, Event, Reference, Goal, Other. GameDev Studio: Character, Location, Item, Event, Lore, Quest, Other. The stored names (character, location, item, event, lore, quest, note) work in both.";

function registerWikiTools(ctx: ToolContext): void {
  const { server, studio } = ctx;

  server.registerTool(
    "create_wiki_page",
    {
      title: "Create wiki page",
      description:
        "Creates a Wiki page (called Story entry in GameDev Studio). Without content, Person/System/Component/Goal (Character/Location/Item/Quest) pages start from the app's template. [[Title]] in the text links other pages; links attaches other assets.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        title,
        type: z.string().min(1).max(40).describe(typeDescription),
        content: text.optional(),
        tags: tagList.optional(),
        links: z.array(assetRefSchema).max(50).optional(),
      }),
      annotations: WRITES,
    },
    (input) =>
      guarded(async () => {
        const { project, page } = await studio.write(wikiScope(input.projectId), () => {
          const project = requireProject(input.projectId);
          const type = entryType(project, input.type);
          const now = new Date().toISOString();
          const page: StoryEntry = {
            id: uuid(),
            projectId: project.id,
            title: input.title,
            content: input.content ?? copyFor(projectApp(project)).story.templates[type] ?? "",
            type,
            links: [],
            tags: cleanTags("story", input.tags ?? []),
            createdAt: now,
            updatedAt: now,
          };
          storage.save("stories", page, project.id);
          linkPages(project.id, page, input.links);
          return { project, page };
        });
        return pageResult(project, page, sameTitleWarning(project.id, page));
      })
  );

  server.registerTool(
    "update_wiki_page",
    {
      title: "Update wiki page",
      description:
        "Edits a Wiki page (Story entry in GameDev Studio). Prefer appendContent or replace over resending the whole content. tags replaces the tag list. removeLinks can't remove a link made with the link tool (Claude can't delete); the user removes those in the app.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        page: docRef("page"),
        title: title.optional(),
        type: z.string().min(1).max(40).optional().describe(typeDescription),
        content: text.optional().describe("The whole new text."),
        appendContent: text.optional(),
        replace: replaceSchema.optional(),
        tags: tagList.optional(),
        addLinks: z.array(assetRefSchema).max(50).optional(),
        removeLinks: z.array(assetRefSchema).max(50).optional(),
      }),
      annotations: WRITES,
    },
    (input) =>
      guarded(async () => {
        const { project, page, oldTitle } = await studio.write(wikiScope(input.projectId), () => {
          const project = requireProject(input.projectId);
          const current = findDoc<StoryEntry>(project.id, "story", "stories", input.page);
          const page: StoryEntry = {
            ...current,
            title: input.title ?? current.title,
            type: input.type ? entryType(project, input.type) : current.type,
            content: editText(current.content, input),
            tags: input.tags ? cleanTags("story", input.tags) : current.tags,
            updatedAt: new Date().toISOString(),
          };
          storage.save("stories", page, project.id);
          linkPages(project.id, page, input.addLinks);
          for (const ref of input.removeLinks ?? []) removeLink(project.id, { type: "story", id: page.id }, ref);
          return { project, page: storage.getById("stories", page.id, project.id)!, oldTitle: current.title };
        });
        return pageResult(project, page, [...renameNotice(project.id, oldTitle, page), ...sameTitleWarning(project.id, page)]);
      })
  );
}

/** A rename leaves other pages' [[Old title]] links pointing nowhere; say which, so Claude can fix them. */
function renameNotice(projectId: string, oldTitle: string, page: StoryEntry): string[] {
  const old = oldTitle.trim().toLowerCase();
  if (old === page.title.trim().toLowerCase()) return [];
  const stale = storage.getAll("stories", projectId).filter((s) => s.id !== page.id && wikiTargets(s.content).includes(old));
  return stale.length ? [`Still linking to [[${oldTitle}]]: ${stale.map((s) => s.title).join(", ")}.`] : [];
}

// ─── Decision log ──────────────────────────────────────────────────────

const decisionFields = {
  title: title.optional(),
  status: z.enum(DECISION_STATUSES).optional(),
  date: isoDate.optional().describe("yyyy-mm-dd, when it was decided or proposed."),
  context: text.optional().describe("Markdown: the situation and what forces a decision."),
  options: text.optional().describe("Markdown: the options considered."),
  decision: text.optional().describe("Markdown: what we will do."),
  consequences: text.optional().describe("Markdown: what gets easier or harder."),
  tags: tagList.optional(),
};

type DecisionInput = { title?: string; status?: Decision["status"]; date?: string; context?: string; options?: string; decision?: string; consequences?: string; tags?: string[] };

function decisionPatch(input: DecisionInput): Partial<Decision> {
  const patch: Partial<Decision> = {};
  for (const key of ["title", "status", "date", "context", "options", "decision", "consequences"] as const) {
    if (input[key] !== undefined) Object.assign(patch, { [key]: input[key] });
  }
  if (input.tags) patch.tags = cleanTags("decision", input.tags);
  return patch;
}

function newDecision(projectId: string, input: DecisionInput): Decision {
  const decision = createDecision(projectId, storage.getAll("decisions", projectId), decisionPatch(input));
  storage.save("decisions", decision, projectId);
  return decision;
}

/** As the app's Supersede button: the new decision starts from the old one, the old one is marked superseded and points to it. */
function supersede(projectId: string, value: string, input: DecisionInput): { decision: Decision; replaced: Decision } {
  const old = findDoc<Decision>(projectId, "decision", "decisions", value);
  const all = storage.getAll("decisions", projectId);
  if (old.supersededBy) {
    const by = all.find((d) => d.id === old.supersededBy);
    throw new Error(`${decisionCode(old.number)} is already superseded${by ? ` by ${decisionCode(by.number)}` : ""}.`);
  }
  const { replaced, replacement } = supersedeDecision(old, all);
  const patch = decisionPatch(input);
  if (input.context !== undefined) patch.context = `Replaces ${decisionCode(old.number)} (${old.title}).\n\n${input.context}`.trim();
  const decision = { ...replacement, ...patch };
  storage.save("decisions", replaced, projectId);
  storage.save("decisions", decision, projectId);
  addLink(projectId, { type: "decision", id: decision.id }, { type: "decision", id: replaced.id });
  return { decision, replaced };
}

function decisionResult(project: Project, decision: Decision, replaced?: Decision) {
  const ref = { type: "decision" as const, id: decision.id };
  const url = assetUrl(project, ref);
  const code = decisionCode(decision.number);
  const fields = [decision.context, decision.options, decision.decision, decision.consequences].join("\n");
  const wikiLinks = resolveWikiLinks(project, fields, ["stories", "notes"]);
  const extra = replaced ? [`${decisionCode(replaced.number)} is now superseded by ${code}.`] : [];
  return result(describeSaved("Decision", `${code} ${decision.title} (${decision.status})`, url, wikiLinks, extra), {
    ref,
    code,
    title: decision.title,
    status: decision.status,
    date: decision.date,
    url,
    wikiLinks,
    ...(replaced ? { supersedes: { ref: { type: "decision", id: replaced.id }, code: decisionCode(replaced.number) } } : {}),
  });
}

function registerDecisionTools(ctx: ToolContext): void {
  const { server, studio } = ctx;

  server.registerTool(
    "create_decision",
    {
      title: "Create decision",
      description:
        "Adds an architecture decision record to the Decision log as the next ADR number (proposed, dated today unless given). supersedes (\"ADR-002\", an id or a title) replaces that decision: it becomes superseded and points to the new one, which starts from its context, options and tags.",
      inputSchema: z.object({ projectId: projectIdSchema, ...decisionFields, supersedes: z.string().min(1).max(300).optional() }),
      annotations: WRITES,
    },
    ({ projectId, supersedes, ...input }) =>
      guarded(async () => {
        const saved = await studio.write(scope(projectId), () => {
          const project = requireProject(projectId);
          const made = supersedes ? supersede(projectId, supersedes, input) : { decision: newDecision(projectId, input), replaced: undefined };
          return { project, ...made };
        });
        return decisionResult(saved.project, saved.decision, saved.replaced);
      })
  );

  server.registerTool(
    "update_decision",
    {
      title: "Update decision",
      description:
        "Edits a decision (adr: \"ADR-003\", an id or a title). Each text field given replaces that section; tags replaces the tag list. To replace a decision with a new one, use create_decision with supersedes.",
      inputSchema: z.object({ projectId: projectIdSchema, adr: z.string().min(1).max(300).describe("ADR-003, an id or the exact title."), ...decisionFields }),
      annotations: WRITES,
    },
    ({ projectId, adr, ...input }) =>
      guarded(async () => {
        const saved = await studio.write(scope(projectId), () => {
          const project = requireProject(projectId);
          const current = findDoc<Decision>(projectId, "decision", "decisions", adr);
          const patch = decisionPatch(input);
          if (patch.status === "superseded" && !current.supersededBy) throw new Error("Use create_decision with supersedes to replace a decision, so both records point at each other.");
          const decision: Decision = { ...current, ...patch, updatedAt: new Date().toISOString() };
          storage.save("decisions", decision, projectId);
          return { project, decision };
        });
        return decisionResult(saved.project, saved.decision);
      })
  );
}

/** Notebook, Wiki/Story and Decision log: create and edit, never delete. Every save is compare-and-swap. */
export function registerDocTools(ctx: ToolContext): void {
  registerNoteTools(ctx);
  registerWikiTools(ctx);
  registerDecisionTools(ctx);
}
