import type { Board, Issue, IssuePriority, IssueType, Sprint } from "@/types";
import { createDefaultBoard, today } from "@/components/board/meta";
import { storage } from "../storage";
import type { ExampleContext, ExampleModule } from "./types";

/** "Pip's Quest" → "PIP". Shared by the board page so example keys match the board. */
export function issueKeyPrefix(projectName: string | undefined): string {
  const letters = (projectName ?? "").replace(/[^a-z]/gi, "").toUpperCase();
  return letters.slice(0, 3) || "ISS";
}

export function issueNumber(key: string): number {
  const n = parseInt(key.split("-").pop() ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/** A sprint the example issues sit in. The `current` one starts active, unless the board already runs a sprint. */
export type ExampleSprint = { slug: string; name: string; goal: string; current?: boolean };

export type IssueDraft = {
  slug: string;
  title: string;
  status: "todo" | "in-progress" | "testing" | "done";
  type: IssueType;
  priority: IssuePriority;
  points: number;
  labels: string[];
  description: string;
  /** Negative = already overdue. */
  dueInDays?: number;
  sprint?: ExampleSprint;
};

const DAY_MS = 86_400_000;
const dateIn = (days: number) => today(new Date(Date.now() + days * DAY_MS));

const MEADOW_SPRINT: ExampleSprint = { slug: "sprint-meadow", name: "Meadow sprint", goal: "First playable level", current: true };
const FOREST_SPRINT: ExampleSprint = { slug: "sprint-forest", name: "Forest sprint", goal: "Story, items and music for the forest" };

const DRAFTS: IssueDraft[] = [
  {
    slug: "i-movement",
    sprint: MEADOW_SPRINT,
    title: "Basic left/right movement",
    status: "done",
    type: "feature",
    priority: "high",
    points: 2,
    labels: ["player", "core"],
    description:
      "Pip walks left and right with the arrow keys or A/D.\n\n**Done when**\n- Speed is about 90 px/s\n- Pip faces the way he walks\n- Walk animation plays while moving",
  },
  {
    slug: "i-coin-sfx",
    sprint: MEADOW_SPRINT,
    title: "Coin pickup sound + counter",
    status: "done",
    type: "audio",
    priority: "medium",
    points: 1,
    labels: ["audio", "ui"],
    description: "Play the **Coin pickup** sound and bump the coin counter in the top-left corner.",
  },
  {
    slug: "i-jump-feel",
    sprint: MEADOW_SPRINT,
    title: "Tune jump feel (coyote time, jump buffer)",
    status: "testing",
    type: "feature",
    priority: "high",
    points: 3,
    labels: ["player", "game-feel"],
    description:
      "Jumping should feel forgiving.\n\n- Coyote time: 0.1 s after leaving a ledge\n- Jump buffer: 0.1 s before landing\n- Release early for a short hop\n\nSee the *Player States* diagram.",
  },
  {
    slug: "i-slime-ai",
    sprint: MEADOW_SPRINT,
    title: "Slime patrol & chase AI",
    status: "in-progress",
    type: "feature",
    priority: "medium",
    points: 5,
    labels: ["enemies"],
    description:
      "Follow the *Slime AI* diagram: patrol between edges, chase when Pip is within 5 tiles, attack, then cool down.",
  },
  {
    slug: "i-meadow-level",
    sprint: MEADOW_SPRINT,
    title: "Build Mossbrook Meadow level",
    status: "in-progress",
    type: "design",
    priority: "high",
    points: 5,
    labels: ["level", "world-1"],
    description: "First level. Teach walking, jumping and coins before the first slime. Pond in the middle, chest at the end.",
    dueInDays: 5,
  },
  {
    slug: "i-title-music",
    sprint: FOREST_SPRINT,
    title: "Title screen music",
    status: "todo",
    type: "audio",
    priority: "medium",
    points: 2,
    labels: ["audio", "music"],
    description: "Use **Title Theme** on the title screen. Fade out over 1 s when the game starts.",
  },
  {
    slug: "i-jump-bug",
    sprint: MEADOW_SPRINT,
    title: "Bug: double jump when holding space on a ledge",
    status: "todo",
    type: "bug",
    priority: "high",
    points: 2,
    labels: ["player", "bug"],
    dueInDays: -2,
    description:
      "**Steps**\n1. Walk to the edge of a stone platform\n2. Hold space as Pip walks off\n\n**Expected** one jump  \n**Actual** Pip jumps twice (coyote time + buffer both fire)",
  },
  {
    slug: "i-dialogue-ui",
    sprint: FOREST_SPRINT,
    title: "Dialogue box UI for Elder Maren",
    status: "todo",
    type: "art",
    priority: "medium",
    points: 3,
    labels: ["ui", "story"],
    description: "Nine-slice box at the bottom of the screen, speaker name tab, typewriter text, ▼ prompt. Plays *Elder Maren's Quest*.",
  },
  {
    slug: "i-sword-sprite",
    sprint: FOREST_SPRINT,
    title: "Sunsteel Sword pickup sprite",
    status: "todo",
    type: "art",
    priority: "low",
    points: 1,
    labels: ["art", "items"],
    description: "Add a 2-frame shine to the **Sunsteel Sword** sprite for the pickup in the Whispering Forest.",
  },
  {
    slug: "i-save-system",
    title: "Save/load progress",
    status: "todo",
    type: "task",
    priority: "low",
    points: 3,
    labels: ["core"],
    description: "Save coins, unlocked levels and quest state to local storage. Load on the title screen.",
  },
];

/** Adds the drafts' sprints to the project's board (creating the board if needed) and returns it. */
function addExampleSprints(projectId: string, drafts: IssueDraft[], id: ExampleContext["id"]): Board {
  const board = storage.getAll("boards", projectId)[0] ?? createDefaultBoard(projectId);
  const wanted = [...new Map(drafts.flatMap((d) => (d.sprint ? [[d.sprint.slug, d.sprint] as const] : []))).values()];
  const missing = wanted.filter((s) => !board.sprints.some((b) => b.id === id(s.slug)));
  if (missing.length === 0) return board;
  const running = board.sprints.some((s) => s.state === "active");
  const sprints = missing.map(
    (s): Sprint =>
      s.current && !running
        ? { id: id(s.slug), name: s.name, goal: s.goal, state: "active", startDate: dateIn(-6), endDate: dateIn(7), example: true }
        : { id: id(s.slug), name: s.name, goal: s.goal, state: "planned", example: true }
  );
  const next = { ...board, sprints: [...board.sprints, ...sprints], updatedAt: new Date().toISOString() };
  storage.save("boards", next, projectId);
  return next;
}

/** Takes the example sprints off the board; any of your own issues in them go back to the backlog. */
export function removeExampleSprints(projectId: string): void {
  for (const board of storage.getAll("boards", projectId)) {
    const gone = new Set(board.sprints.filter((s) => s.example).map((s) => s.id));
    if (gone.size === 0) continue;
    for (const issue of storage.getAll("issues", projectId)) {
      if (issue.sprintId && gone.has(issue.sprintId)) storage.save("issues", { ...issue, sprintId: null, updatedAt: new Date().toISOString() }, projectId);
    }
    storage.save("boards", { ...board, sprints: board.sprints.filter((s) => !gone.has(s.id)), updatedAt: new Date().toISOString() }, projectId);
  }
}

/** An issues example module: keys follow the project name and continue after any existing issues. */
export function issuesModule(drafts: IssueDraft[]): ExampleModule {
  return {
    collection: "issues",
    build({ projectId, id }) {
      addExampleSprints(projectId, drafts, id);
      const prefix = issueKeyPrefix(storage.getById("projects", projectId)?.name);
      const taken = storage
        .getAll("issues", projectId)
        .filter((i) => i.key.startsWith(prefix + "-"))
        .reduce((max, i) => Math.max(max, issueNumber(i.key)), 0);
      const now = Date.now();
      return drafts.map((d, i): Issue & Record<string, unknown> => ({
        id: id(d.slug),
        projectId,
        key: `${prefix}-${taken + i + 1}`,
        title: d.title,
        description: d.description,
        type: d.type,
        priority: d.priority,
        status: d.status,
        sprintId: d.sprint ? id(d.sprint.slug) : null,
        points: d.points,
        dueDate: d.dueInDays !== undefined ? dateIn(d.dueInDays) : undefined,
        labels: d.labels,
        order: i * 1000,
        resolvedAt: d.status === "done" ? new Date(now - 86_400_000).toISOString() : undefined,
        tags: [],
        createdAt: new Date(now - (drafts.length - i) * 3_600_000).toISOString(),
        updatedAt: new Date(now - (drafts.length - i) * 1_800_000).toISOString(),
      }));
    },
  };
}

export const boardExamples: ExampleModule[] = [issuesModule(DRAFTS)];
