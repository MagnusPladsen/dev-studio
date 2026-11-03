import type { AssetType, Project } from "@/types";

/**
 * One codebase, two apps. `NEXT_PUBLIC_APP=dev-studio` builds Dev Studio (the planning tools only);
 * anything else builds GameDev Studio. Set it per Vercel project.
 */
export type AppId = "gamedev-studio" | "dev-studio";

export interface AppConfig {
  id: AppId;
  name: string;
  initials: string;
  url: string;
  /** Brand colour for the logo, favicon and primary buttons outside the tools. */
  accent: string;
  accentHover: string;
  /** What a project is about, as in "Plan your game". */
  subject: string;
  assetTypes: AssetType[];
}

const GAMEDEV_STUDIO: AppConfig = {
  id: "gamedev-studio",
  name: "GameDev Studio",
  initials: "GD",
  url: "https://gamedev-studio.pladsen.dev",
  accent: "#7c5cfc",
  accentHover: "#6a4ae0",
  subject: "game",
  assetTypes: ["sprite", "sound", "music", "tilemap", "diagram", "story", "dialogue", "palette", "spritesheet", "note", "issue", "model", "decision"],
};

const DEV_STUDIO: AppConfig = {
  id: "dev-studio",
  name: "Dev Studio",
  initials: "DS",
  url: "https://dev-studio.pladsen.dev",
  accent: "#0d9488",
  accentHover: "#0f766e",
  subject: "project",
  assetTypes: ["issue", "diagram", "story", "note", "decision"],
};

export function appConfigFor(flag: string | undefined): AppConfig {
  return flag === "dev-studio" ? DEV_STUDIO : GAMEDEV_STUDIO;
}

export const APP = appConfigFor(process.env.NEXT_PUBLIC_APP);

export const isDevStudio = APP.id === "dev-studio";

export const OTHER_APP = appConfigFor(isDevStudio ? undefined : "dev-studio");

/** Projects made before the split have no `app`, and belong to GameDev Studio. */
export function belongsToApp(project: Pick<Project, "app">, app: AppId = APP.id): boolean {
  return (project.app ?? "gamedev-studio") === app;
}
