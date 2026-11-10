import { useSyncExternalStore } from "react";
import { getSharedProjects, subscribeShared, type SharedProject } from "@/lib/sharing";

/** The membership behind a project someone else shared with the signed-in user; undefined for their own projects. */
export function useSharedProject(projectId: string): SharedProject | undefined {
  return useSyncExternalStore(
    subscribeShared,
    () => getSharedProjects().get(projectId),
    () => undefined
  );
}
