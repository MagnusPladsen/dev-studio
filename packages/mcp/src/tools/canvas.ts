import * as z from "zod";
import { v4 as uuid } from "uuid";
import type { Diagram, Project } from "@/types";
import { assetTypesFor } from "@/lib/assets";
import { appConfigFor } from "@/lib/app-config";
import { canvasTemplatesFor, type TemplateId } from "@/lib/canvas-shapes/templates";
import { applyLayout, autoLayout } from "@/lib/diagrams/auto-layout";
import { storage } from "@/lib/storage";
import { normalizeTag } from "@/lib/tags";
import { AliasBook } from "../canvas/aliases";
import { layoutSchema, MAX_OPS, opSchema } from "../canvas/op-schema";
import { editCanvas, type EditOutcome } from "../canvas/ops";
import { canvasOutline } from "../canvas/outline";
import { nodeOf, startWork } from "../canvas/work";
import { assetUrl, projectApp, projectIdSchema, requireProject } from "../refs";
import { guarded, READ_ONLY, result, WRITES, type ToolContext } from "./context";

const TEMPLATE_IDS = ["blank", "flow-chart", "architecture", "moodboard"] as const satisfies readonly TemplateId[];
/** Canvas edits check asset cards and element links, so they load every collection (art and audio by name only). */
const EDIT_SCOPE = "all" as const;

const canvasHandle = z.string().min(1).max(200).describe("The canvas id, or its exact name.");
const opsSchema = z.array(opSchema).max(MAX_OPS);

function canvasProject(projectId: string): Project {
  const project = requireProject(projectId);
  if (!assetTypesFor(projectApp(project)).includes("diagram")) throw new Error(`${appConfigFor(projectApp(project)).name} projects have no canvases.`);
  return project;
}

function findCanvas(projectId: string, handle: string): Diagram {
  const canvases = storage.getAll("diagrams", projectId);
  const byId = canvases.find((d) => d.id === handle);
  if (byId) return byId;
  const named = canvases.filter((d) => d.name.trim().toLowerCase() === handle.trim().toLowerCase());
  if (named.length > 1) throw new Error(`${named.length} canvases are called "${handle}". Pass the canvas id.`);
  if (!named.length) throw new Error(`No canvas "${handle}" in this project. list_assets with type diagram shows them.`);
  return named[0];
}

function cleanTags(tags: string[] = []): string[] {
  return [...new Set(tags.map((t) => normalizeTag("note", t)).filter(Boolean))];
}

function editResult(project: Project, outcome: EditOutcome, aliases: AliasBook, verb: string) {
  const { diagram } = outcome;
  const url = assetUrl(project, { type: "diagram", id: diagram.id });
  const outline = canvasOutline(diagram, aliases, "outline", outcome.changed);
  const handleOf = new Map([
    ...diagram.nodes.map((n) => [n.id, aliases.ofNode(diagram.id, n)] as const),
    ...diagram.edges.map((e) => [e.id, aliases.ofLine(diagram.id, e.id)] as const),
  ]);
  const refs = Object.fromEntries(Object.entries(outcome.refs).map(([ref, id]) => [ref, { alias: handleOf.get(id) ?? id, id }]));
  const refLine = Object.entries(refs).map(([ref, r]) => `${ref} = ${r.alias}`).join(", ");
  const text = [
    `${verb} canvas "${diagram.name}": ${outcome.changed.size} element(s) and line(s) changed. Open: ${url}`,
    refLine && `Handles: ${refLine}`,
    outline.text,
    ...outcome.warnings.map((w) => `Note: ${w}`),
  ].filter(Boolean).join("\n");
  return result(text, { canvas: { id: diagram.id, name: diagram.name }, url, refs, nodes: outline.nodes, lines: outline.lines, warnings: outcome.warnings });
}

function newCanvas(project: Project, name: string, template: TemplateId, tags: string[]): Diagram {
  const chosen = canvasTemplatesFor(projectApp(project)).find((t) => t.id === template)!;
  const now = new Date().toISOString();
  return { id: uuid(), projectId: project.id, name, ...chosen.build(uuid), tags: cleanTags(tags), createdAt: now, updatedAt: now };
}

