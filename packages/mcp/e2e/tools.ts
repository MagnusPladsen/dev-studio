import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { check, must, section } from "./check";
import { serverEnv, type E2eEnv } from "./env";

type Data = Record<string, unknown>;
type Ref = { type: string; id: string; elementId?: string };

/** What the browser part opens afterwards: every asset the tools made, with the text its page must show. */
export interface Created {
  projectId: string;
  /** A Dev Studio project and a GameDev Studio one; the app under test is Dev Studio. */
  otherProjectId: string;
  items: { label: string; type: string; id: string; text: string; elementId?: string }[];
  /** A word that appears only in this run's text, for the search and RLS checks. */
  marker: string;
  scratchNoteId: string;
}

export const EXPECTED_TOOLS = [
  "sign_in", "whoami", "sign_out", "list_projects", "get_project", "create_project", "list_assets", "get_asset", "search",
  "get_related", "link", "unlink", "get_board", "list_issues", "get_issue", "create_issues", "update_issues", "create_sprint",
  "complete_sprint", "check_task", "create_note", "update_note", "create_wiki_page", "update_wiki_page", "create_decision",
  "update_decision", "get_canvas", "create_canvas", "edit_canvas", "layout_canvas",
];
const EXPECTED_PROMPTS = ["plan_sprint", "draw_data_model", "meeting_notes_to_issues", "record_decision"];

export async function connect(env: E2eEnv, clientId: string) {
  const client = new Client({ name: "dev-studio-mcp-e2e", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [env.serverEntry], env: serverEnv(env, clientId), stderr: "inherit" }));
  const call = async (name: string, args: Data = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; structuredContent?: Data; isError?: boolean };
    const text = result.content.map((part) => part.text ?? "").join("\n");
    return { text, data: (result.structuredContent ?? {}) as Data, isError: Boolean(result.isError) };
  };
  return { client, call };
}

type Call = Awaited<ReturnType<typeof connect>>["call"];

/** Asserts a tool call worked and returns it; a failed call stops the run, because later steps build on it. */
async function ok(call: Call, name: string, args: Data = {}) {
  const outcome = await call(name, args);
  must(`${name} ${JSON.stringify(args).slice(0, 90)}`, outcome.isError ? null : outcome, outcome.text);
  return outcome;
}

const get = <T>(value: unknown, ...path: (string | number)[]): T =>
  path.reduce<unknown>((at, key) => (at && typeof at === "object" ? (at as Record<string | number, unknown>)[key] : undefined), value) as T;

export async function runTools(env: E2eEnv, clientId: string, marker: string): Promise<Created> {
  const { client, call } = await connect(env, clientId);
  try {
    section("Capabilities");
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    check(`lists all ${EXPECTED_TOOLS.length} tools`, EXPECTED_TOOLS.every((name) => tools.includes(name)), { missing: EXPECTED_TOOLS.filter((name) => !tools.includes(name)) });
    check("offers no delete tool", !tools.some((name) => name.startsWith("delete")), tools);
    const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    check("lists the 4 prompts", EXPECTED_PROMPTS.every((name) => prompts.includes(name)), prompts);

    section("Session and projects");
    check("whoami: signed in", !(await call("whoami")).text.includes("Not signed in"));
    const project = get<string>((await ok(call, "create_project", { name: "E2E Tidepool", description: `Made by the end-to-end check ${marker}` })).data, "project", "id");
    const other = get<string>((await ok(call, "create_project", { name: "E2E Pip", app: "gamedev-studio" })).data, "project", "id");
    const listed = (await ok(call, "list_projects")).data.projects as { id: string; app: string }[];
    check("list_projects shows both apps' projects", listed.some((p) => p.id === project && p.app === "dev-studio") && listed.some((p) => p.id === other && p.app === "gamedev-studio"), listed);
    check("list_projects filters by app", ((await ok(call, "list_projects", { app: "gamedev-studio" })).data.projects as { id: string }[]).every((p) => p.id !== project));
    await ok(call, "get_project", { projectId: project });

    const items: Created["items"] = [];
    const board = await boardTools(call, project, marker, items);
    const docs = await docTools(call, project, marker, items, board.firstIssue);
    await canvasTools(call, project, items, docs.wikiId);
    await readTools(call, project, marker, items);
    await promptsAndResources(client, project, docs.noteTitle);
    return { projectId: project, otherProjectId: other, items, marker, scratchNoteId: docs.scratchNoteId };
  } finally {
    await client.close();
  }
}

