import type { AssetRef } from "@/types";
import type { ExampleModule } from "./types";
import { issuesModule, type IssueDraft } from "./board";
import { diagram } from "./planning";

// Dev Studio's example project: "Tidepool", a small habit-tracker app heading for its public beta.

export const DEV_STUDIO_SLUGS = {
  diagrams: ["architecture", "signup-flow"],
  stories: ["ava", "jonas", "sync-api", "streak-engine", "beta-launch", "adr-offline"],
  notes: ["welcome", "spec-reminders", "kickoff", "bugs"],
  issues: ["i-onboarding", "i-streaks", "i-reminders", "i-sync-conflicts", "i-dark-mode", "i-crash-bug", "i-analytics", "i-beta-invites"],
} as const;

const diagrams: ExampleModule = {
  collection: "diagrams",
  build: ({ id }) => [
    {
      id: id("architecture"),
      name: "Architecture",
      ...diagram(
        [
          ["app", "state", 80, 200, "Mobile app"],
          ["store", "action", 80, 380, "Local store (SQLite)"],
          ["api", "state", 360, 200, "Sync API"],
          ["db", "action", 640, 200, "Postgres"],
          ["push", "event", 360, 40, "Push service"],
          ["note", "note", 600, 360, "Offline first: the app writes locally and syncs when it can. See ADR-001.", 260],
        ],
        [
          ["app", "store", "Reads and writes"],
          ["store", "api", "Sync queue"],
          ["api", "app", "Changes since", "dashed"],
          ["api", "db", "SQL"],
          ["api", "push", "Reminder due"],
          ["push", "app", "Notification", "dashed"],
        ]
      ),
    },
    {
      id: id("signup-flow"),
      name: "Sign-up Flow",
      ...diagram(
        [
          ["open", "event", 80, 200, "First launch"],
          ["account", "condition", 320, 200, "Has an account?", 160],
          ["signin", "state", 580, 80, "Sign in"],
          ["pick", "state", 580, 320, "Pick 3 habits"],
          ["remind", "action", 820, 320, "Set reminder time"],
          ["today", "state", 820, 80, "Today screen"],
        ],
        [
          ["open", "account", ""],
          ["account", "signin", "Yes"],
          ["account", "pick", "No"],
          ["pick", "remind", "Next"],
          ["remind", "today", "Done"],
          ["signin", "today", "Signed in"],
        ]
      ),
    },
  ],
};

const stories: ExampleModule = {
  collection: "stories",
  build: ({ id }) => [
    {
      id: id("ava"),
      title: "Ava Lindqvist",
      type: "character",
      links: [],
      tags: ["team", "product"],
      content: `Product lead. Owns the roadmap and the [[Public beta]] goal.

## Role
Decides what goes into each sprint and talks to beta testers.

## Owns
- Onboarding and the [[Streak engine]] rules
- The beta waiting list

## Contact
Best on the #tidepool channel. Mornings are for focus time.`,
    },
    {
      id: id("jonas"),
      title: "Jonas Berg",
      type: "character",
      links: [],
      tags: ["team", "backend"],
      content: `Backend developer. Built the [[Sync API]] and wrote [[ADR-001: Offline first]].

## Owns
- [[Sync API]]
- Database migrations and backups

## Contact
Ask in the #backend channel; he's on call every other week.`,
    },
    {
      id: id("sync-api"),
      title: "Sync API",
      type: "location",
      links: [],
      tags: ["backend", "api"],
      content: `Keeps every device in step. The app sends its change queue and gets back everything that changed since its last sync.

## Purpose
Let people track habits offline on several devices without losing a tick.

## Parts
- \`POST /sync\`: push local changes, pull remote ones
- Conflict rules: the latest tick wins, deletes always win
- Reminder scheduler that calls the push service

## Owners
[[Jonas Berg]]. Design decision in [[ADR-001: Offline first]].`,
    },
    {
      id: id("streak-engine"),
      title: "Streak engine",
      type: "item",
      links: [],
      tags: ["app", "core"],
      content: `Works out streaks from a habit's ticks. Runs on the device, so streaks show instantly, even offline.

## What it does
- Counts days in a row with at least one tick
- Allows one "rest day" a week without breaking the streak
- Uses the person's own time zone, not the server's

## Interfaces
\`streakFor(habit, ticks, today)\` returns \`{ current, best, restDaysLeft }\`.

## Depends on
The local store. Rules agreed with [[Ava Lindqvist]].`,
    },
    {
      id: id("beta-launch"),
      title: "Public beta",
      type: "quest",
      links: [],
      tags: ["milestone"],
      content: `Open Tidepool to the 500 people on the waiting list.

## Objective
People can sign up, track habits for two weeks and tell us what they think.

## Owner
[[Ava Lindqvist]]

## Steps
- Onboarding finished and tested
- [[Sync API]] handles conflicts without losing ticks
- Crash-free rate above 99.5%
- Invite emails sent in batches of 100

## Done when
All 500 invites are out and the feedback form is live.`,
    },
    {
      id: id("adr-offline"),
      title: "ADR-001: Offline first",
      type: "lore",
      links: [],
      tags: ["decision", "architecture"],
      content: `**Status:** accepted

## Context
People tick habits on the bus, on planes and in the gym basement. Waiting for the network made the app feel broken.

## Decision
The app writes every change to its local store first and syncs in the background through the [[Sync API]].

## Consequences
- The app is instant, online or not
- We need conflict rules for two devices editing the same habit
- The [[Streak engine]] has to run on the device`,
    },
  ],
};

