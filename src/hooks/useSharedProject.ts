import { useSyncExternalStore } from "react";
import { getOwnedShares, getSharedProjects, subscribeShared, type SharedProject } from "@/lib/sharing";

const noShares = new Map<string, never>();

/** The membership behind a project someone else shared with the signed-in user; undefined for their own projects. */
export function useSharedProject(projectId: string): SharedProject | undefined {
  return useSyncExternalStore(
    subscribeShared,
    () => getSharedProjects().get(projectId),
    () => undefined
  );
}

/** Every project other people shared with the signed-in user, by project id. */
export function useSharedProjects(): Map<string, SharedProject> {
  return useSyncExternalStore(subscribeShared, getSharedProjects, () => noShares);
}

/** How many people the signed-in user shared each of their own projects with, by project id. */
export function useOwnedShares(): Map<string, number> {
  return useSyncExternalStore(subscribeShared, getOwnedShares, () => noShares);
}