async function boardTools(call: Call, projectId: string, marker: string, items: Created["items"]) {
  section("Task Board");
  const created = (
    await ok(call, "create_issues", {
      projectId,
      issues: [
        { title: `Fix streak reset ${marker}`, type: "bug", priority: "high", labels: ["Sync"], points: 3, description: "- [ ] Repro\n- [ ] Fix" },
        { title: "Home screen widgets", type: "feature", points: 5 },
        { title: "Write release notes", type: "docs", column: "In Progress" },
      ],
    })
  ).data.issues as { key: string; id: string; title: string }[];
  const keys = created.map((issue) => issue.key);
  const prefix = keys[0]?.split("-")[0];
  check("create_issues: three contiguous keys", keys.join() === [1, 2, 3].map((n) => `${prefix}-${n}`).join(), keys);
  const boardData = (await ok(call, "get_board", { projectId })).data;
  check("get_board: key prefix and labels", get(boardData, "board", "keyPrefix") === prefix && JSON.stringify(get(boardData, "board", "labels")).includes("sync"), boardData.board);
  check("list_issues: filter by type", (await ok(call, "list_issues", { projectId, type: "bug" })).data.total === 1);
  check("list_issues: filter by text", (await ok(call, "list_issues", { projectId, text: "widgets" })).data.total === 1);
  check("get_issue: checklist progress", JSON.stringify((await ok(call, "get_issue", { projectId, issue: keys[0] })).data.checklist) === JSON.stringify({ done: 0, total: 2 }));

  const sprint = (await ok(call, "create_sprint", { projectId, name: "E2E sprint", goal: "Ship it", start: true, issues: [keys[0], keys[1]] })).data.sprint as { state: string };
  check("create_sprint: started with two issues", sprint.state === "active" && get(sprint, "issues", "open") === 2, sprint);
  const updated = (await ok(call, "update_issues", { projectId, updates: [{ issue: keys[0], column: "Done", addLabels: ["Bug Bash"] }, { issue: keys[2], title: "Write the release notes" }] })).data.issues as { column: string; labels: string[] }[];
  check("update_issues: moved to Done, label added", updated[0]?.column === "Done" && updated[0]?.labels.includes("bug-bash"), updated);
  const ticked = (await ok(call, "check_task", { projectId, ref: { type: "issue", id: created[0].id }, task: "Repro", done: true })).data;
  check("check_task: issue task ticked", JSON.stringify(ticked.progress) === JSON.stringify({ done: 1, total: 2 }), ticked);
  const completed = (await ok(call, "complete_sprint", { projectId })).data;
  check("complete_sprint: done archived, open moved to backlog", completed.archived === 1 && completed.moved === 1 && completed.movedTo === "Backlog", completed);
  check("list_issues: archived issue hidden by default", (await ok(call, "list_issues", { projectId })).data.total === 2);

  items.push({ label: `issue ${keys[1]}`, type: "issue", id: created[1].id, text: "Home screen widgets" });
  items.push({ label: `issue ${keys[2]}`, type: "issue", id: created[2].id, text: "Write the release notes" });
  return { firstIssue: { type: "issue", id: created[1].id } as Ref };
}

