import type { Project } from "@/types";
import { HELP, type HelpTopic } from "./help-content";
import { storage } from "./storage";

export const TUTORIALS_SEEN_KEY = "gds-tutorials-seen";

type SeenStore = Pick<Storage, "getItem" | "setItem">;
type SeenByProject = Record<string, string[]>;

function browserStore(): SeenStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readAll(store: SeenStore | null): SeenByProject {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(TUTORIALS_SEEN_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SeenByProject) : {};
  } catch {
    return {};
  }
}

/** Tools whose tutorial the user has already dismissed in this project. */
export function getSeenTutorials(projectId: string, store: SeenStore | null = browserStore()): string[] {
  const seen = readAll(store)[projectId];
  return Array.isArray(seen) ? seen : [];
}

export function markTutorialSeen(projectId: string, topic: HelpTopic, store: SeenStore | null = browserStore()): void {
  const all = readAll(store);
  const seen = new Set(Array.isArray(all[projectId]) ? all[projectId] : []);
  seen.add(topic);
  try {
    store?.setItem(TUTORIALS_SEEN_KEY, JSON.stringify({ ...all, [projectId]: [...seen] }));
  } catch {
    // Storage full or blocked: the tutorial just shows again next time.
  }
}

/** The help topic for a project page such as `/project/abc/pixel-art`, or null outside a tool. */
export function tutorialTopicForPath(pathname: string, projectId: string): HelpTopic | null {
  const prefix = `/project/${projectId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length).split("/")[0];
  return Object.hasOwn(HELP, segment) ? (segment as HelpTopic) : null;
}

export interface TutorialDecision {
  isEnabled: boolean;
  topic: HelpTopic | null;
  seen: readonly string[];
  isOtherDialogOpen: boolean;
}

export function shouldShowTutorial({ isEnabled, topic, seen, isOtherDialogOpen }: TutorialDecision): boolean {
  return isEnabled && topic !== null && !seen.includes(topic) && !isOtherDialogOpen;
}

/** Older projects have no flag, which means tutorials stay off for them. */
export function areTutorialsOn(project: Pick<Project, "showTutorials"> | undefined): boolean {
  return project?.showTutorials === true;
}

export function setProjectTutorials(projectId: string, isOn: boolean): void {
  const project = storage.getById("projects", projectId);
  if (!project) return;
  storage.save("projects", { ...project, showTutorials: isOn, updatedAt: new Date().toISOString() });
}
