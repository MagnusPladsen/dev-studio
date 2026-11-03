import type { DiagramEdge, DiagramNode } from "@/types";
import { isDevStudio } from "@/lib/app-config";
import type { NodeType } from "@/lib/diagrams/cards";
import { createNode, insertNode } from "./create";

export type TemplateId = "blank" | "flow-chart" | "architecture" | "moodboard";

export interface CanvasTemplate {
  id: TemplateId;
  name: string;
  description: string;
  /** Starting cards and lines; ids come from `makeId` so every new canvas gets its own. */
  build(makeId: () => string): { nodes: DiagramNode[]; edges: DiagramEdge[] };
}

/** One card in a template, by its centre; `key` names it for the lines. */
interface CardSpec {
  key: string;
  type: NodeType;
  x: number;
  y: number;
  label?: string;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
}

type LineSpec = [from: string, to: string, label?: string];

function layout(cards: CardSpec[], lines: LineSpec[], makeId: () => string) {
  const ids = new Map(cards.map((card) => [card.key, makeId()]));
  const nodes = cards.reduce<DiagramNode[]>((placed, { key, type, x, y, height, ...extra }) => {
    const node = createNode(type, { x, y }, { id: ids.get(key)!, extra });
    return insertNode(placed, height ? { ...node, height, y: Math.round(y - height / 2) } : node);
  }, []);
  const edges = lines.map(([from, to, label = ""]): DiagramEdge => ({ id: makeId(), from: ids.get(from)!, to: ids.get(to)!, label, type: "arrow" }));
  return { nodes, edges };
}

const checklist = (texts: string[], makeId: () => string) => ({ items: texts.map((text) => ({ id: makeId(), text, done: false })) });

const FLOW = isDevStudio
  ? { start: "User opens sign-up", check: "Email valid?", yes: "Create account", no: "Show error", end: "Signed in" }
  : { start: "Player presses Jump", check: "On the ground?", yes: "Jump", no: "Buffer the jump", end: "Landed" };

const ARCHITECTURE = isDevStudio
  ? { front: "Frontend", client: "Web app", mobile: "Mobile app", back: "Backend", api: "API", worker: "Background jobs", store: "Database", outside: "Email service" }
  : { front: "Players", client: "Game client", mobile: "Mobile build", back: "Online services", api: "Game server", worker: "Matchmaking", store: "Save data", outside: "Leaderboards" };

const MOODBOARD = isDevStudio
  ? { look: "Visual style", refs: "Products we like", tone: "Voice and tone", todo: ["Collect screenshots", "Pick a colour palette", "Choose fonts"] }
  : { look: "Art style", refs: "Reference games", tone: "Music and sound", todo: ["Collect screenshots", "Pick a colour palette", "Find a font"] };

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: "blank",
    name: "Blank canvas",
    description: "An empty board to fill your own way",
    build: () => ({ nodes: [], edges: [] }),
  },
  {
    id: "flow-chart",
    name: "Flow chart",
    description: "Start, a decision and both branches",
    build: (makeId) =>
      layout(
        [
          { key: "start", type: "event", x: 320, y: 80, label: FLOW.start, width: 180 },
          { key: "check", type: "condition", x: 320, y: 200, label: FLOW.check, width: 160 },
          { key: "yes", type: "action", x: 160, y: 330, label: FLOW.yes },
          { key: "no", type: "action", x: 480, y: 330, label: FLOW.no },
          { key: "end", type: "state", x: 320, y: 450, label: FLOW.end },
        ],
        [["start", "check"], ["check", "yes", "yes"], ["check", "no", "no"], ["yes", "end"]],
        makeId
      ),
  },
  {
    id: "architecture",
    name: "Architecture",
    description: isDevStudio ? "Apps, API, jobs and data, grouped by layer" : "Client, servers and data, grouped by layer",
    build: (makeId) =>
      layout(
        [
          { key: "front", type: "group", x: 160, y: 210, label: ARCHITECTURE.front, width: 240, height: 300 },
          { key: "client", type: "rectangle", x: 160, y: 150, label: ARCHITECTURE.client, height: 70 },
          { key: "mobile", type: "rectangle", x: 160, y: 280, label: ARCHITECTURE.mobile, height: 70 },
          { key: "back", type: "group", x: 620, y: 210, label: ARCHITECTURE.back, width: 440, height: 300 },
          { key: "api", type: "rectangle", x: 520, y: 215, label: ARCHITECTURE.api, height: 70 },
          { key: "worker", type: "rectangle", x: 720, y: 215, label: ARCHITECTURE.worker, height: 70 },
          { key: "store", type: "ellipse", x: 520, y: 460, label: ARCHITECTURE.store },
          { key: "outside", type: "ellipse", x: 720, y: 460, label: ARCHITECTURE.outside },
        ],
        [["client", "api"], ["mobile", "api"], ["api", "store"], ["api", "worker"], ["worker", "outside"]],
        makeId
      ),
  },
  {
    id: "moodboard",
    name: "Moodboard",
    description: "Groups for pictures, references and notes",
    build: (makeId) =>
      layout(
        [
          { key: "look", type: "group", x: 220, y: 220, label: MOODBOARD.look, width: 380, height: 380 },
          { key: "look-note", type: "note", x: 220, y: 110, label: "Drop or paste pictures here" },
          { key: "refs", type: "group", x: 640, y: 220, label: MOODBOARD.refs, width: 380, height: 380 },
          { key: "refs-note", type: "note", x: 640, y: 110, label: "Paste links to videos, pages and songs" },
          { key: "tone", type: "group", x: 1060, y: 220, label: MOODBOARD.tone, width: 380, height: 380 },
          { key: "tone-note", type: "note", x: 1060, y: 110, label: "Words that describe the feel" },
          { key: "todo", type: "checklist", x: 640, y: 520, data: checklist(MOODBOARD.todo, makeId) },
        ],
        [],
        makeId
      ),
  },
];
