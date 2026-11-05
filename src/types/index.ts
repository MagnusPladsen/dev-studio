import type { AppId } from "@/lib/app-config";

export interface ProjectPins {
  tools: string[]; // tool paths, in pin order
  assets: AssetRef[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  pins?: ProjectPins;
  /** Show a short tutorial the first time each tool is opened. Missing (older projects) means off. */
  showTutorials?: boolean;
  /** Which app the project was made in. Missing means GameDev Studio. */
  app?: AppId;
  createdAt: string;
  updatedAt: string;
}

export interface Sprite {
  id: string;
  projectId: string;
  name: string;
  width: number;
  height: number;
  frames: SpriteFrame[];
  fps: number;
  /** True once each frame's `duration` sets the timing. Missing (older sprites) means `fps` did. */
  hasFrameDurations?: boolean;
  /** Named frame ranges, like Aseprite's tags ("idle", "walk"). Not the asset tags in `tags`. */
  frameTags?: FrameTag[];
  paletteId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type AnimationDirection = "forward" | "reverse" | "pingpong";

export interface FrameTag {
  id: string;
  name: string;
  /** First and last frame, 0-based and inclusive. */
  from: number;
  to: number;
  color: string;
  direction: AnimationDirection;
}

export interface SpriteLayer {
  id: string;
  name: string;
  visible: boolean;
  pixels: string; // PNG data URL
}

export interface SpriteFrame {
  id: string;
  pixels: string; // PNG data URL of all visible layers composited
  duration: number; // ms
  layers?: SpriteLayer[];
}

export interface Palette {
  id: string;
  projectId: string;
  name: string;
  colors: string[];
  createdAt: string;
}

export interface SoundEffect {
  id: string;
  projectId: string;
  name: string;
  params: SfxParams;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SfxParams {
  waveType: "square" | "sawtooth" | "sine" | "triangle" | "noise";
  frequency: number;
  frequencySlide: number;
  repeatSpeed: number;
  sustainTime: number;
  decayTime: number;
  attackTime: number;
  hpFilterCutoff: number;
  lpFilterCutoff: number;
  lpFilterResonance: number;
  volume: number;
  vibratoDepth: number;
  vibratoSpeed: number;
}

export interface MusicTrack {
  id: string;
  projectId: string;
  name: string;
  bpm: number;
  channels: MusicChannel[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MusicChannel {
  id: string;
  name: string;
  instrument: string;
  volume: number;
  patterns: MusicPattern[];
}

export interface MusicPattern {
  id: string;
  notes: MusicNote[];
}

export interface MusicNote {
  pitch: number; // MIDI note number
  start: number; // beat position
  duration: number; // beats
  velocity: number;
}

export interface DiagramNode {
  id: string;
  type:
    | "state"
    | "action"
    | "condition"
    | "event"
    | "note"
    | "custom"
    | "checklist"
    | "image"
    | "link"
    | "asset"
    | "group"
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "drawing"
    | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;
  data?: Record<string, unknown>;
}

/** Crow's-foot ends of a database relation line: the first word is the `from` end, the second the `to` end. */
export type Cardinality = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type: "arrow" | "line" | "dashed";
  /** The table row (column id) the line starts at, when `from` is a table. */
  fromRow?: string;
  /** The table row (column id) the line ends at, when `to` is a table. */
  toRow?: string;
  /** Set on relation lines between tables: draws crow's-foot ends instead of an arrowhead. */
  cardinality?: Cardinality;
}

export interface Diagram {
  id: string;
  projectId: string;
  name: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoryEntry {
  id: string;
  projectId: string;
  title: string;
  content: string; // markdown
  type: "character" | "location" | "item" | "event" | "lore" | "quest" | "note";
  links: AssetLink[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetLink {
  targetId: string;
  targetType: AssetType;
  label?: string;
}

export interface TilemapData {
  id: string;
  projectId: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  layers: TilemapLayer[];
  tilesetSpriteIds: string[];
  /** Auto-tile brushes; missing on maps made before terrains existed. */
  terrains?: TilemapTerrain[];
  /** One row per map row: 0 = empty, 1 = solid, 2 = one-way platform. Missing = all empty. */
  collision?: number[][];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A set of tiles that join up: painting picks each cell's tile from which neighbours are the same terrain.
 * "edge16" looks at the 4 sides (16 tiles), "blob47" also at the corners (47 tiles). `tiles` is keyed by the
 * neighbour mask (see `src/lib/tilemap/autotile.ts`); a missing key falls back to the terrain's centre tile.
 */
export interface TilemapTerrain {
  id: string;
  name: string;
  kind: "edge16" | "blob47";
  tiles: Record<string, number | string>;
}

export interface TilemapLayer {
  id: string;
  name: string;
  visible: boolean;
  tiles: (number | string | null)[][]; // number = basic color tile, string = sprite id, null = empty
}

export interface DialogueTree {
  id: string;
  projectId: string;
  name: string;
  nodes: DialogueNode[];
  /** What the conversation remembers while it plays, e.g. `gold` or `met_elder`. */
  variables?: DialogueVariable[];
  /** Language codes the localisation CSV has a column for, e.g. ["nb", "de"]. */
  languages?: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type DialogueValue = boolean | number | string;

export interface DialogueVariable {
  /** Letters, digits and _ (it becomes `$name` in Yarn). Conditions and sets refer to it by name. */
  name: string;
  type: "bool" | "number" | "string";
  defaultValue: DialogueValue;
}

export type DialogueCompare = "==" | "!=" | "<" | "<=" | ">" | ">=";

/** A condition node's test: `variable op value`. */
export interface DialogueCheck {
  variable: string;
  op: DialogueCompare;
  value: DialogueValue;
}

/** An action node that changes a variable: set it to `value`, add `value` to it, or flip a true/false one. */
export interface DialogueSet {
  variable: string;
  op: "set" | "add" | "toggle";
  value?: DialogueValue;
}

/** Translated text by language code. */
export type DialogueTranslations = Record<string, string>;

export interface DialogueChoice {
  /** Row id in the localisation CSV. Older choices have none; `choiceTextId` falls back to their position. */
  id?: string;
  text: string;
  targetId: string;
  translations?: DialogueTranslations;
}

export interface DialogueNode {
  id: string;
  type: "dialogue" | "choice" | "condition" | "action" | "start" | "end";
  x: number;
  y: number;
  speaker?: string;
  text?: string;
  /** Translations of `text` (a line, or a choice's prompt). */
  translations?: DialogueTranslations;
  choices?: DialogueChoice[];
  /** The next node; for a condition, where to go when it is true. */
  nextId?: string;
  /** Where a condition goes when it is false. Older conditions have none: the conversation ends there. */
  elseId?: string;
  /** Free-text condition, for the game's own code. `check` takes over when set. */
  condition?: string;
  check?: DialogueCheck;
  set?: DialogueSet;
}

export interface SpriteSheet {
  id: string;
  projectId: string;
  name: string;
  spriteIds: string[];
  padding: number;
  powerOfTwo: boolean;
  createdAt: string;
}

export type AssetType = "sprite" | "sound" | "music" | "diagram" | "story" | "tilemap" | "dialogue" | "palette" | "spritesheet" | "note" | "issue" | "model" | "decision";

/** "todo" / "doing" / "done" decides what counts as finished, whatever the column is called. */
export type ColumnCategory = "todo" | "doing" | "done";

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  category: ColumnCategory;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  state: "planned" | "active" | "closed";
  closedAt?: string;
  /** Added with the example issues, and removed with them. */
  example?: boolean;
}

/** One task board per project: its columns and sprints. Issues are stored separately. */
export interface Board {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string; // e.g. "PIP" → issues PIP-1, PIP-2…
  nextNumber: number;
  columns: BoardColumn[];
  sprints: Sprint[];
  createdAt: string;
  updatedAt: string;
}

export type IssueType = "feature" | "bug" | "task" | "art" | "audio" | "design" | "writing" | "chore" | "docs";
export type IssuePriority = "lowest" | "low" | "medium" | "high" | "highest";

export interface Issue {
  id: string;
  projectId: string;
  key: string; // "PIP-12"
  title: string;
  description: string; // markdown
  type: IssueType;
  priority: IssuePriority;
  status: string; // BoardColumn.id
  sprintId: string | null; // null = backlog
  points?: number;
  dueDate?: string;
  labels: string[];
  order: number;
  resolvedAt?: string; // set while in a "done" column
  archived?: boolean; // finished and off the board, still searchable and linkable
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VoxelModel {
  id: string;
  projectId: string;
  name: string;
  size: [number, number, number];
  paletteId?: string;
  colors: string[];
  voxels: string;
  thumbnail?: string;
  tags: string[];
  example?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  projectId: string;
  title: string;
  content: string; // markdown; "- [ ] task" lines are checklists
  folder?: string;
  pinned?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type DecisionStatus = "proposed" | "accepted" | "superseded" | "deprecated" | "rejected";

/** One architecture decision record in the Decision log. The Markdown fields follow the usual ADR layout. */
export interface Decision {
  id: string;
  projectId: string;
  number: number; // shown as ADR-001
  title: string;
  status: DecisionStatus;
  date: string; // yyyy-mm-dd, when it was decided (or proposed)
  context: string; // markdown
  options: string; // markdown: the options considered
  decision: string; // markdown
  consequences: string; // markdown
  supersededBy?: string; // id of the decision that replaces this one
  tags: string[];
  example?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRef {
  type: AssetType;
  id: string;
  /** One element (node) on a canvas, when the ref points inside a `diagram` rather than at all of it. */
  elementId?: string;
}

export interface AssetRelation {
  id: string;
  projectId: string;
  from: AssetRef;
  to: AssetRef;
  createdAt: string;
  updatedAt: string;
}
