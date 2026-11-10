"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  addPersister,
  applyRemoteChanges,
  cacheKey,
  clearLocalData,
  createLocalPersister,
  getSnapshot,
  locateCached,
  localHasData,
  mergeIntoCache,
  readLocalSnapshot,
  replaceCache,
  PROJECT_COLLECTIONS,
  type ChangeEvent,
  type Persister,
} from "@/lib/storage";
import { getSupabase, supabaseEnabled } from "@/lib/supabase";
import { clearDeviceStorage, deleteOwnAccount } from "@/lib/account";
import { signInWithEmail, signInWithGitHub } from "@/lib/sign-in";
import { migrateAllElementAssetLinks } from "@/lib/diagrams/element-links";
import {
  createCloudPersister,
  createCloudReader,
  loadCloudSnapshot,
  loadProjectRows,
  snapshotFromRows,
  uploadSnapshot,
  type SyncStatus,
} from "@/lib/sync/cloud";
import { fetchSharedProjects, ownerOf, removeMember, roleIn, setSharedProjects, visibleOwners } from "@/lib/sharing";
import { connectRealtime, createRemoteSync, type RemoteSync } from "@/lib/sync/realtime";
import { listenToOtherTabs } from "@/lib/sync/tabs";
import {
  createFolderPersister,
  folderSupported,
  forgetFolder,
  pickFolder,
  readFolderSnapshot,
  recallFolder,
  rememberFolder,
  type FolderHandle,
} from "@/lib/sync/folder";

type FolderState = { state: "none" } | { state: "connected" | "needs-permission"; name: string };

interface SyncContextValue {
  ready: boolean;
  /** Bumps whenever the whole dataset is swapped (sign in/out, folder import) so editors reload. */
  generation: number;
  cloudAvailable: boolean;
  user: { id: string; email?: string } | null;
  status: SyncStatus;
  folder: FolderState;
  folderAvailable: boolean;
  signInWithEmail(email: string): Promise<string | null>;
  signInWithGitHub(): Promise<string | null>;
  signOut(): Promise<void>;
  connectFolder(): Promise<void>;
  reconnectFolder(): Promise<void>;
  disconnectFolder(): Promise<void>;
  /** Re-mount the open editor so it re-reads storage (after bulk changes like adding examples). */
  reloadView(): void;
  /** Waits until queued changes reached the cloud (sharing a project that was only just created). */
  flushSaves(): Promise<void>;
  /** Re-reads which projects are shared with the user and loads any new ones (after accepting an invite). */
  refreshShared(): Promise<void>;
  /** Leaves a project someone else shared with the user; it disappears from this device. Returns an error message, or null. */
  leaveProject(projectId: string): Promise<string | null>;
  /** Deletes the signed-in account with all its projects. Returns an error message, or null when done. */
  deleteAccount(): Promise<string | null>;
  /** Guests: removes every project and setting this app keeps in this browser, and forgets the local folder. */
  clearDeviceData(): Promise<void>;
}

