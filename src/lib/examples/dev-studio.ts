import type { AssetRef, DiagramEdge } from "@/types";
import type { ExampleModule } from "./types";
import { issuesModule, type ExampleSprint, type IssueDraft } from "./board";
import { diagram } from "./planning";
import { decisionsModule, type DecisionDraft } from "./decisions";
import { card, group, note } from "./diagram-boards";
import { relation, table } from "./erd";

// Dev Studio's example project: "Tidepool", a small habit-tracker app heading for its public beta.

export const DEV_STUDIO_SLUGS = {
  diagrams: ["architecture", "signup-flow", "data-model"],
  stories: ["ava", "jonas", "sync-api", "streak-engine", "beta-launch"],
  notes: ["welcome", "spec-reminders", "kickoff", "bugs"],
  decisions: ["adr-offline", "adr-server-wins", "adr-conflict-rules", "adr-usage-stats"],
  issues: ["i-onboarding", "i-streaks", "i-reminders", "i-sync-conflicts", "i-dark-mode", "i-crash-bug", "i-analytics", "i-beta-invites"],
} as const;

const line = (id: string, from: string, to: string, label: string, type: DiagramEdge["type"] = "arrow"): DiagramEdge => ({ id, from, to, label, type });

const diagrams: ExampleModule = {
  collection: "diagrams",
  build: ({ id }) => [
    {
      id: id("architecture"),
      name: "Architecture",
      nodes: [
        group("phone", 40, 40, 300, 400, "On the phone", "#38bdf8"),
        group("backend", 400, 40, 560, 400, "Backend", "#a78bfa"),
        card("store", "ellipse", 80, 100, 220, 80, "Local store (SQLite)"),
        card("app", "rectangle", 80, 300, 220, 70, "Mobile app"),
        card("api", "rectangle", 440, 100, 200, 70, "Sync API"),
        card("db", "ellipse", 720, 95, 200, 80, "Postgres"),
        card("scheduler", "rectangle", 440, 300, 200, 70, "Reminder scheduler"),
        card("push", "rectangle", 260, 500, 200, 70, "Push service", { color: "#f472b6" }),
        note("note", 720, 300, 220, "Offline first: the app writes locally and syncs when it can. See ADR-001."),
      ],
      edges: [
        line("e1", "app", "store", "Reads and writes"),
        line("e2", "store", "api", "Sync queue"),
        line("e3", "api", "app", "Changes since", "dashed"),
        line("e4", "api", "db", "SQL"),
        line("e5", "api", "scheduler", "Reminder due"),
        line("e6", "scheduler", "push", "Send"),
        line("e7", "push", "app", "Notification", "dashed"),
      ],
    },
    {
      id: id("data-model"),
      name: "Data Model",
      nodes: [
        table("users", 40, 180, "users", [["id", "uuid", "PK"], ["email", "text"], ["display_name", "text"], ["time_zone", "text"], ["created_at", "timestamp"]]),
        table("habits", 360, 40, "habits", [["id", "uuid", "PK"], ["user_id", "uuid", "FK"], ["name", "text"], ["schedule", "text"], ["archived_at", "timestamp"], ["updated_at", "timestamp"]]),
        table("devices", 360, 320, "devices", [["id", "uuid", "PK"], ["user_id", "uuid", "FK"], ["platform", "text"], ["push_token", "text"], ["last_synced_at", "timestamp"]]),
        table("ticks", 680, 260, "ticks", [["id", "uuid", "PK"], ["habit_id", "uuid", "FK"], ["device_id", "uuid", "FK"], ["day", "date"], ["ticked_at", "timestamp"], ["deleted_at", "timestamp"]]),
        table("reminders", 680, 20, "reminders", [["id", "uuid", "PK"], ["habit_id", "uuid", "FK"], ["time_of_day", "time"], ["days", "text"], ["is_enabled", "boolean"]]),
        note("conflicts", 40, 400, 280, "Sync conflicts: the latest ticked_at wins and deleted_at always wins (ADR-003). last_synced_at tells the Sync API what to send back."),
      ],
      edges: [
        relation("e1", "habits.user_id", "users.id"),
        relation("e2", "devices.user_id", "users.id"),
        relation("e3", "ticks.habit_id", "habits.id"),
        relation("e4", "ticks.device_id", "devices.id"),
        relation("e5", "reminders.habit_id", "habits.id"),
      ],
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
      content: `Backend developer. Built the [[Sync API]] and wrote ADR-001, *Offline first*, in the Decision log.

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
[[Jonas Berg]]. Why it works this way: ADR-001 and ADR-003 in the Decision log.`,
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

const BETA_PREP: ExampleSprint = { slug: "sprint-beta-prep", name: "Beta prep", goal: "Ready for the first beta batch", current: true };
const BETA_LAUNCH: ExampleSprint = { slug: "sprint-beta-launch", name: "Beta launch", goal: "Invite testers and watch the numbers" };

const DECISIONS: DecisionDraft[] = [
  {
    slug: "adr-offline",
    title: "Offline first",
    status: "accepted",
    daysAgo: 60,
    tags: ["architecture", "sync"],
    context: `People tick habits on the bus, on planes and in the gym basement. In the first prototype every tick waited for the network, and testers said the app "felt broken" whenever the signal dropped.`,
    options: `- **Online only**: simplest server, but the app is useless without signal
- **Cache reads, queue writes**: works offline, but the app still waits for the server to show a streak
- **Local store first, sync in the background**: instant everywhere, but two devices can disagree`,
    decision: `The app writes every change to its local store (SQLite) first and syncs in the background through the [[Sync API]]. The device is the source of truth for what the person sees.`,
    consequences: `- The app is instant, online or not
- We need conflict rules for two devices editing the same habit (see ADR-003)
- The [[Streak engine]] has to run on the device, not the server`,
  },
  {
    slug: "adr-server-wins",
    title: "The server copy wins sync conflicts",
    status: "superseded",
    daysAgo: 45,
    supersededBy: "adr-conflict-rules",
    tags: ["sync"],
    context: `With offline first, a phone and a tablet can both change the same habit before they sync. We need a rule for which change survives.`,
    options: `- **Server wins**: whatever reached the server first stays
- **Ask the person**: a dialog on every conflict`,
    decision: `Whatever the server already has wins. The other device's change is dropped on its next sync.`,
    consequences: `- Simple to build on the server
- A tick made offline can disappear without a word`,
  },
  {
    slug: "adr-conflict-rules",
    title: "Latest tick wins, deletes always win",
    status: "accepted",
    daysAgo: 12,
    tags: ["sync", "backend"],
    context: `Replaces ADR-002. Beta testers lost ticks they made on the plane: the server copy won, and the offline tick vanished. Losing a tick breaks a streak, which is the one thing the app must never do.`,
    options: `- **Server wins** (ADR-002): loses offline ticks
- **Latest change wins, by device clock**: keeps the newest tick, but a phone with a wrong clock can win every time
- **Merge per tick**: ticks are only ever added, so keep every tick from every device; deletes win over edits`,
    decision: `Ticks are merged: a tick from any device is kept. For edits to the same habit, the latest change wins, using the time the server received it. A deleted habit stays deleted.`,
    consequences: `- No more lost ticks, so streaks survive a flight
- A habit deleted on one device disappears everywhere, even if it was edited elsewhere
- [x] Agreed in the beta kickoff
- [ ] Jonas: build it in the Sync API before the first invite batch`,
  },
  {
    slug: "adr-usage-stats",
    title: "Count usage without third-party trackers",
    status: "proposed",
    daysAgo: 2,
    tags: ["privacy", "backend"],
    context: `For the [[Public beta]] we want to know how many people tick a habit each day. Our privacy promise says we never share data with anyone.`,
    options: `- **A hosted analytics SDK**: quick to add, but sends data to a third party
- **Self-hosted analytics**: one more server to run
- **Counters in the Sync API**: it already sees every tick, so count there`,
    decision: `Count daily active people and ticks per day inside the Sync API, as totals only. No events, no device ids, no third-party code in the app.`,
    consequences: `- Nothing new to install in the app
- We can't see where in the app people get stuck; we'll ask beta testers instead`,
  },
];

const ISSUES: IssueDraft[] = [
  {
    slug: "i-onboarding",
    sprint: BETA_PREP,
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
    sprint: BETA_PREP,
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
    sprint: BETA_PREP,
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
    sprint: BETA_PREP,
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
    sprint: BETA_PREP,
    title: "Bug: crash after changing the phone's language",
    status: "todo",
    type: "bug",
    priority: "high",
    points: 2,
    labels: ["bug", "app"],
    dueInDays: -1,
    description:
      "**Steps**\n1. Open Tidepool\n2. Change the phone's language in Settings\n3. Switch back to the app\n\n**Expected** the app shows the new language  \n**Actual** it crashes",
  },
  {
    slug: "i-beta-invites",
    sprint: BETA_LAUNCH,
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
    sprint: BETA_LAUNCH,
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

export const devStudioExamples: ExampleModule[] = [diagrams, stories, notes, decisionsModule(DECISIONS), issuesModule(ISSUES)];

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
  ["diagram", "architecture", "decision", "adr-offline"],
  ["diagram", "data-model", "story", "sync-api"],
  ["issue", "i-sync-conflicts", "diagram", "data-model"],
  ["diagram", "data-model", "decision", "adr-conflict-rules"],
  ["decision", "adr-offline", "story", "sync-api"],
  ["decision", "adr-offline", "story", "streak-engine"],
  ["decision", "adr-conflict-rules", "decision", "adr-server-wins"],
  ["decision", "adr-conflict-rules", "issue", "i-sync-conflicts"],
  ["decision", "adr-conflict-rules", "story", "sync-api"],
  ["decision", "adr-conflict-rules", "note", "kickoff"],
  ["decision", "adr-usage-stats", "issue", "i-analytics"],
];
