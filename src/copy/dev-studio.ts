import { MENU_TIP, UNDO_TIP } from "./shared";
import type { AppCopy } from "./types";

const EXPORT_EXTENSION = ".devstudio.json";

export const DEV_STUDIO_COPY = {
  meta: {
    title: "Dev Studio (Beta) - Free Open Source Project Planning Toolkit",
    description:
      "Plan software projects with a task board, a canvas for diagrams and moodboards, a linked wiki, a notebook and a decision log — all connected in one free, open source app. No sign-up needed.",
    keywords: ["task board", "kanban", "sprint planning", "whiteboard", "diagrams", "wiki", "notes", "decision log", "ADR", "open source", "free"],
  },
  landing: {
    otherAppQuestion: "Making a game?",
    otherAppPitch:
      "GameDev Studio has these planning tools plus pixel art, 3D pixel art, music, sound effects, tilemaps and dialogue trees, all linked together.",
  },
  nav: {
    story: "Wiki",
  },
  assetKinds: {
    story: "Wiki page",
  },
  projects: {
    intro: "Each project keeps its issues, docs and notes separate. Create one per product or codebase.",
    emptyHint: "Create a project to start planning your work",
    examplesHint: "A small sample software project (Tidepool, a habit app) across every tool. Remove it any time.",
    exportExtension: EXPORT_EXTENSION,
    importTitle: `Open a project file you exported earlier (${EXPORT_EXTENSION})`,
    importError: (fileName: string) => `"${fileName}" isn't a Dev Studio project file. Use a ${EXPORT_EXTENSION} file made with Export.`,
  },
  dashboard: {
    storyDescription: "Linked docs about your project",
  },
  help: {
    assets: {
      title: "Project dashboard",
      summary: "Your project's home: open any tool and see everything you've made.",
      canDo: [
        "Open any of the tools from the cards at the top.",
        "See every issue, page, note and decision in the project, newest first, with its links.",
        "Search by name or filter by type.",
        "Add or remove the examples for the whole project.",
        "Export the whole project as one JSON file.",
      ],
      steps: [
        "Pick a tool card, for example Task Board.",
        "Make something there. It saves by itself.",
        "Come back here to find it in the list below.",
        "Click a name to open it, or a linked chip to jump to it.",
      ],
      tips: [
        "Not sure where to start? Press Add examples and explore them.",
        "Right-click (or long-press) a row to rename, duplicate, link or delete it.",
        "Export project gives a backup you can import again from Projects.",
      ],
    },
    board: {
      title: "Task Board",
      summary: "Plan your project's work with issues, columns and sprints.",
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
      summary: "A free-form board for architecture sketches, flow charts, plans, moodboards and references.",
      canDo: [
        "Add notes, to-do lists, images, links, groups and any project item as cards.",
        "Draw rectangles, ellipses, diamonds and flow-chart shapes, and sketch with the pen.",
        "Connect cards and shapes with arrows to show flow.",
        "Select many cards at once to move, recolour, duplicate, align or distribute them.",
        "Play YouTube, Spotify, Vimeo and SoundCloud links right on the board.",
      ],
      steps: [
        "Start from a template, then add cards and shapes from the Shapes panel (click, or drag onto the board) or Add.",
        "Pick the pen tool to sketch; Esc goes back to selecting.",
        "Use the Connect tool, or drag a selected card's dot onto another card.",
        "Shift+drag (or the box-select tool on touch) around cards to select several.",
      ],
      tips: [
        "Drag empty space to pan; scroll or pinch to zoom. Shift+click adds or removes a card.",
        "Ctrl/⌘+C, Ctrl/⌘+V and Ctrl/⌘+D copy, paste and duplicate cards, lines included.",
        "Double-click a card or line to edit it. Delete removes the selection; Ctrl/⌘+Z undoes.",
        "Press / on the board to search for a shape and drop it where the pointer is.",
        "Database tables: double-click to edit columns, then drag a row's dot onto a row of another table. Select the line to switch n–1, 1–1, 1–n and n–n.",
        "Export the board as PNG, SVG or JSON.",
      ],
    },
    story: {
      title: "Wiki",
      summary: "Document your project: people, systems, components, goals and decisions, all linked.",
      canDo: [
        "Write pages in Markdown, sorted by type and tags.",
        "Link pages with [[double brackets]]; hover a link for a summary.",
        "See which pages mention this one.",
        "View how everything connects in the graph.",
      ],
      steps: [
        "Press New entry, pick a type and give it a title.",
        "Write about it. Types like Person start from a template.",
        "Type [[ to link another page.",
        "Open the graph button to see your project's connections.",
      ],
      tips: ["Click a [[link]] to a page that doesn't exist yet to create it.", UNDO_TIP, MENU_TIP],
    },
    notebook: {
      title: "Notebook",
      summary: "Keep ideas, to-do lists, meeting notes and specs.",
      canDo: [
        "Write notes in Markdown, with headings, lists and code.",
        "Tick off checklists and see progress at a glance.",
        "Sort notes into folders, add tags and pin the important ones.",
        "Link to other notes and wiki pages with [[double brackets]].",
        "Start from templates like a to-do list or meeting notes.",
      ],
      steps: [
        "Press New note, or pick a template from the arrow next to it.",
        "Give it a title and start writing.",
        "Type - [ ] to make a checklist item.",
        "Switch to Preview to read it and tick items off.",
      ],
      tips: ["Type [[ to search notes and wiki pages to link.", UNDO_TIP, MENU_TIP],
    },
    decisions: {
      title: "Decision log",
      summary: "Record why the project is built the way it is, one decision at a time.",
      canDo: [
        "Number every decision (ADR-001, ADR-002…) with a status and a date.",
        "Write the context, options, decision and consequences in Markdown.",
        "Supersede a decision: the new one links back to the one it replaces.",
        "Link decisions to issues, wiki pages, notes and canvases.",
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
        "Write [[Title]] in a field to link a note or wiki page.",
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
    newIssuePlaceholder: "e.g. Add password reset",
    sprintGoalPlaceholder: "Sprint goal, e.g. First public beta",
    emptyTitle: "Plan your project, one issue at a time",
    emptyBody:
      "Issues move from To Do to In Progress, Testing and Done. Group them into sprints of a week or two, and link each issue to the wiki pages, notes and decisions it’s about. Finished issues are archived but stay searchable.",
  },
  story: {
    entryTypes: {
      character: "Person",
      location: "System",
      item: "Component",
      event: "Event",
      lore: "Reference",
      quest: "Goal",
      note: "Other",
    },
    templates: {
      character: "## Role\n\n## Owns\n\n## Contact\n",
      location: "## Purpose\n\n## Parts\n\n## Owners\n",
      item: "## What it does\n\n## Interfaces\n\n## Depends on\n",
      quest: "## Objective\n\n## Owner\n\n## Steps\n- \n\n## Done when\n",
    },
    graphEmptyTitle: "No wiki pages yet.",
    graphEmptyBody: "Create pages and link them with [[wiki links]] or linked items to see how your project connects.",
  },
  notebook: {
    templates: [
      { key: "blank", label: "Blank", title: "Untitled note", content: "" },
      { key: "todo", label: "To-do list", title: "To-do", content: "- [ ] First task\n- [ ] Second task\n- [ ] Third task\n" },
      {
        key: "spec",
        label: "Feature spec",
        title: "Feature spec",
        content: "## Problem\nWho has it, and why does it matter?\n\n## Proposal\n\n## Out of scope\n- \n\n## Open questions\n- [ ] \n",
      },
      {
        key: "bugs",
        label: "Bug list",
        title: "Bug list",
        content: "## Open\n- [ ] What happens, and the steps to make it happen\n\n## Fixed\n- [x] Example: saving twice created a duplicate\n",
      },
      {
        key: "meeting",
        label: "Meeting notes",
        title: "Meeting notes",
        content: "**Date:** \n**People:** \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action items\n- [ ] \n",
      },
    ],
    emptyBody: "Keep ideas, to-do lists, meeting notes and specs here. Link notes to issues, wiki pages and decisions.",
    storySuggestionLabel: "Wiki",
  },
  canvas: {
    intro: "Boards for architecture sketches, flow charts, plans, moodboards and reference collections.",
    emptyBody: "Pin up notes, images, videos, links and to-dos, or map out flows and architecture with flow charts",
    assetCardHint: "Any issue, wiki page, note or decision in this project",
    templates: {
      flowChart: { start: "User opens sign-up", check: "Email valid?", yes: "Create account", no: "Show error", end: "Signed in" },
      architectureDescription: "Apps, API, jobs and data, grouped by layer",
      architecture: {
        front: "Frontend",
        client: "Web app",
        mobile: "Mobile app",
        back: "Backend",
        api: "API",
        worker: "Background jobs",
        store: "Database",
        outside: "Email service",
      },
      moodboard: { look: "Visual style", refs: "Products we like", tone: "Voice and tone", todo: ["Collect screenshots", "Pick a colour palette", "Choose fonts"] },
    },
  },
  wikiLinks: {
    storyTarget: "wiki page",
  },
} satisfies AppCopy;