function cachedIds(): { projects: string[]; assets: string[] } {
  const snapshot = getSnapshot();
  const projects = (snapshot.get(cacheKey("projects")) ?? []).map((p) => p.id);
  const assets = projects.flatMap((projectId) =>
    PROJECT_COLLECTIONS.flatMap((col) => (snapshot.get(cacheKey(col, projectId)) ?? []).map((i) => i.id))
  );
  return { projects, assets };
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside <SyncProvider>");
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [user, setUser] = useState<SyncContextValue["user"]>(null);
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });
  const [folder, setFolder] = useState<FolderState>({ state: "none" });
  const [folderAvailable, setFolderAvailable] = useState(false);

  const primary = useRef<{ persister: Persister & { flush?(): Promise<void> }; detach(): void } | null>(null);
  const folderRef = useRef<{ handle: FolderHandle; detach(): void } | null>(null);
  const userIdRef = useRef<string | null>(null);
  const switching = useRef<Promise<void>>(Promise.resolve());
  /** Stops listening for changes from other tabs or devices. */
  const stopLive = useRef<() => void>(() => {});
  /** Signed in: re-reads shared projects, loads new ones and re-subscribes when their owners change. */
  const refreshSharedRef = useRef<() => Promise<void>>(async () => {});

  const reportError = useCallback((message: string) => setStatus({ state: "error", message }), []);

  /** Changes from elsewhere go into the cache; only a deleted project re-mounts the editors. */
  const applyRemote = useCallback((changes: ChangeEvent[], dropProject?: (projectId: string) => void) => {
    for (const change of changes) if (change.op === "deleteProject") dropProject?.(change.projectId);
    const applied = applyRemoteChanges(changes);
    if (applied.some((c) => c.op === "deleteProject")) setGeneration((g) => g + 1);
  }, []);

  const goLive = useCallback((stop: () => void) => {
    stopLive.current();
    stopLive.current = stop;
  }, []);

  const usePrimary = useCallback((persister: Persister & { flush?(): Promise<void> }) => {
    primary.current?.detach();
    primary.current = { persister, detach: addPersister(persister) };
  }, []);

  const enterLocal = useCallback(() => {
    userIdRef.current = null;
    setUser(null);
    setSharedProjects([]);
    refreshSharedRef.current = async () => {};
    replaceCache(readLocalSnapshot());
    usePrimary(createLocalPersister(reportError));
    goLive(listenToOtherTabs(getSnapshot, (changes) => applyRemote(changes)));
    setStatus({ state: "idle" });
  }, [applyRemote, goLive, reportError, usePrimary]);

  const attachFolder = useCallback(
    async (handle: FolderHandle) => {
      folderRef.current?.detach();
      const fromDisk = await readFolderSnapshot(handle);
      const changes = mergeIntoCache(fromDisk);
      for (const change of changes) primary.current?.persister.onChange(change, getSnapshot());
      const persister = createFolderPersister(handle, reportError);
      folderRef.current = { handle, detach: addPersister(persister) };
      await persister.writeAll(getSnapshot());
      setFolder({ state: "connected", name: handle.name });
      if (changes.length) setGeneration((g) => g + 1);
    },
    [reportError]
  );

  const enterCloud = useCallback(
    async (u: User) => {
      const supabase = getSupabase()!;
      userIdRef.current = u.id;
      goLive(() => {});
      let loaded: Awaited<ReturnType<typeof loadCloudSnapshot>>;
      try {
        if (localHasData()) {
          setStatus({ state: "saving", message: "Moving your local projects into your account…" });
          await uploadSnapshot(supabase, u.id, readLocalSnapshot());
          clearLocalData();
        }
        setStatus({ state: "saving", message: "Loading your projects…" });
        // before the sharing migration is live there is nothing shared, and that is fine
        setSharedProjects(await fetchSharedProjects(supabase).catch(() => []));
        loaded = await loadCloudSnapshot(supabase);
        replaceCache(loaded.snapshot);
      } catch (err) {
        userIdRef.current = null;
        enterLocal();
        reportError(`Could not reach your account: ${(err as Error).message}. Working locally for now.`);
        return;
      }
      setUser({ id: u.id, email: u.email });
      let live: RemoteSync | null = null;
      const persister = createCloudPersister(
        supabase,
        u.id,
        setStatus,
        (rows) => {
          live?.written(rows).catch(() => {});
        },
        (changes) => applyRemote(changes, persister.dropProject),
        { canWrite: (projectId) => roleIn(projectId) !== "viewer", ownerOf: (projectId) => ownerOf(projectId, u.id) }
      );
      persister.remember("projects", loaded.rows.projects);
      persister.remember("assets", loaded.rows.assets);
      usePrimary(persister);
      live = createRemoteSync({
        userId: u.id,
        reader: createCloudReader(supabase),
        cursor: loaded.cursor,
        onServerRow: (table, kind, row) => (kind === "delete" ? persister.forget(table, row.id) : persister.remember(table, [row])),
        apply: (changes) => applyRemote(changes, persister.dropProject),
        isBusy: persister.isBusy,
        locate: locateCached,
        cachedIds,
        owners: () => visibleOwners(u.id),
        beforeCatchUp: () => refreshSharedRef.current(),
      });
      const sync = live;
      let listeningTo = "";
      const listen = () => {
        const owners = visibleOwners(u.id);
        if (owners.join() === listeningTo) return;
        listeningTo = owners.join();
        goLive(connectRealtime(supabase, sync, u.id, owners, reportError));
      };
      refreshSharedRef.current = async () => {
        const added = setSharedProjects(await fetchSharedProjects(supabase));
        const cached = new Set(cachedIds().projects);
        for (const projectId of added.filter((id) => !cached.has(id))) {
          const rows = await loadProjectRows(supabase, projectId);
          persister.remember("projects", rows.projects);
          persister.remember("assets", rows.assets);
          mergeIntoCache(snapshotFromRows(rows.projects, rows.assets));
        }
        if (added.length) setGeneration((g) => g + 1);
        listen();
      };
      listen();
      setStatus({ state: "saved" });
      if (folderRef.current) await attachFolder(folderRef.current.handle).catch(() => {});
    },
    [applyRemote, attachFolder, enterLocal, goLive, reportError, usePrimary]
  );

  // ── startup ──
  useEffect(() => {
    let cancelled = false;
    setFolderAvailable(folderSupported());
    const supabase = getSupabase();

    (async () => {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      if (cancelled) return;
      if (session) await enterCloud(session.user);
      else enterLocal();

      const handle = folderSupported() ? await recallFolder() : undefined;
      if (handle && !cancelled) {
        const perm = await handle.queryPermission({ mode: "readwrite" }).catch(() => "denied" as const);
        if (perm === "granted") await attachFolder(handle).catch((e: Error) => reportError(e.message));
        else setFolder({ state: "needs-permission", name: handle.name });
      }
      if (cancelled) return;
      // Canvas elements once carried a one-way `data.asset` link; make those real links before any tool reads them.
      migrateAllElementAssetLinks();
      setReady(true);
    })();

    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      // supabase-js advises against awaiting other auth calls inside this callback
      setTimeout(() => {
        if (event === "SIGNED_IN" && session && userIdRef.current !== session.user.id) {
          switching.current = switching.current.then(async () => {
            await enterCloud(session.user);
            setGeneration((g) => g + 1);
          });
        } else if (event === "SIGNED_OUT" && userIdRef.current) {
          switching.current = switching.current.then(() => {
            folderRef.current?.detach();
            if (folderRef.current) setFolder({ state: "needs-permission", name: folderRef.current.handle.name });
            folderRef.current = null;
            enterLocal();
            setGeneration((g) => g + 1);
          });
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
      stopLive.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // warn before closing the tab with unsaved cloud changes
  useEffect(() => {
    if (status.state !== "saving") return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [status.state]);

  const value = useMemo<SyncContextValue>(
    () => ({
      ready,
      generation,
      cloudAvailable: supabaseEnabled,
      user,
      status,
      folder,
      folderAvailable,
      signInWithEmail,
      signInWithGitHub,
      async signOut() {
        await primary.current?.persister.flush?.();
        await getSupabase()?.auth.signOut();
      },
      async connectFolder() {
        try {
          const handle = await pickFolder();
          await rememberFolder(handle);
          await attachFolder(handle);
        } catch (err) {
          if ((err as Error).name !== "AbortError") reportError((err as Error).message);
        }
      },
      async reconnectFolder() {
        const handle = folderRef.current?.handle ?? (await recallFolder());
        if (!handle) return;
        const perm = await handle.requestPermission({ mode: "readwrite" });
        if (perm === "granted") await attachFolder(handle).catch((e: Error) => reportError(e.message));
      },
      reloadView() {
        setGeneration((g) => g + 1);
      },
      refreshShared: () => refreshSharedRef.current(),
      async flushSaves() {
        await primary.current?.persister.flush?.();
      },
      async leaveProject(projectId) {
        const supabase = getSupabase();
        const userId = userIdRef.current;
        if (!supabase || !userId) return "You are not signed in.";
        try {
          await removeMember(supabase, ownerOf(projectId, userId), projectId, userId);
        } catch (err) {
          return (err as Error).message;
        }
        applyRemote([{ op: "deleteProject", projectId }]);
        await refreshSharedRef.current().catch(() => {});
        return null;
      },
      async disconnectFolder() {
        folderRef.current?.detach();
        folderRef.current = null;
        await forgetFolder();
        setFolder({ state: "none" });
      },
      async deleteAccount() {
        const supabase = getSupabase();
        if (!supabase || !userIdRef.current) return "You are not signed in.";
        await primary.current?.persister.flush?.();
        // the deletes that follow must not reach a connected folder through live updates
        goLive(() => {});
        folderRef.current?.detach();
        const error = await deleteOwnAccount(supabase);
        if (!error) return null;
        const { data } = await supabase.auth.getUser();
        if (data.user) await enterCloud(data.user);
        return error;
      },
      async clearDeviceData() {
        folderRef.current?.detach();
        folderRef.current = null;
        await forgetFolder();
        setFolder({ state: "none" });
        clearDeviceStorage(localStorage);
        replaceCache(new Map());
        setGeneration((g) => g + 1);
      },
    }),
    [ready, generation, user, status, folder, folderAvailable, applyRemote, attachFolder, enterCloud, goLive, reportError]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