const notes: ExampleModule = {
  collection: "notes",
  build: ({ id }) => [
    {
      id: id("welcome"),
      title: "Welcome to your notebook",
      folder: "Getting started",
      pinned: true,
      tags: ["getting-started"],
      content: `Use the notebook for ideas, specs, meeting notes and to-dos.

- [x] Open the notebook
- [ ] Write down what you're building
- [ ] Link this note to an issue or a canvas with **+ Link** below
- [ ] Click a checkbox in the preview to tick it off

Type \`[[\` to link to another note or a wiki page, like [[Spec: Reminders]].
`,
    },
    {
      id: id("spec-reminders"),
      title: "Spec: Reminders",
      folder: "Specs",
      pinned: true,
      tags: ["spec"],
      content: `## Problem
People forget to open the app, so streaks break on day three. That's where most of our beta-list survey answers say they gave up on other habit apps.

## Proposal
- One reminder per habit, at a time the person picks
- Sent by the push service when the habit isn't ticked yet
- Quiet hours: nothing between 22:00 and 07:00

## Out of scope
- Smart timing based on when people usually tick
- Email reminders

## Open questions
- [ ] Do we remind on rest days?
- [x] One reminder per habit or one per day? *One per habit.*
`,
    },
    {
      id: id("kickoff"),
      title: "Beta kickoff meeting",
      folder: "Meetings",
      pinned: false,
      tags: ["meeting"],
      content: `**People:** Ava, Jonas, Mira

## Decisions
- The beta ships without dark mode
- Invites go out in batches of 100 so we can watch the crash rate
- Sync conflicts must be fixed before the first batch

## Action items
- [x] Ava: write the reminders spec
- [ ] Jonas: conflict rules in the Sync API
- [ ] Mira: invite email copy
`,
    },
    {
      id: id("bugs"),
      title: "Bug list",
      folder: "Production",
      pinned: false,
      tags: ["bugs"],
      content: `- [x] Ticking a habit twice in a second counted two days
- [ ] App crashes when the phone's language is changed while it's open
- [ ] Streak shows 0 for a moment after launch
- [ ] Reminder time picker ignores 12-hour clocks

Tip: write *what you did*, *what happened* and *what you expected*.
`,
    },
  ],
};

const ISSUES: IssueDraft[] = [
  {
    slug: "i-onboarding",
    title: "Onboarding: pick three habits",
    status: "done",
    type: "feature",
    priority: "high",
    points: 3,
    labels: ["onboarding"],
    description: "First launch asks for three habits and a reminder time. See the *Sign-up Flow* canvas.",
  },
  {
    slug: "i-streaks",
    title: "Rest days in the streak engine",
    status: "testing",
    type: "feature",
    priority: "high",
    points: 3,
    labels: ["core"],
    description: "One rest day a week keeps the streak alive. Rules are on the **Streak engine** wiki page.",
  },
  {
    slug: "i-sync-conflicts",
    title: "Resolve sync conflicts between devices",
    status: "in-progress",
    type: "feature",
    priority: "highest",
    points: 5,
    labels: ["backend", "sync"],
    description: "Latest tick wins, deletes always win. Must land before the first beta batch.",
    dueInDays: 4,
  },
  {
    slug: "i-reminders",
    title: "Habit reminders",
    status: "in-progress",
    type: "feature",
    priority: "medium",
    points: 5,
    labels: ["notifications"],
    description: "Build what *Spec: Reminders* describes: one reminder per habit, with quiet hours.",
  },
  {
    slug: "i-crash-bug",
    title: "Bug: crash after changing the phone's language",
    status: "todo",
    type: "bug",
    priority: "high",
    points: 2,
    labels: ["bug", "app"],
    description:
      "**Steps**\n1. Open Tidepool\n2. Change the phone's language in Settings\n3. Switch back to the app\n\n**Expected** the app shows the new language  \n**Actual** it crashes",
  },
  {
    slug: "i-beta-invites",
    title: "Send beta invites in batches",
    status: "todo",
    type: "task",
    priority: "medium",
    points: 2,
    labels: ["launch"],
    description: "100 invites at a time from the waiting list. Watch the crash rate for a day between batches.",
  },
  {
    slug: "i-analytics",
    title: "Privacy-friendly usage stats",
    status: "todo",
    type: "task",
    priority: "low",
    points: 3,
    labels: ["backend"],
    description: "Count daily active people and ticks per day. No personal data, no third-party trackers.",
  },
  {
    slug: "i-dark-mode",
    title: "Dark mode",
    status: "todo",
    type: "design",
    priority: "lowest",
    points: 3,
    labels: ["design"],
    description: "After the beta. Follow the phone's setting by default.",
  },
];

export const devStudioExamples: ExampleModule[] = [diagrams, stories, notes, issuesModule(ISSUES)];

/** Links between the example assets, so the sample project shows how everything connects. */
export const DEV_STUDIO_LINKS: [AssetRef["type"], string, AssetRef["type"], string][] = [
  ["issue", "i-onboarding", "diagram", "signup-flow"],
  ["issue", "i-streaks", "story", "streak-engine"],
  ["issue", "i-sync-conflicts", "story", "sync-api"],
  ["issue", "i-sync-conflicts", "diagram", "architecture"],
  ["issue", "i-reminders", "note", "spec-reminders"],
  ["issue", "i-crash-bug", "note", "bugs"],
  ["issue", "i-beta-invites", "story", "beta-launch"],
  ["note", "kickoff", "story", "beta-launch"],
  ["diagram", "architecture", "story", "adr-offline"],
];
