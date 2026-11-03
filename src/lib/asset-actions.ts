import { v4 as uuid } from "uuid";
import type {
  AssetRef,
  AssetType,
  Diagram,
  Decision,
  DiagramNode,
  DialogueTree,
  Issue,
  MusicTrack,
  Note,
  Palette,
  SoundEffect,
  Sprite,
  SpriteSheet,
  StoryEntry,
  TilemapData,
  VoxelModel,
} from "@/types";
import { createDefaultBoard, createIssue, takeIssueKey } from "./board";
import { ASSET_KINDS, assetHref, summarize, type AssetSummary } from "./assets";
import { addLink } from "./links";
import { removeAssetPin } from "./pins";
import { storage, type CollectionName } from "./storage";
import { decisionToMarkdown, nextDecisionNumber } from "./decisions";
import type { ClipboardPayload } from "./clipboard";

export type StoredAsset =
  | Sprite
  | SoundEffect
  | MusicTrack
  | Diagram
  | StoryEntry
  | TilemapData
  | DialogueTree
  | Palette
  | SpriteSheet
  | Note
  | Issue
  | VoxelModel
  | Decision;

export type ClonePlacement = "in-place" | "backlog";

const TITLED_TYPES: AssetType[] = ["story", "note", "issue", "decision"];
const DIAGRAM_NODE_WIDTH = 220;
const DIAGRAM_NODE_HEIGHT = 64;
const DIAGRAM_NODE_GAP = 40;
const ISSUE_ORDER_STEP = 1000;

type NamedRecord = { title?: string; name?: string };

function collectionOf(type: AssetType): CollectionName {
  return ASSET_KINDS[type].collection;
}

export function getStoredAsset(projectId: string, ref: AssetRef): StoredAsset | undefined {
  return storage.getById(collectionOf(ref.type), ref.id, projectId) as StoredAsset | undefined;
}

export function getAssetName(type: AssetType, item: unknown): string {
  const record = item as NamedRecord;
  const name = TITLED_TYPES.includes(type) ? record.title : record.name;
  return name || "Untitled";
}

function nameOf(projectId: string, ref: AssetRef): string {
  return getAssetName(ref.type, getStoredAsset(projectId, ref));
}

export function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  const first = `${base} copy`;
  if (!taken.includes(first)) return first;
  let n = 2;
  while (taken.includes(`${first} ${n}`)) n++;
  return `${first} ${n}`;
}

function takenNames(type: AssetType, projectId: string): string[] {
  return storage.getAll(collectionOf(type), projectId).map((item) => getAssetName(type, item));
}

function issueClone(clone: Issue, projectId: string, placement: ClonePlacement): Issue {
  const board = storage.getAll("boards", projectId)[0] ?? createDefaultBoard(projectId);
  const { key } = takeIssueKey(projectId, board);
  const status = placement === "backlog" ? board.columns[0].id : clone.status;
  const siblings = storage.getAll("issues", projectId).filter((i) => i.status === status);
  const now = new Date().toISOString();
  const isDone = board.columns.find((c) => c.id === status)?.category === "done";
  return {
    ...clone,
    key,
    status,
    sprintId: placement === "backlog" ? null : clone.sprintId,
    order: siblings.reduce((max, i) => Math.max(max, i.order), 0) + ISSUE_ORDER_STEP,
    archived: false,
    resolvedAt: isDone ? now : undefined,
  };
}

/** A copied decision gets the next number in its project and starts as a fresh proposal. */
function decisionClone(clone: Decision, projectId: string): void {
  clone.number = nextDecisionNumber(storage.getAll("decisions", projectId));
  clone.status = "proposed";
  delete clone.supersededBy;
}

export function cloneAsset(
  type: AssetType,
  item: StoredAsset,
  targetProjectId: string,
  placement: ClonePlacement
): StoredAsset {
  const now = new Date().toISOString();
  const copy = structuredClone(item) as StoredAsset & { example?: boolean; createdAt: string; updatedAt?: string };
  delete copy.example;
  Object.assign(copy, { id: uuid(), projectId: targetProjectId, createdAt: now });
  if ("updatedAt" in item) copy.updatedAt = now;
  const nameField = TITLED_TYPES.includes(type) ? "title" : "name";
  Object.assign(copy, { [nameField]: uniqueName(getAssetName(type, item), takenNames(type, targetProjectId)) });
  if (type === "story") (copy as StoryEntry).links = [];
  if (type === "decision") decisionClone(copy as Decision, targetProjectId);
  return type === "issue" ? issueClone(copy as Issue, targetProjectId, placement) : copy;
}

export function duplicateAsset(projectId: string, ref: AssetRef): AssetRef | null {
  const item = getStoredAsset(projectId, ref);
  if (!item) return null;
  const copy = cloneAsset(ref.type, item, projectId, "in-place");
  storage.save(collectionOf(ref.type), copy as never, projectId);
  return { type: ref.type, id: copy.id };
}

export function renameAsset(projectId: string, ref: AssetRef, name: string): void {
  const trimmed = name.trim();
  const item = getStoredAsset(projectId, ref);
  if (!trimmed || !item) return;
  const field = TITLED_TYPES.includes(ref.type) ? "title" : "name";
  const renamed = { ...item, [field]: trimmed, updatedAt: new Date().toISOString() };
  storage.save(collectionOf(ref.type), renamed as never, projectId);
}

function tilemapUses(map: TilemapData, spriteId: string): boolean {
  return map.tilesetSpriteIds.includes(spriteId) || map.layers.some((l) => l.tiles.some((row) => row.includes(spriteId)));
}

