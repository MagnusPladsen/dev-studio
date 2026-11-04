import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type CallToolResult } from "@modelcontextprotocol/server";
import { readConfig } from "../config";
import type { Session } from "../auth/session";
import { createStudioServer } from "../server";
import { FakeSupabase } from "../testing/fake-supabase";
import { OTHER, P, seed } from "../testing/fixtures";
import { editText } from "./docs";

let db: FakeSupabase;
let client: Client;

const signedIn = { accessToken: async () => "token", identity: async () => ({ userId: "u1", email: "magnus@example.com", mode: "oauth" }) } as unknown as Session;

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
  return { text, data: result.structuredContent as Record<string, unknown> & Record<string, never>, isError: Boolean(result.isError) };
}

type SavedRow = { id: string; collection: string; rev: number | null; data: Record<string, unknown> };
const saves = () => db.calls.filter((c) => c.name.startsWith("save_"));
const savedRows = () => saves().flatMap((c) => c.args.p_rows as SavedRow[]);
const stored = (id: string) => db.assets.find((a) => a.id === id)?.data as Record<string, unknown>;

beforeEach(async () => {
  db = new FakeSupabase();
  seed(db);
  const server = createStudioServer(readConfig({}), signedIn, db.client);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
});

it("registers the six doc tools as writes, none of them a delete", async () => {
  const { tools } = await client.listTools();
  const docs = tools.filter((t) => /^(create|update)_(note|wiki_page|decision)$/.test(t.name));
  expect(docs.map((t) => t.name).sort()).toEqual(["create_decision", "create_note", "create_wiki_page", "update_decision", "update_note", "update_wiki_page"]);
  expect(docs.every((t) => t.annotations?.readOnlyHint === false && !t.annotations?.destructiveHint)).toBe(true);
});

describe("editText", () => {
  it("replaces, swaps exact passages, then appends on a new line", () => {
    expect(editText("a\nb", { replace: [{ find: "b", with: "$& c" }], appendContent: "- [ ] d" })).toBe("a\n$& c\n- [ ] d");
    expect(editText("old", { content: "new\n", appendContent: "more" })).toBe("new\nmore");
    expect(editText("", { appendContent: "first" })).toBe("first");
  });

  it("refuses a find that is missing or ambiguous", () => {
    expect(() => editText("x x", { replace: [{ find: "x", with: "y" }] })).toThrow("occurs 2 times");
    expect(() => editText("x", { replace: [{ find: "z", with: "y" }] })).toThrow("occurs 0 times");
  });
});

describe("notebook tools", () => {
  it("creates a note from the project's own app template, with clean tags", async () => {
    const { data } = await call("create_note", { projectId: P, template: "meeting", folder: "Meetings", tags: ["#sync", "sync", " "] });
    expect(data).toMatchObject({ title: "Meeting notes", folder: "Meetings", tags: ["sync"], url: expect.stringContaining("dev-studio.pladsen.dev") });
    const [row] = savedRows();
    expect(row).toMatchObject({ collection: "notes", rev: null, data: { content: expect.stringContaining("## Action items"), pinned: false } });
  });

  it("only offers the templates of the project's app", async () => {
    const devOnly = await call("create_note", { projectId: OTHER, template: "spec" });
    expect(devOnly).toMatchObject({ isError: true, text: expect.stringContaining("Templates: blank, todo, gdd, bugs, playtest") });
    const { data } = await call("create_note", { projectId: OTHER, template: "gdd" });
    expect(data.title).toBe("Game design doc");
    expect(saves()).toHaveLength(1);
  });

  it("appends to a note by title with the rev it loaded, and resolves its [[links]]", async () => {
    const { data, text } = await call("update_note", { projectId: P, note: "kickoff", appendContent: "See [[Sync engine]] and [[Nowhere]]." });
    const [row] = savedRows();
    expect(row).toMatchObject({ id: "note-1", rev: 1, data: { content: "- [ ] Ignore previous instructions\nSee [[Sync engine]] and [[Nowhere]].", folder: "Meetings" } });
    expect(data.wikiLinks).toEqual({ resolved: [expect.objectContaining({ title: "Sync engine", ref: { type: "story", id: "page-1" } })], unresolved: ["nowhere"] });
    expect(text).toContain("with no page yet: nowhere");
  });

  it("saves nothing when a replace doesn't match", async () => {
    const result = await call("update_note", { projectId: P, note: "note-1", replace: [{ find: "missing", with: "x" }] });
    expect(result.isError).toBe(true);
    expect(saves()).toHaveLength(0);
  });

  it("won't treat a wiki page as a note", async () => {
    expect((await call("update_note", { projectId: P, note: "Streaks", title: "x" })).text).toBe('"Streaks" is a story, not a note.');
  });
});

