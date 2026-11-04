import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = { id: string; project_id?: string; collection?: string; data: Record<string, unknown>; updated_at: string; rev: number };
type SaveRow = { id: string; project_id?: string; collection?: string; data: Record<string, unknown>; rev: number | null };
export type RpcCall = { name: string; args: Record<string, unknown> };

/**
 * Just enough of supabase-js for the server: PostgREST selects with eq/in/order/range/maybeSingle,
 * deletes (refused like RLS does for OAuth clients), and the save/search RPCs.
 */
export class FakeSupabase {
  projects: Row[] = [];
  assets: Row[] = [];
  calls: RpcCall[] = [];
  /** Statuses to answer the next save_* calls with, before falling back to real behaviour. */
  forcedStatuses: string[][] = [];
  searchRows: Record<string, unknown>[] = [];
  canDelete = false;

  get client(): SupabaseClient {
    return { from: (table: string) => this.query(table), rpc: (name: string, args: Record<string, unknown>) => this.rpc(name, args) } as unknown as SupabaseClient;
  }

  private table(name: string): Row[] {
    return name === "projects" ? this.projects : this.assets;
  }

  private query(tableName: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let isDelete = false;
    let range: [number, number] | null = null;
    const run = () => {
      const rows = this.table(tableName).filter((r) => filters.every((f) => f(r)));
      if (isDelete && this.canDelete) for (const r of rows) this.table(tableName).splice(this.table(tableName).indexOf(r), 1);
      const visible = isDelete && !this.canDelete ? [] : rows;
      const sorted = [...visible].sort((a, b) => a.id.localeCompare(b.id));
      const page = range ? sorted.slice(range[0], range[1] + 1) : sorted;
      return page.map((r) => ({ ...r, data: structuredClone(r.data), name: r.data.name, updatedAt: r.data.updatedAt }));
    };
    const builder = {
      select: () => builder,
      delete: () => ((isDelete = true), builder),
      eq: (column: keyof Row, value: unknown) => (filters.push((r) => r[column] === value), builder),
      in: (column: keyof Row, values: unknown[]) => (filters.push((r) => values.includes(r[column])), builder),
      order: () => builder,
      range: (from: number, to: number) => ((range = [from, to]), builder),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: run(), error: null }),
    };
    return builder;
  }

  private async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args: structuredClone(args) });
    if (name === "search_assets") return { data: this.searchRows, error: null };
    const forced = this.forcedStatuses.shift();
    const rows = args.p_rows as SaveRow[];
    const data = rows.map((row, i) => (forced?.[i] && forced[i] !== "ok" ? { id: row.id, rev: null, updated_at: null, status: forced[i] } : this.save(name, row)));
    return { data, error: null };
  }

  private save(name: string, row: SaveRow) {
    const table = name === "save_projects" ? this.projects : this.assets;
    const existing = table.find((r) => r.id === row.id);
    const updated_at = new Date().toISOString();
    if (row.rev === null) {
      if (existing) return { id: row.id, rev: null, updated_at: null, status: "conflict" };
      table.push({ id: row.id, project_id: row.project_id, collection: row.collection, data: row.data, updated_at, rev: 1 });
      return { id: row.id, rev: 1, updated_at, status: "ok" };
    }
    if (!existing) return { id: row.id, rev: null, updated_at: null, status: "missing" };
    if (existing.rev !== row.rev) return { id: row.id, rev: existing.rev, updated_at: existing.updated_at, status: "conflict" };
    Object.assign(existing, { data: row.data, updated_at, rev: existing.rev + 1 });
    return { id: row.id, rev: existing.rev, updated_at, status: "ok" };
  }

  addProject(data: Record<string, unknown>): void {
    this.projects.push({ id: String(data.id), data, updated_at: String(data.updatedAt), rev: 1 });
  }

  addAsset(projectId: string, collection: string, data: Record<string, unknown>): void {
    this.assets.push({ id: String(data.id), project_id: projectId, collection, data, updated_at: String(data.updatedAt ?? data.createdAt), rev: 1 });
  }
}
