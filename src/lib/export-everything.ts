import { BUNDLE_FORMAT, storage } from "./storage";
import type { AppId } from "./app-config";
import { downloadBlob } from "./download";

/** Every project in storage (both apps', local, cloud or folder alike) with all its assets and links, as one file. */
export function buildEverythingExport(exportedAt: Date = new Date()): string {
  const projects = storage.getAll("projects").map((project) => storage.exportProjectData(project.id));
  return JSON.stringify({ format: BUNDLE_FORMAT, version: 1, exportedAt: exportedAt.toISOString(), projects }, null, 2);
}

/** `gamedev-studio-export-2026-11-03.json`, dated in the visitor's own time zone. */
export function everythingFileName(appId: AppId, date: Date = new Date()): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  return `${appId}-export-${day}.json`;
}

/** Saves every project as one file the projects list can import again. */
export function downloadEverything(appId: AppId): void {
  downloadBlob(everythingFileName(appId), new Blob([buildEverythingExport()], { type: "application/json" }));
}
