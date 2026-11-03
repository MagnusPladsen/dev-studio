import { isDevStudio } from "@/lib/app-config";
import { DEV_STUDIO_COPY } from "./dev-studio";
import { GAMEDEV_STUDIO_COPY } from "./gamedev-studio";
import type { AppCopy } from "./types";

/** The text of the app being built. Per-app wording lives in `gamedev-studio.ts` and `dev-studio.ts`. */
export const COPY: AppCopy = isDevStudio ? DEV_STUDIO_COPY : GAMEDEV_STUDIO_COPY;

export type { AppCopy, HelpText, NoteTemplate, StoryEntryType } from "./types";
