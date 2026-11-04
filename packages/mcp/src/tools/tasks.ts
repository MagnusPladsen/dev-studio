import * as z from "zod";
import type { AssetRef, Diagram, DiagramNode, Issue, Note, StoryEntry } from "@/types";
import { saveIssue } from "@/lib/board";
import { getShape } from "@/lib/canvas-shapes";
import { checklistItems } from "@/lib/diagrams/cards";
import { storage, type ProjectCollection } from "@/lib/storage";
import { parseTask, toggleTask } from "@/lib/task-list";
import { assetRefSchema, assetUrl, collectionOf, projectIdSchema, requireProject, requireRef } from "../refs";
import { fenced } from "../format";
import { guarded, result, WRITES, type ToolContext } from "./context";

/** One `- [ ]` line of a text, or one item of a canvas checklist; `number` is what Claude passes back to pick it. */
interface Task {
  number: number;
  text: string;
  done: boolean;
}

const CHECKABLE = ["issue", "note", "story", "diagram"] as const;

function textTasks(text: string): Task[] {
  return text.split("\n").flatMap((line, index) => {
    const task = parseTask(line, index);
    return task ? [{ number: index + 1, text: task.text, done: task.done }] : [];
  });
}

/** By number, by exact text, or by a unique part of the text. */
function pickTask(tasks: Task[], wanted: string | number): Task {
  const list = () => tasks.map((t) => `${t.number}: [${t.done ? "x" : " "}] ${t.text}`).join("; ") || "none";
  if (typeof wanted === "number") {
    const task = tasks.find((t) => t.number === wanted);
    if (!task) throw new Error(`No task at ${wanted}. Tasks: ${list()}.`);
    return task;
  }
  const lower = wanted.trim().toLowerCase();
  const exact = tasks.filter((t) => t.text.trim().toLowerCase() === lower);
  const hits = exact.length ? exact : tasks.filter((t) => t.text.toLowerCase().includes(lower));
  if (hits.length === 1) return hits[0];
  throw new Error(`${hits.length ? `"${wanted}" matches ${hits.length} tasks` : `No task matches "${wanted}"`}. Pass its number. Tasks: ${list()}.`);
}

function checklistNode(diagram: Diagram, elementId: string | undefined): DiagramNode {
  if (!elementId) throw new Error("On a canvas, pass the checklist element's elementId.");
  const node = diagram.nodes.find((n) => n.id === elementId);
  if (!node || getShape(node.type).body !== "checklist") throw new Error(`Element ${elementId} is not a checklist.`);
  return node;
}

function checkCanvasTask(projectId: string, diagram: Diagram, elementId: string | undefined, wanted: string | number, done: boolean): Task[] {
  const node = checklistNode(diagram, elementId);
  const items = checklistItems(node);
  const task = pickTask(items.map((item, index) => ({ number: index + 1, text: item.text, done: item.done })), wanted);
  const nextItems = items.map((item, index) => (index + 1 === task.number ? { ...item, done } : item));
  if (task.done !== done) {
    const nodes = diagram.nodes.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, items: nextItems } } : n));
    storage.save("diagrams", { ...diagram, nodes, updatedAt: new Date().toISOString() }, projectId);
  }
  return nextItems.map((item, index) => ({ number: index + 1, text: item.text, done: item.done }));
}

function textOf(ref: AssetRef, item: unknown): string {
  return ref.type === "issue" ? (item as Issue).description : (item as Note | StoryEntry).content;
}

function saveText(projectId: string, ref: AssetRef, item: unknown, text: string): void {
  if (ref.type === "issue") {
    saveIssue(projectId, storage.getAll("boards", projectId)[0], item as Issue, { description: text });
    return;
  }
  const collection = ref.type === "note" ? "notes" : "stories";
  storage.save(collection, { ...(item as Note & StoryEntry), content: text, updatedAt: new Date().toISOString() }, projectId);
}

function checkTask(projectId: string, ref: AssetRef, wanted: string | number, done: boolean): Task[] {
  requireRef(projectId, ref);
  const item = storage.getById(collectionOf(ref.type), ref.id, projectId)!;
  if (ref.type === "diagram") return checkCanvasTask(projectId, item as Diagram, ref.elementId, wanted, done);
  const text = textOf(ref, item);
  const task = pickTask(textTasks(text), wanted);
  if (task.done === done) return textTasks(text);
  const next = toggleTask(text, task.number - 1);
  saveText(projectId, ref, item, next);
  return textTasks(next);
}

export function registerCheckTaskTool(ctx: ToolContext): void {
  ctx.server.registerTool(
    "check_task",
    {
      title: "Check task",
      description:
        "Ticks or unticks one checklist task: a - [ ] line in an issue, note or wiki/story page, or an item of a canvas checklist element. Pick it by number (line number in the text, item number on a canvas) or by its text.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        ref: assetRefSchema.describe("The issue, note, story or canvas (with the checklist's elementId)."),
        task: z.union([z.number().int().min(1), z.string().trim().min(1).max(500)]),
        done: z.boolean(),
      }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    ({ projectId, ref, task, done }) =>
      guarded(async () => {
        if (!(CHECKABLE as readonly string[]).includes(ref.type)) throw new Error("Checklists live in issues, notes, wiki/story pages and canvas checklist elements.");
        const scope: ProjectCollection[] = ref.type === "issue" ? ["boards", "issues"] : [collectionOf(ref.type)];
        const { tasks, url } = await ctx.studio.write({ projectId, collections: scope }, () => ({
          tasks: checkTask(projectId, ref, task, done),
          url: assetUrl(requireProject(projectId), ref),
        }));
        const progress = { done: tasks.filter((t) => t.done).length, total: tasks.length };
        const lines = tasks.map((t) => `${t.number}. [${t.done ? "x" : " "}] ${t.text}`).join("\n");
        return result(`${progress.done}/${progress.total} done.\n${fenced("the checklist", lines)}\n\nOpen: ${url}`, { progress, tasks, url });
      })
  );
}
