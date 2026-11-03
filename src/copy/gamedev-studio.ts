import { MENU_TIP, UNDO_TIP } from "./shared";
import type { AppCopy } from "./types";

const EXPORT_EXTENSION = ".gamedev.json";

export const GAMEDEV_STUDIO_COPY = {
  meta: {
    title: "GameDev Studio (Beta) - Free Open Source Game Development Toolkit",
    description:
      "Create pixel art, music, sound effects, tilemaps, dialogue trees, and plan your game — all in one free, open source app. No watermarks. No paywalls.",
    keywords: [
      "game development",
      "pixel art",
      "sprite editor",
      "game music",
      "sound effects",
      "tilemap editor",
      "dialogue tree",
      "open source",
      "free",
      "indie game dev",
    ],
  },
  landing: {
    otherAppQuestion: "Planning something that isn't a game?",
    otherAppPitch:
      "Dev Studio is the Task Board, Canvas, Wiki, Notebook and Decision log on their own, made for any software project. Same account, same free tools.",
  },
  nav: {
    story: "Story",
  },
  assetKinds: {
    story: "Story",
  },
  projects: {
    intro: "Each project keeps its assets separate. Create one per game.",
    emptyHint: "Create a project to start building your game",
    examplesHint: "A small sample game (Pip's Quest) across every tool. Remove it any time.",
    exportExtension: EXPORT_EXTENSION,
    importTitle: `Open a project file you exported earlier (${EXPORT_EXTENSION})`,
    importError: (fileName: string) => `"${fileName}" isn't a GameDev Studio project file. Use a ${EXPORT_EXTENSION} file made with Export.`,
  },
  dashboard: {
    storyDescription: "Lore, characters and places",
  },
  help: {
    assets: {
      title: "Project dashboard",
      summary: "Your project's home: open any tool and see everything you've made.",
      canDo: [
        "Open any of the tools from the cards at the top.",
        "See every asset in the project, newest first, with its links.",
        "Search by name or filter by type.",
        "Add or remove the example assets for the whole project.",
        "Export the whole project as one JSON file.",
      ],
      steps: [
        "Pick a tool card, for example Pixel Art.",
        "Make something there. It saves by itself.",
        "Come back here to find it in the list below.",
        "Click a name to open it, or a linked chip to jump to that asset.",
      ],
      tips: [
        "Not sure where to start? Press Add examples and explore them.",
        "Right-click (or long-press) a row to rename, duplicate, link or delete it.",
        "Export project gives a backup you can import again from Projects.",
      ],
    },
    board: {
      title: "Task Board",
      summary: "Plan your game's work with issues, columns and sprints.",
      canDo: [
        "Track tasks and bugs as issues with type, priority, points and labels.",
        "Drag issues between columns, or use the Move to… menu.",
        "Plan sprints in Backlog, then start and complete them.",
        "Search and filter everything in All issues, archived ones too.",
        "Add notes to an issue; they live in the Notebook.",
      ],
      steps: [
        "Press Create issue and give it a title.",
        "Drag the card across the columns as work moves on.",
        "Click a card to edit its details, links and notes.",
        "Archive done issues to keep the board tidy.",
      ],
      tips: ["Press C to create an issue.", "Rename or add columns to fit how you work.", UNDO_TIP, "Export the board as CSV or JSON."],
    },
    diagrams: {
      title: "Canvas",
      summary: "A free-form board for moodboards, story flow, level plans, sketches and references.",
      canDo: [
        "Add notes, to-do lists, images, links, groups and any project asset as cards.",
        "Draw rectangles, ellipses, diamonds and flow-chart shapes, and sketch with the pen.",
        "Connect cards and shapes with arrows to show flow.",
        "Select many cards at once to move, recolour, duplicate, align or distribute them.",
        "Play YouTube, Spotify, Vimeo and SoundCloud links right on the board.",
      ],
      steps: [
        "Add a card or shape from Add, or paste and drop pictures and links in.",
        "Pick the pen tool to sketch; Esc goes back to selecting.",
        "Use the Connect tool, or drag a selected card's dot onto another card.",
        "Shift+drag (or the box-select tool on touch) around cards to select several.",
      ],
      tips: [
        "Drag empty space to pan; scroll or pinch to zoom. Shift+click adds or removes a card.",
        "Ctrl/⌘+C, Ctrl/⌘+V and Ctrl/⌘+D copy, paste and duplicate cards, lines included.",
        "Double-click a card or line to edit it. Delete removes the selection; Ctrl/⌘+Z undoes.",
        "Export the board as PNG, SVG or JSON.",
      ],
    },
    story: {
      title: "Story",
      summary: "Write your game's lore: characters, places, items, quests and events.",
      canDo: [
        "Write entries in Markdown, sorted by type and tags.",
        "Link entries with [[double brackets]]; hover a link for a summary.",
        "See which entries mention this one.",
        "View how everything connects in the graph.",
      ],
      steps: [
        "Press New entry, pick a type and give it a title.",
        "Write about it. Types like Character start from a template.",
        "Type [[ to link another entry.",
        "Open the graph button to see your world's connections.",
      ],
      tips: ["Click a [[link]] to an entry that doesn't exist yet to create it.", UNDO_TIP, MENU_TIP],
    },
    notebook: {
      title: "Notebook",
      summary: "Keep ideas, to-do lists, design notes and playtest feedback.",
      canDo: [
        "Write notes in Markdown, with headings, lists and code.",
        "Tick off checklists and see progress at a glance.",
        "Sort notes into folders, add tags and pin the important ones.",
        "Link to other notes and story entries with [[double brackets]].",
        "Start from templates like a to-do list or game design doc.",
      ],
      steps: [
        "Press New note, or pick a template from the arrow next to it.",
        "Give it a title and start writing.",
        "Type - [ ] to make a checklist item.",
        "Switch to Preview to read it and tick items off.",
      ],
      tips: ["Type [[ to search notes and story entries to link.", UNDO_TIP, MENU_TIP],
    },
    decisions: {
      title: "Decision log",
      summary: "Record why your game works the way it does, one decision at a time.",
      canDo: [
        "Number every decision (ADR-001, ADR-002…) with a status and a date.",
        "Write the context, options, decision and consequences in Markdown.",
        "Supersede a decision: the new one links back to the one it replaces.",
        "Link decisions to issues, story entries, notes and canvases.",
        "Export one decision or the whole log as Markdown, or everything as JSON.",
      ],
      steps: [
        "Press New decision and give it a title.",
        "Fill in the context and the options you looked at.",
        "Write the decision, then set its status to Accepted.",
        "When it changes later, press Supersede to write the new one.",
      ],
      tips: [
        "Filter the list by status, or search across every field and tag.",
        "Write [[Title]] in a field to link a note or story entry.",
        UNDO_TIP,
        MENU_TIP,
      ],
    },
  },
  board: {
    issueTypes: {
      feature: "Feature",
      bug: "Bug",
      task: "Task",
      art: "Art",
      audio: "Audio",
      design: "Design",
      writing: "Writing",
      chore: "Chore",
      docs: "Docs",
    },
    newIssuePlaceholder: "e.g. Add wall jump",
    sprintGoalPlaceholder: "Sprint goal, e.g. First playable level",
    emptyTitle: "Plan your game, one issue at a time",
    emptyBody:
      "Issues move from To Do to In Progress, Testing and Done. Group them into sprints of a week or two, and link each issue to the sprites, sounds and story it’s about. Finished issues are archived but stay searchable.",
  },
  story: {
    entryTypes: {
      character: "Character",
      location: "Location",
      item: "Item",
      event: "Event",
      lore: "Lore",
      quest: "Quest",
      note: "Other",
    },
    templates: {
      character: "## Appearance\n\n## Personality\n\n## Backstory\n\n## Relationships\n",
      location: "## Description\n\n## Inhabitants\n\n## Points of Interest\n",
      item: "## Description\n\n## Properties\n\n## Where to Find\n",
      quest: "## Objective\n\n## Giver\n\n## Steps\n- \n\n## Reward\n",
    },
    graphEmptyTitle: "No story entries yet.",
    graphEmptyBody: "Create entries and link them with [[wiki links]] or linked assets to see how your world connects.",
  },
  notebook: {
    templates: [
      { key: "blank", label: "Blank", title: "Untitled note", content: "" },
      { key: "todo", label: "To-do list", title: "To-do", content: "- [ ] First task\n- [ ] Second task\n- [ ] Third task\n" },
      {
        key: "gdd",
        label: "Game design doc",
        title: "Game design doc",
        content:
          "## Pitch\nOne or two sentences: what is the game and why is it fun?\n\n## Core loop\nWhat does the player do again and again?\n\n## Controls\n- Move:\n- Action:\n\n## Art style\n\n## Audio\n\n## Scope\n- [ ] Must have:\n- [ ] Nice to have:\n",
      },
      {
        key: "bugs",
        label: "Bug list",
        title: "Bug list",
        content: "## Open\n- [ ] What happens, and the steps to make it happen\n\n## Fixed\n- [x] Example: player could jump through ceilings\n",
      },
      {
        key: "playtest",
        label: "Playtest notes",
        title: "Playtest notes",
        content: "**Date:** \n**Tester:** \n**Build:** \n\n## What worked\n- \n\n## What was confusing\n- \n\n## Ideas to try\n- [ ] \n",
      },
    ],
    emptyBody: "Keep ideas, to-do lists, design notes and playtest feedback here. Link notes to sprites, sounds and story entries.",
    storySuggestionLabel: "Story",
  },
  wikiLinks: {
    storyTarget: "story entry",
  },
} satisfies AppCopy;