async function docTools(call: Call, projectId: string, marker: string, items: Created["items"], issue: Ref) {
  section("Notebook, Wiki, Decision log");
  const noteTitle = "E2E standup";
  const note = (await ok(call, "create_note", { projectId, title: noteTitle, template: "meeting", content: `Notes ${marker}\n\n- [ ] Follow up on sync\n- [ ] Book the room`, folder: "Meetings", tags: ["e2e"] })).data;
  const noteRef = note.ref as Ref;
  check("create_note: in its folder", note.folder === "Meetings", note);
  await ok(call, "update_note", { projectId, note: noteTitle, appendContent: "See [[E2E Sync engine]].", replace: [{ find: "Book the room", with: "Book the big room" }] });
  check("check_task: note task ticked", get((await ok(call, "check_task", { projectId, ref: noteRef, task: "Follow up", done: true })).data, "progress", "done") === 1);
  const scratch = (await ok(call, "create_note", { projectId, title: "E2E scratch" })).data.ref as Ref;

  await ok(call, "create_wiki_page", { projectId, title: "E2E Glossary", type: "Reference", content: "Habit: a thing done daily." });
  const page = (await ok(call, "create_wiki_page", { projectId, title: "E2E Sync engine", type: "System", content: `Syncs habits ${marker}. Terms in [[E2E Glossary]].`, links: [issue] })).data;
  const pageRef = page.ref as Ref;
  check("create_wiki_page: Dev Studio type label and resolved [[link]]", page.typeLabel === "System" && get<unknown[]>(page, "wikiLinks", "resolved").length === 1, page);
  await ok(call, "update_wiki_page", { projectId, page: "E2E Sync engine", appendContent: "- [ ] Write the conflict rules", tags: ["core"] });

  const first = (await ok(call, "create_decision", { projectId, title: "Store habits in localStorage", status: "accepted", context: `Offline first ${marker}`, decision: "Use localStorage." })).data;
  const second = (await ok(call, "create_decision", { projectId, title: "Store habits in Supabase", status: "accepted", decision: "Use Supabase with CAS.", supersedes: "ADR-001" })).data;
  check("create_decision: ADR numbers 1 and 2", JSON.stringify(first).includes("ADR-001") && JSON.stringify(second).includes("ADR-002"), { first, second });
  await ok(call, "update_decision", { projectId, adr: "ADR-002", consequences: "Needs a migration." });
  const old = await ok(call, "get_asset", { projectId, ref: first.ref as Ref });
  check("supersede marks ADR-001 superseded", /superseded/i.test(old.text), old.text.slice(0, 400));

  items.push({ label: "note", type: "note", id: noteRef.id, text: noteTitle });
  items.push({ label: "wiki page", type: "story", id: pageRef.id, text: "E2E Sync engine" });
  items.push({ label: "ADR-001", type: "decision", id: (first.ref as Ref).id, text: "Store habits in localStorage" });
  items.push({ label: "ADR-002", type: "decision", id: (second.ref as Ref).id, text: "Store habits in Supabase" });
  return { noteTitle, wikiId: pageRef.id, scratchNoteId: scratch.id };
}

async function canvasTools(call: Call, projectId: string, items: Created["items"], wikiId: string) {
  section("Canvas (data model)");
  const made = (
    await ok(call, "create_canvas", {
      projectId,
      name: "E2E data model",
      ops: [
        { op: "add", ref: "users", kind: "table", text: "users", columns: [{ name: "id", type: "uuid", pk: true }, { name: "email", type: "text" }] },
        { op: "add", ref: "habits", kind: "table", text: "habits", columns: [{ name: "id", type: "uuid", pk: true }, { name: "user_id", type: "uuid", fk: true }, { name: "name", type: "text" }] },
        { op: "connect", from: "habits", to: "users", label: "belongs to" },
      ],
    })
  ).data;
  const canvasId = get<string>(made, "canvas", "id");
  const outline = await ok(call, "get_canvas", { projectId, canvas: "E2E data model" });
  check("get_canvas: two tables and a relation line", (outline.data.nodes as unknown[]).length === 2 && (outline.data.lines as unknown[]).length === 1, outline.text);
  const edited = (await ok(call, "edit_canvas", { projectId, canvas: canvasId, ops: [{ op: "add", ref: "todo", kind: "checklist", text: "Launch", items: [{ text: "Indexes" }, { text: "RLS" }] }] })).data;
  const listId = get<string>(edited, "refs", "todo", "id");
  check("edit_canvas: checklist added", Boolean(listId), edited);
  const ticked = (await ok(call, "check_task", { projectId, ref: { type: "diagram", id: canvasId, elementId: listId }, task: "RLS", done: true })).data;
  check("check_task: canvas checklist item ticked", get(ticked, "progress", "done") === 1, ticked);
  await ok(call, "layout_canvas", { projectId, canvas: canvasId, everything: true, algorithm: "erd" });

  section("Links");
  const usersId = get<string>(made, "refs", "users", "id");
  check("link: wiki page to a canvas element", get((await ok(call, "link", { projectId, from: { type: "story", id: wikiId }, to: { type: "diagram", id: canvasId, elementId: usersId } })).data, "created") === true);
  const related = (await ok(call, "get_related", { projectId, ref: { type: "story", id: wikiId } })).data.related;
  check("get_related: sees the canvas element and the issue", JSON.stringify(related).includes(canvasId) && JSON.stringify(related).includes("issue"), related);
  const unlinked = await call("unlink", { projectId, from: { type: "story", id: wikiId }, to: { type: "diagram", id: canvasId, elementId: usersId } });
  const afterUnlink = (await ok(call, "get_related", { projectId, ref: { type: "story", id: wikiId } })).data.related;
  check("unlink: a link made with link stays (OAuth tokens can't delete)", JSON.stringify(afterUnlink).includes(canvasId), afterUnlink);
  check("unlink: says the link stays and why", unlinked.text !== "Unlinked." && /app/i.test(unlinked.text), unlinked);

  items.push({ label: "canvas", type: "diagram", id: canvasId, text: "users" });
  items.push({ label: "canvas element", type: "diagram", id: canvasId, elementId: usersId, text: "habits" });
}

