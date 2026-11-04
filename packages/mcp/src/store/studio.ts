import type { SupabaseClient } from "@supabase/supabase-js";
import { addPersister, replaceCache, type ProjectCollection } from "@/lib/storage";
import { snapshotFromRows, type CloudRow } from "@/lib/sync/cloud";
import { ConflictError, createAwaitedPersister } from "./persister";
import { selectAssets, selectProject, selectProjects } from "./loader";

/** What one tool call needs in the cache. Without `projectId` only the project list is loaded. */
export interface Scope {
  projectId?: string;
  collections?: ProjectCollection[] | "all";
  /** Art/audio collections to load with their full bodies instead of names only. */
  fullBodies?: ProjectCollection[];
}

const ATTEMPTS = 3;

export class ProjectNotFound extends Error {
  constructor(projectId: string) {
    super(`No project with id ${projectId} in this account. Call list_projects to see the ids.`);
  }
}

/**
 * The headless studio: each call loads its scope into the app's own `storage` cache, runs the app's
 * functions on it, and (for writes) saves what changed before returning. The cache is one per
 * process, so calls run one at a time.
 */
export class Studio {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly client: SupabaseClient,
    /** Throws a clear "not signed in" error before anything is sent without a token. */
    private readonly ensureSignedIn: () => Promise<unknown>
  ) {}

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const guarded = async () => {
      await this.ensureSignedIn();
      return task();
    };
    const run = this.queue.then(guarded, guarded);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(scope: Scope): Promise<{ projects: CloudRow[]; full: CloudRow[]; light: CloudRow[] }> {
    const { projectId } = scope;
    if (!projectId) return { projects: await selectProjects(this.client), full: [], light: [] };
    const [project, rows] = await Promise.all([
      selectProject(this.client, projectId),
      selectAssets(this.client, projectId, scope.collections ?? [], scope.fullBodies),
    ]);
    if (!project) throw new ProjectNotFound(projectId);
    return { projects: [project], ...rows };
  }

  /** Loads `scope` and runs `read` on the cache. */
  read<T>(scope: Scope, read: () => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const { projects, full, light } = await this.load(scope);
      replaceCache(snapshotFromRows(projects, [...full, ...light]));
      return read();
    });
  }

  /**
   * Loads `scope`, runs `change` (app functions that edit the cache), and saves the changed rows with
   * compare-and-swap. If another writer got there first, everything is reloaded and `change` runs
   * again on the fresh data, up to three times. `change` must describe intent ("link A to B"), not
   * replay values it read earlier.
   */
  write<T>(scope: Scope, change: () => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      for (let attempt = 1; ; attempt++) {
        const { projects, full, light } = await this.load(scope);
        replaceCache(snapshotFromRows(projects, [...full, ...light]));
        const persister = createAwaitedPersister(this.client);
        persister.remember("projects", projects);
        persister.remember("assets", full);
        persister.remember("assets", light, true);
        const detach = addPersister(persister);
        try {
          const result = await change();
          await persister.flush();
          return result;
        } catch (error) {
          if (!(error instanceof ConflictError) || attempt >= ATTEMPTS) throw error;
        } finally {
          detach();
        }
      }
    });
  }
}