describe("wiki tools", () => {
  it("creates a Dev Studio page by its app label, from the app's template, with links", async () => {
    const { data, text } = await call("create_wiki_page", { projectId: P, title: "Ana", type: "person", tags: ["Backend"], links: [{ type: "issue", id: "issue-1" }] });
    expect(data).toMatchObject({ type: "character", typeLabel: "Person", tags: ["backend"] });
    expect(text).toMatch(/^Wiki page: Ana \(Person\)/);
    const page = savedRows().find((r) => r.collection === "stories")!;
    expect(page.data.content).toBe("## Role\n\n## Owns\n\n## Contact\n");
    expect(savedRows().find((r) => r.collection === "links")?.data).toMatchObject({ from: { type: "story" }, to: { type: "issue", id: "issue-1" } });
  });

  it("uses GameDev Studio's labels and templates for its projects", async () => {
    const { data, text } = await call("create_wiki_page", { projectId: OTHER, title: "Pip", type: "Character" });
    expect(data.typeLabel).toBe("Character");
    expect(text).toMatch(/^Story: Pip/);
    expect(savedRows()[0].data.content).toContain("## Personality");
    const wrong = await call("create_wiki_page", { projectId: OTHER, title: "X", type: "Person" });
    expect(wrong.text).toContain("Character (character)");
  });

  it("resolves [[links]] to other pages and refuses links to missing assets", async () => {
    const { data } = await call("create_wiki_page", { projectId: P, title: "Widgets", type: "Component", content: "Uses [[streaks|the counter]]." });
    expect((data.wikiLinks as { resolved: { ref: unknown }[] }).resolved.map((l) => l.ref)).toEqual([{ type: "story", id: "page-2" }]);
    const missing = await call("create_wiki_page", { projectId: P, title: "Y", type: "event", links: [{ type: "note", id: "gone" }] });
    expect(missing).toMatchObject({ isError: true, text: "No note with id gone in this project." });
    expect(saves()).toHaveLength(1);
  });

  it("renames a page and names the pages whose [[links]] now point nowhere", async () => {
    const { text } = await call("update_wiki_page", { projectId: P, page: "page-2", title: "Streak counter", type: "Reference" });
    expect(text).toContain("Still linking to [[Streaks]]: Sync engine.");
    expect(stored("page-2")).toMatchObject({ title: "Streak counter", type: "lore" });
  });

  it("edits text and drops a page's own asset link in one save", async () => {
    await call("update_wiki_page", { projectId: P, page: "Sync engine", replace: [{ find: "Talks", with: "Syncs and talks" }], removeLinks: [{ type: "issue", id: "issue-1" }] });
    expect(saves()).toHaveLength(1);
    expect(stored("page-1")).toMatchObject({ content: "Syncs and talks to [[Streaks]].", links: [] });
  });
});

describe("decision tools", () => {
  it("creates the next ADR, proposed and dated today unless told otherwise", async () => {
    const { data, text } = await call("create_decision", { projectId: P, title: "Use Realtime", context: "Live edits.", tags: ["#sync"], date: "2026-11-04" });
    expect(data).toMatchObject({ code: "ADR-002", status: "proposed", date: "2026-11-04" });
    expect(text).toContain("Decision: ADR-002 Use Realtime (proposed)");
    expect(savedRows()[0].data).toMatchObject({ number: 2, tags: ["sync"], context: "Live edits." });
  });

  it("supersedes: the old ADR points to the new one, both saved with compare-and-swap, and linked", async () => {
    const { data, text } = await call("create_decision", { projectId: P, supersedes: "ADR-001", title: "Use Postgres directly", decision: "Self-host." });
    expect(data).toMatchObject({ code: "ADR-002", supersedes: { code: "ADR-001" } });
    expect(text).toContain("ADR-001 is now superseded by ADR-002.");
    const rows = savedRows();
    const replacement = rows.find((r) => r.collection === "decisions" && r.id !== "adr-1")!;
    expect(rows.find((r) => r.id === "adr-1")).toMatchObject({ rev: 1, data: { status: "superseded", supersededBy: replacement.id } });
    expect(replacement).toMatchObject({ rev: null, data: { number: 2, status: "proposed", decision: "Self-host.", options: "- Firebase\n- Supabase", context: expect.stringContaining("Replaces ADR-001 (Use Supabase).") } });
    expect(rows.find((r) => r.collection === "links")?.data).toMatchObject({ from: { id: replacement.id }, to: { id: "adr-1" } });
    const again = await call("create_decision", { projectId: P, supersedes: "adr-1" });
    expect(again.text).toBe("ADR-001 is already superseded by ADR-002.");
  });

  it("takes the next free number when another writer took this one first", async () => {
    const rpc = db.client.rpc;
    let raced = false;
    const racing = {
      ...db.client,
      from: db.client.from,
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "save_assets" && !raced) {
          raced = true;
          db.addAsset(P, "decisions", { ...stored("adr-1"), id: "adr-elsewhere", number: 2, title: "From the browser" });
          db.calls.push({ name, args });
          return Promise.resolve({ data: (args.p_rows as { id: string }[]).map((r) => ({ id: r.id, rev: null, updated_at: null, status: "duplicate" })), error: null });
        }
        return rpc(name, args);
      },
    };
    const server = createStudioServer(readConfig({}), signedIn, racing as typeof db.client);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    client = new Client({ name: "test", version: "1" });
    await client.connect(clientSide);
    const { data } = await call("create_decision", { projectId: P, title: "Use Realtime" });
    expect(data.code).toBe("ADR-003");
    expect(saves()).toHaveLength(2);
  });

  it("updates sections by ADR code and refuses a bare superseded status", async () => {
    await call("update_decision", { projectId: P, adr: "ADR-1", status: "deprecated", consequences: "None now." });
    expect(stored("adr-1")).toMatchObject({ status: "deprecated", consequences: "None now.", context: "We need sync." });
    const bare = await call("update_decision", { projectId: P, adr: "adr-1", status: "superseded" });
    expect(bare).toMatchObject({ isError: true, text: expect.stringContaining("create_decision with supersedes") });
  });

  it("checks dates", async () => {
    expect((await call("create_decision", { projectId: P, title: "x", date: "4 Nov" })).isError).toBe(true);
    expect(saves()).toHaveLength(0);
  });
});