export function registerCanvasTools(ctx: ToolContext): void {
  const { server, studio } = ctx;
  const aliases = new AliasBook();

  server.registerTool(
    "get_canvas",
    {
      title: "Get canvas",
      description:
        "Reads a canvas as a compact outline: one line per element (handle, kind, name, position and size, table columns, to-do items) and per line. Handles like t1, n2, e3 stay the same for the session; use them in edit_canvas.",
      inputSchema: z.object({ projectId: projectIdSchema, canvas: canvasHandle, detail: z.enum(["outline", "full"]).optional().describe('"full" adds colours and full text.') }),
      annotations: READ_ONLY,
    },
    ({ projectId, canvas, detail }) =>
      guarded(async () => {
        const read = await studio.read({ projectId, collections: ["diagrams"] }, () => {
          const project = canvasProject(projectId);
          const diagram = findCanvas(projectId, canvas);
          return { url: assetUrl(project, { type: "diagram", id: diagram.id }), diagram, outline: canvasOutline(diagram, aliases, detail) };
        });
        const { diagram, outline, url } = read;
        return result(`${outline.text}\nOpen: ${url}`, { canvas: { id: diagram.id, name: diagram.name, tags: diagram.tags }, url, nodes: outline.nodes, lines: outline.lines, bounds: outline.bounds });
      })
  );

  server.registerTool(
    "create_canvas",
    {
      title: "Create canvas",
      description:
        "Makes a new canvas, from a template or blank, and can fill it in the same call with edit_canvas ops (e.g. ERD tables plus relation lines for a data model). The server places elements; never compute coordinates.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        name: z.string().trim().min(1).max(200),
        template: z.enum(TEMPLATE_IDS).optional().describe("Starting cards; default blank."),
        tags: z.array(z.string().max(100)).max(30).optional(),
        ops: opsSchema.optional(),
        layout: layoutSchema.optional(),
      }),
      annotations: WRITES,
    },
    ({ projectId, name, template, tags, ops, layout }) =>
      guarded(async () => {
        const { project, outcome } = await studio.write({ projectId, collections: EDIT_SCOPE }, () => {
          const project = canvasProject(projectId);
          const diagram = newCanvas(project, name, template ?? "blank", tags ?? []);
          return { project, outcome: editCanvas(projectId, diagram, ops ?? [], aliases, layout) };
        });
        return editResult(project, { ...outcome, changed: new Set([...outcome.diagram.nodes, ...outcome.diagram.edges].map((e) => e.id)) }, aliases, "Created");
      })
  );

  server.registerTool(
    "edit_canvas",
    {
      title: "Edit canvas",
      description: [
        "Changes a canvas with a list of ops, all or nothing: add, update, move, delete (an element and its lines), connect, update_line, disconnect, group.",
        'Refer to elements by a ref given earlier in the same call, a handle from get_canvas (t1), the real id, or the exact name; a table row is "users.team_id".',
        "Leave out `at` and the server places new elements (near/side, in a group, or laid out as one block right of what is there). Elements already on the canvas never move unless an op moves them.",
        'Data model: add kind table with columns [{ name, type, pk, fk }], then connect "orders.user_id" → "users.id" (many-to-one by default).',
      ].join(" "),
      inputSchema: z.object({ projectId: projectIdSchema, canvas: canvasHandle, ops: opsSchema.min(1), layout: layoutSchema.optional() }),
      annotations: WRITES,
    },
    ({ projectId, canvas, ops, layout }) =>
      guarded(async () => {
        const { project, outcome } = await studio.write({ projectId, collections: EDIT_SCOPE }, () => {
          const project = canvasProject(projectId);
          return { project, outcome: editCanvas(projectId, findCanvas(projectId, canvas), ops, aliases, layout) };
        });
        return editResult(project, outcome, aliases, "Edited");
      })
  );

  server.registerTool(
    "layout_canvas",
    {
      title: "Lay out canvas",
      description:
        "Rearranges elements the user asked to tidy: erd (tables by foreign keys), flow (layered by lines), tree or grid. This moves elements, so only use it when the user asks to arrange or tidy them. Pass elements, or everything: true.",
      inputSchema: z.object({
        projectId: projectIdSchema,
        canvas: canvasHandle,
        elements: z.array(z.string().min(1).max(200)).max(MAX_OPS).optional().describe("Handles, ids or names; a group brings its members."),
        everything: z.boolean().optional().describe("Lay out the whole canvas."),
        algorithm: z.enum(["auto", "grid", "flow", "tree", "erd"]).optional(),
        direction: z.enum(["right", "down"]).optional(),
        spacing: z.number().min(0).max(400).optional(),
      }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    ({ projectId, canvas, elements, everything, algorithm, direction, spacing }) =>
      guarded(async () => {
        if (!everything && !elements?.length) throw new Error("Pass elements to arrange, or everything: true.");
        const { project, outcome } = await studio.write({ projectId, collections: EDIT_SCOPE }, () => {
          const project = canvasProject(projectId);
          const diagram = findCanvas(projectId, canvas);
          const work = startWork(projectId, diagram, aliases);
          const place = everything ? undefined : elements!.map((h) => nodeOf(work, h).id);
          const rects = autoLayout(diagram.nodes, diagram.edges, { algorithm, direction, spacing, place });
          const saved = { ...diagram, nodes: applyLayout(diagram.nodes, rects), updatedAt: new Date().toISOString() };
          storage.save("diagrams", saved, projectId);
          return { project, outcome: { diagram: saved, refs: {}, changed: new Set(rects.keys()), warnings: [] } };
        });
        return editResult(project, outcome, aliases, "Arranged");
      })
  );
}