function diagramUses(diagram: Diagram, ref: AssetRef): boolean {
  return diagram.nodes.some((node) => (node.data?.asset as AssetRef | undefined)?.id === ref.id);
}

export function findReferences(projectId: string, ref: AssetRef): AssetSummary[] {
  const isSprite = ref.type === "sprite";
  const tilemaps = isSprite ? storage.getAll("tilemaps", projectId).filter((m) => tilemapUses(m, ref.id)) : [];
  const sheets = isSprite ? storage.getAll("spritesheets", projectId).filter((s) => s.spriteIds.includes(ref.id)) : [];
  const diagrams = storage.getAll("diagrams", projectId).filter((d) => diagramUses(d, ref));
  return [
    ...tilemaps.map((m) => summarize("tilemap", m)),
    ...sheets.map((s) => summarize("spritesheet", s)),
    ...diagrams.map((d) => summarize("diagram", d)),
  ];
}

export function deleteConfirmMessage(projectId: string, ref: AssetRef): string {
  const base = `Delete “${nameOf(projectId, ref)}”? Its links are removed too.`;
  const users = findReferences(projectId, ref);
  if (users.length === 0) return base;
  return `${base}\n\nUsed in ${users.map((u) => u.name).join(", ")}. Those spots stay empty.`;
}

function stripStoryLinks(projectId: string, ref: AssetRef): void {
  for (const entry of storage.getAll("stories", projectId)) {
    if (!(entry.links ?? []).some((l) => l.targetId === ref.id)) continue;
    const links = entry.links.filter((l) => l.targetId !== ref.id);
    storage.save("stories", { ...entry, links, updatedAt: new Date().toISOString() }, projectId);
  }
}

export function deleteAsset(projectId: string, ref: AssetRef): void {
  storage.delete(collectionOf(ref.type), ref.id, projectId);
  stripStoryLinks(projectId, ref);
  removeAssetPin(projectId, ref);
}

function assetNode(projectId: string, ref: AssetRef, x: number, y: number): DiagramNode {
  return {
    id: uuid(),
    type: "asset",
    x,
    y,
    width: DIAGRAM_NODE_WIDTH,
    height: DIAGRAM_NODE_HEIGHT,
    label: nameOf(projectId, ref),
    data: { asset: ref },
  };
}

function nextNodePosition(nodes: DiagramNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  const rightmost = nodes.reduce((best, n) => (n.x + n.width > best.x + best.width ? n : best));
  return { x: rightmost.x + rightmost.width + DIAGRAM_NODE_GAP, y: rightmost.y };
}

export function addAssetToDiagram(projectId: string, diagramId: string, ref: AssetRef): Diagram | null {
  const diagram = storage.getById("diagrams", diagramId, projectId);
  if (!diagram) return null;
  const { x, y } = nextNodePosition(diagram.nodes);
  const next = {
    ...diagram,
    nodes: [...diagram.nodes, assetNode(projectId, ref, x, y)],
    updatedAt: new Date().toISOString(),
  };
  storage.save("diagrams", next, projectId);
  return next;
}

export function createDiagramWith(projectId: string, ref: AssetRef): Diagram {
  const now = new Date().toISOString();
  const diagram: Diagram = {
    id: uuid(),
    projectId,
    name: `${nameOf(projectId, ref)} canvas`,
    nodes: [assetNode(projectId, ref, 0, 0)],
    edges: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("diagrams", diagram, projectId);
  return diagram;
}

export function createNoteAbout(projectId: string, ref: AssetRef): Note {
  const now = new Date().toISOString();
  const note: Note = {
    id: uuid(),
    projectId,
    title: `Notes on ${nameOf(projectId, ref)}`,
    content: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.save("notes", note, projectId);
  addLink(projectId, { type: "note", id: note.id }, ref);
  return note;
}

export function createTaskFor(projectId: string, ref: AssetRef): Issue {
  const board = storage.getAll("boards", projectId)[0] ?? createDefaultBoard(projectId);
  const { issue } = createIssue(projectId, board, { title: nameOf(projectId, ref) });
  addLink(projectId, { type: "issue", id: issue.id }, ref);
  return issue;
}

function dialogueText(tree: DialogueTree): string {
  return tree.nodes
    .filter((node) => node.text)
    .flatMap((node) => [
      node.speaker ? `${node.speaker}: ${node.text}` : (node.text as string),
      ...(node.choices ?? []).map((choice) => `- ${choice.text}`),
    ])
    .join("\n");
}

export function systemClipboardPayload(type: AssetType, item: StoredAsset): ClipboardPayload {
  switch (type) {
    case "sprite":
      return { kind: "png", dataUrl: (item as Sprite).frames[0]?.pixels ?? "" };
    case "palette":
      return { kind: "text", text: (item as Palette).colors.join("\n") };
    case "note":
    case "story":
      return { kind: "text", text: (item as Note | StoryEntry).content };
    case "dialogue":
      return { kind: "text", text: dialogueText(item as DialogueTree) };
    case "issue":
      return { kind: "text", text: `${(item as Issue).key} ${(item as Issue).title}` };
    case "decision":
      return { kind: "text", text: decisionToMarkdown(item as Decision, storage.getAll("decisions", (item as Decision).projectId)) };
    default:
      return { kind: "text", text: getAssetName(type, item) };
  }
}

export function assetUrl(origin: string, projectId: string, ref: AssetRef): string {
  return origin + assetHref(projectId, ref.type, ref.id);
}
