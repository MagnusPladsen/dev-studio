import type { IssueType, StoryEntry } from "@/types";

export type StoryEntryType = StoryEntry["type"];

/** The words of one tool's help panel and first-visit tutorial. Icons for `canDo` live in `help-content.ts`. */
export interface HelpText {
  title: string;
  /** One sentence. */
  summary: string;
  /** 3-5 short bullets, most important first. */
  canDo: string[];
  /** 3-4 quick-start steps. */
  steps: string[];
  /** 2-4 tips, keyboard shortcuts where real. */
  tips: string[];
}

export interface NoteTemplate {
  key: string;
  label: string;
  title: string;
  content: string;
}

/**
 * Every piece of text that differs between GameDev Studio and Dev Studio.
 * Text that reads the same in both apps stays inline where it is used.
 */
export interface AppCopy {
  meta: {
    title: string;
    description: string;
    keywords: string[];
  };
  landing: {
    /** The "Have you tried the other studio?" card. */
    otherAppQuestion: string;
    otherAppPitch: string;
  };
  nav: {
    story: string;
  };
  assetKinds: {
    story: string;
  };
  projects: {
    intro: string;
    emptyHint: string;
    examplesHint: string;
    exportExtension: string;
    importTitle: string;
    importError: (fileName: string) => string;
  };
  dashboard: {
    storyDescription: string;
  };
  help: {
    assets: HelpText;
    board: HelpText;
    diagrams: HelpText;
    story: HelpText;
    notebook: HelpText;
    decisions: HelpText;
  };
  board: {
    issueTypes: Record<IssueType, string>;
    newIssuePlaceholder: string;
    sprintGoalPlaceholder: string;
    emptyTitle: string;
    emptyBody: string;
  };
  story: {
    entryTypes: Record<StoryEntryType, string>;
    templates: Partial<Record<StoryEntryType, string>>;
    graphEmptyTitle: string;
    graphEmptyBody: string;
  };
  notebook: {
    templates: NoteTemplate[];
    emptyBody: string;
    /** Tag next to a story entry in the [[ link suggestions. */
    storySuggestionLabel: string;
  };
  canvas: {
    /** Under the "Canvas" heading of the canvas list. */
    intro: string;
    emptyBody: string;
    /** Library and Add menu hint of the card that shows another project item. */
    assetCardHint: string;
    /** Starting card labels of the New canvas templates. */
    templates: {
      flowChart: { start: string; check: string; yes: string; no: string; end: string };
      architectureDescription: string;
      architecture: { front: string; client: string; mobile: string; back: string; api: string; worker: string; store: string; outside: string };
      moodboard: { look: string; refs: string; tone: string; todo: string[] };
    };
  };
  wikiLinks: {
    /** What a [[link]] to a story entry opens, as in "Open story entry “Pip”". */
    storyTarget: string;
  };
  claude: {
    /** First line of the "Use with Claude" dialog: what Claude can do with this app's projects. */
    pitch: string;
  };
}
