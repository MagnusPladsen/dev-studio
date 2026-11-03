import { APP, type AppId } from "@/lib/app-config";
import { DEV_STUDIO_COPY } from "./dev-studio";
import { GAMEDEV_STUDIO_COPY } from "./gamedev-studio";
import type { AppCopy } from "./types";

/** The text of either app, for code that serves a project of another app than the one built (the MCP server). */
export function copyFor(app: AppId): AppCopy {
  return app === "dev-studio" ? DEV_STUDIO_COPY : GAMEDEV_STUDIO_COPY;
}

/** The text of the app being built. Per-app wording lives in `gamedev-studio.ts` and `dev-studio.ts`. */
export const COPY: AppCopy = copyFor(APP.id);

export type { AppCopy, HelpText, NoteTemplate, StoryEntryType } from "./types";
