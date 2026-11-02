import type { Issue, IssuePriority, IssueType } from "@/types";
import { storage } from "../storage";
import type { ExampleModule } from "./types";

/** "Pip's Quest" → "PIP". Shared by the board page so example keys match the board. */
export function issueKeyPrefix(projectName: string | undefined): string {
  const letters = (projectName ?? "").replace(/[^a-z]/gi, "").toUpperCase();
  return letters.slice(0, 3) || "ISS";
}

export function issueNumber(key: string): number {
  const n = parseInt(key.split("-").pop() ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

export type IssueDraft = {
  slug: string;
  title: string;
  status: "todo" | "in-progress" | "testing" | "done";
  type: IssueType;
  priority: IssuePriority;
  points: number;
  labels: string[];
  description: string;
  dueInDays?: number;
};

const DRAFTS: IssueDraft[] = [
  {
    slug: "i-movement",
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
    title: "Bug: double jump when holding space on a ledge",
    status: "todo",
    type: "bug",
    priority: "high",
    points: 2,
    labels: ["player", "bug"],
    description:
      "**Steps**\n1. Walk to the edge of a stone platform\n2. Hold space as Pip walks off\n\n**Expected** one jump  \n**Actual** Pip jumps twice (coyote time + buffer both fire)",
  },
  {
    slug: "i-dialogue-ui",
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

/** An issues example module: keys follow the project name and continue after any existing issues. */
export function issuesModule(drafts: IssueDraft[]): ExampleModule {
  return {
    collection: "issues",
    build({ projectId, id }) {
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
        sprintId: null,
        points: d.points,
        dueDate: d.dueInDays ? new Date(now + d.dueInDays * 86_400_000).toISOString().slice(0, 10) : undefined,
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
