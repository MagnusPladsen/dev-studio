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
import { migrateAllElementAssetLinks } from "@/lib/diagrams/element-links";
import { createCloudPersister, createCloudReader, loadCloudSnapshot, uploadSnapshot, type SyncStatus } from "@/lib/sync/cloud";
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
      let cursor: string | null = null;
      try {
        if (localHasData()) {
          setStatus({ state: "saving", message: "Moving your local projects into your account…" });
          await uploadSnapshot(supabase, u.id, readLocalSnapshot());
          clearLocalData();
        }
        setStatus({ state: "saving", message: "Loading your projects…" });
        const loaded = await loadCloudSnapshot(supabase);
        replaceCache(loaded.snapshot);
        cursor = loaded.cursor;
      } catch (err) {
        userIdRef.current = null;
        enterLocal();
        reportError(`Could not reach your account: ${(err as Error).message}. Working locally for now.`);
        return;
      }
      setUser({ id: u.id, email: u.email });
      let live: RemoteSync | null = null;
      const persister = createCloudPersister(supabase, u.id, setStatus, (rows) => {
        live?.written(rows).catch(() => {});
      });
      usePrimary(persister);
      live = createRemoteSync({
        userId: u.id,
        reader: createCloudReader(supabase),
        cursor,
        apply: (changes) => applyRemote(changes, persister.dropProject),
        isBusy: persister.isBusy,
        locate: locateCached,
        cachedIds,
      });
      goLive(connectRealtime(supabase, live, u.id, reportError));
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
      async signInWithEmail(email) {
        const supabase = getSupabase();
        if (!supabase) return "Cloud sync is not configured on this server.";
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        return error?.message ?? null;
      },
      async signInWithGitHub() {
        const supabase = getSupabase();
        if (!supabase) return "Cloud sync is not configured on this server.";
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        return error?.message ?? null;
      },
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
      async disconnectFolder() {
        folderRef.current?.detach();
        folderRef.current = null;
        await forgetFolder();
        setFolder({ state: "none" });
      },
    }),
    [ready, generation, user, status, folder, folderAvailable, attachFolder, reportError]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