async function readTools(call: Call, projectId: string, marker: string, items: Created["items"]) {
  section("Generic reads and search");
  for (const type of ["issue", "note", "story", "decision", "diagram"]) {
    const listed = (await ok(call, "list_assets", { projectId, type })).data;
    check(`list_assets ${type}: has this run's items`, items.filter((item) => item.type === type).every((item) => JSON.stringify(listed.items).includes(item.id)), listed);
  }
  for (const item of items.filter((entry) => !entry.elementId)) {
    const asset = await ok(call, "get_asset", { projectId, ref: { type: item.type, id: item.id } });
    check(`get_asset ${item.label}: markdown shows "${item.text}"`, asset.text.includes(item.text), asset.text.slice(0, 300));
  }
  check("get_asset by name", (await ok(call, "get_asset", { projectId, name: "E2E standup" })).text.includes("Follow up on sync"));
  const hits = (await ok(call, "search", { query: marker, projectId })).data.hits as { type?: string; ref?: Ref }[];
  check("search: finds the marker in issue, note, wiki page and decision", ["issue", "note", "story", "decision"].every((type) => JSON.stringify(hits).includes(`"${type}"`)), hits);
  check("search: canvas labels are searchable", JSON.stringify((await ok(call, "search", { query: "habits", projectId, types: ["diagram"] })).data.hits).includes("diagram"));
}

async function promptsAndResources(client: Client, projectId: string, noteTitle: string) {
  section("Prompts and resources");
  const promptArgs: Record<string, Record<string, string>> = {
    plan_sprint: { projectId, capacity: "8", goal: "Sync" },
    draw_data_model: { projectId, source: "users, habits" },
    meeting_notes_to_issues: { projectId, note: noteTitle },
    record_decision: { projectId, topic: "Sync conflicts" },
  };
  for (const [name, args] of Object.entries(promptArgs)) {
    const prompt = await client.getPrompt({ name, arguments: args });
    const text = JSON.stringify(prompt.messages);
    check(`prompt ${name}: mentions the project`, prompt.messages.length > 0 && text.includes(projectId), text.slice(0, 300));
  }
  const projects = await client.readResource({ uri: "studio://projects" });
  check("resource studio://projects lists the project", JSON.stringify(projects.contents).includes(projectId));
  const shapes = await client.readResource({ uri: "studio://shapes" });
  check("resource studio://shapes", JSON.stringify(shapes.contents).includes("table"));
}

/** Signs out through the tool, which forgets the stored sign-in, and checks the server notices. */
export async function signOutTool(env: E2eEnv, clientId: string) {
  const { client, call } = await connect(env, clientId);
  try {
    await ok(call, "sign_out");
    check("after sign_out, tools say Not signed in", (await call("list_projects")).text.includes("Not signed in"));
  } finally {
    await client.close();
  }
}
