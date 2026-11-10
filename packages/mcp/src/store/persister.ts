import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeEvent, Persister } from "@/lib/storage";
import type { CloudRow, CloudTable } from "@/lib/sync/cloud";
import { validateRow } from "@/lib/schema";

/** Supabase's row cap is 5 MB (DB trigger); checked here first for a clear error. */
const MAX_ROW_BYTES = 5 * 1024 * 1024;

type SaveStatus = "ok" | "conflict" | "missing" | "duplicate" | "orphan" | "forbidden";
type SaveResult = { id: string; rev: number | null; updated_at: string | null; status: SaveStatus };

type Upsert =
  | { kind: "project"; id: string; data: Record<string, unknown> }
  | { kind: "asset"; id: string; projectId: string; collection: string; data: Record<string, unknown> };
type Delete = { kind: "deleteAsset"; id: string; collection: string };
type Op = Upsert | Delete;

/** The write lost a race (someone else saved first, or took the issue key / ADR number): reload and run again. */
export class ConflictError extends Error {
  constructor(readonly rows: { id: string; status: SaveStatus }[]) {
    super(`Changed elsewhere while saving: ${rows.map((r) => `${r.id} (${r.status})`).join(", ")}`);
  }
}

/** The change itself is wrong or not allowed; running it again won't help. */
export class WriteRefused extends Error {}

export interface AwaitedPersister extends Persister {
  /** Rows as the server holds them: their rev is what a save expects. `light` rows are stand-ins and never written. */
  remember(table: CloudTable, rows: CloudRow[], light?: boolean): void;
  /** Writes every change heard since the last flush, and returns only once the server confirmed all of them. */
  flush(): Promise<{ written: number }>;
}

function key(op: Op) {
  return op.kind === "project" ? `p:${op.id}` : `a:${op.id}`;
}

function toOp(event: ChangeEvent): Op | null {
  if (event.op === "deleteProject") throw new WriteRefused("Claude can't delete projects. Delete it in the app.");
  if (event.collection === "projects") {
    if (event.op === "delete") throw new WriteRefused("Claude can't delete projects. Delete it in the app.");
    return { kind: "project", id: event.item.id, data: event.item as Record<string, unknown> };
  }
  if (!event.projectId) return null;
  if (event.op === "delete") return { kind: "deleteAsset", id: event.id, collection: event.collection };
  return { kind: "asset", id: event.item.id, projectId: event.projectId, collection: event.collection, data: event.item as Record<string, unknown> };
}

/**
 * The MCP's persister: hears the cache changes one tool call makes and writes them when the call
 * finishes, awaited, through the compare-and-swap RPCs (`save_projects` / `save_assets` with the
 * `rev` it loaded). Every body is validated first; one bad row and nothing is written.
 */
export function createAwaitedPersister(client: SupabaseClient): AwaitedPersister {
  const revs = new Map<string, number>();
  const light = new Set<string>();
  const queued = new Map<string, Op>();
  /** `storage` swallows errors thrown by persisters, so a refusal is kept and raised by `flush`. */
  let refusal: WriteRefused | null = null;

  function check(op: Upsert) {
    if (light.has(op.id)) throw new WriteRefused(`${op.id} was loaded name-only and can't be saved from here.`);
    const collection = op.kind === "project" ? "projects" : op.collection;
    const result = validateRow(collection as Parameters<typeof validateRow>[0], op.data);
    if (!result.ok) throw new WriteRefused(`Not saved, ${collection} ${op.id} is not valid: ${result.errors.join("; ")}`);
    if (Buffer.byteLength(JSON.stringify(op.data)) > MAX_ROW_BYTES) throw new WriteRefused(`Not saved, ${op.id} is larger than 5 MB.`);
  }

  function row(op: Upsert) {
    const rev = revs.get(key(op)) ?? null;
    const data = { ...op.data, id: op.id };
    return op.kind === "project"
      ? { id: op.id, name: String(op.data.name ?? ""), data, rev }
      : { id: op.id, project_id: op.projectId, collection: op.collection, data, rev };
  }

  async function save(table: CloudTable, ops: Upsert[]): Promise<number> {
    if (!ops.length) return 0;
    const { data, error } = await client.rpc(table === "projects" ? "save_projects" : "save_assets", { p_rows: ops.map(row) });
    if (error) throw error;
    const results = (data ?? []) as SaveResult[];
    for (const r of results) if (r.status === "ok" && r.rev !== null) revs.set(table === "projects" ? `p:${r.id}` : `a:${r.id}`, r.rev);
    const forbidden = results.filter((r) => r.status === "forbidden");
    if (forbidden.length) {
      throw new WriteRefused(`This project was shared with you as a viewer, so ${forbidden.map((r) => r.id).join(", ")} can't be changed. Ask its owner to make you an editor.`);
    }
    const failed = results.filter((r) => r.status !== "ok");
    if (failed.length) throw new ConflictError(failed);
    return results.length;
  }

  /** OAuth tokens may not delete (restrictive RLS): the delete then quietly affects no rows. */
  async function remove(ops: Delete[]): Promise<number> {
    if (!ops.length) return 0;
    const ids = ops.map((o) => o.id);
    const { data, error } = await client.from("assets").delete().in("id", ids).select("id");
    if (error) throw error;
    const deleted = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
    const kept = ops.filter((o) => !deleted.has(o.id));
    if (kept.length) {
      throw new WriteRefused(`Claude's sign-in can't delete, so ${kept.map((o) => `${o.collection} ${o.id}`).join(", ")} was kept. Remove it in the app.`);
    }
    return deleted.size;
  }

  return {
    name: "mcp",
    remember(table, rows, isLight = false) {
      for (const r of rows) {
        const k = table === "projects" ? `p:${r.id}` : `a:${r.id}`;
        if (typeof r.rev === "number") revs.set(k, r.rev);
        if (isLight) light.add(r.id);
      }
    },
    onChange(event) {
      try {
        const op = toOp(event);
        if (op) queued.set(key(op), op);
      } catch (error) {
        refusal ??= error as WriteRefused;
      }
    },
    async flush() {
      if (refusal) throw refusal;
      const ops = [...queued.values()];
      queued.clear();
      const upserts = ops.filter((o): o is Upsert => o.kind !== "deleteAsset");
      upserts.forEach(check);
      const written =
        (await save("projects", upserts.filter((o) => o.kind === "project"))) +
        (await save("assets", upserts.filter((o) => o.kind === "asset"))) +
        (await remove(ops.filter((o): o is Delete => o.kind === "deleteAsset")));
      return { written };
    },
  };
}
