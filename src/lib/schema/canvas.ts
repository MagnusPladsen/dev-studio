import { z } from "zod";
import { safeWebUrl } from "@/lib/diagrams/cards";
import { id, projectRow, tags } from "./common";
import { assetRefSchema } from "./projects";

const checklistData = z.looseObject({
  items: z.array(z.looseObject({ id, text: z.string(), done: z.boolean() })).optional(),
});

/** Pasted or dropped pictures are kept as data URLs; anything else must be a web address. */
const imageSource = z.string().refine((src) => src.startsWith("data:image/") || !!safeWebUrl(src), "Image source must be a picture or a web address");

const imageData = z.looseObject({ src: imageSource.optional(), aspect: z.number().positive().optional() });

const linkData = z.looseObject({
  url: z.string().refine((url) => !!safeWebUrl(url), "Links must be http or https web addresses").optional(),
  preview: z.looseObject({ title: z.string().optional(), description: z.string().optional(), image: z.string().optional(), siteName: z.string().optional() }).optional(),
});

const assetData = z.looseObject({ asset: assetRefSchema.optional() });

/** Freehand strokes keep their points as compact `[x, y]` pairs inside the box they were drawn in. */
const drawingData = z.looseObject({
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  box: z.looseObject({ width: z.number().positive(), height: z.number().positive() }).optional(),
});

export const tableColumnSchema = z.looseObject({
  id,
  name: z.string(),
  type: z.string(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
});

const tableData = z.looseObject({ columns: z.array(tableColumnSchema).optional() });

/** Cards whose `data` is free-form: text cards, flow shapes and plain shapes. */
const freeData = z.record(z.string(), z.unknown());

export const NODE_DATA_SCHEMAS = {
  state: freeData,
  action: freeData,
  condition: freeData,
  event: freeData,
  note: freeData,
  custom: freeData,
  group: freeData,
  rectangle: freeData,
  ellipse: freeData,
  diamond: freeData,
  checklist: checklistData,
  image: imageData,
  link: linkData,
  asset: assetData,
  drawing: drawingData,
  table: tableData,
} as const;

export type CanvasNodeKind = keyof typeof NODE_DATA_SCHEMAS;
export const NODE_KINDS = Object.keys(NODE_DATA_SCHEMAS) as CanvasNodeKind[];

const nodeFields = {
  id,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  label: z.string(),
  color: z.string().optional(),
};

function nodeVariant<K extends CanvasNodeKind>(kind: K) {
  return z.looseObject({ ...nodeFields, type: z.literal(kind), data: NODE_DATA_SCHEMAS[kind].optional() });
}

export const diagramNodeSchema = z.discriminatedUnion(
  "type",
  NODE_KINDS.map(nodeVariant) as unknown as [ReturnType<typeof nodeVariant>, ...ReturnType<typeof nodeVariant>[]]
);

export const diagramEdgeSchema = z.looseObject({
  id,
  from: id,
  to: id,
  label: z.string().optional(),
  type: z.enum(["arrow", "line", "dashed"]),
  fromRow: z.string().min(1).optional(),
  toRow: z.string().min(1).optional(),
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]).optional(),
});

type ParsedNode = z.infer<typeof diagramNodeSchema>;
type ParsedEdge = z.infer<typeof diagramEdgeSchema>;

function tableColumnIds(node: ParsedNode): string[] {
  if (node.type !== "table") return [];
  const columns = (node.data as { columns?: { id: string }[] } | undefined)?.columns ?? [];
  return columns.map((column) => column.id);
}

function checkNodes(nodes: ParsedNode[], issue: (message: string, path: (string | number)[]) => void): void {
  const seen = new Set<string>();
  nodes.forEach((node, index) => {
    if (seen.has(node.id)) issue(`Duplicate element id ${node.id}`, ["nodes", index, "id"]);
    seen.add(node.id);
    const columnIds = tableColumnIds(node);
    if (new Set(columnIds).size !== columnIds.length) issue(`Table ${node.id} has duplicate column ids`, ["nodes", index, "data", "columns"]);
  });
}

function checkEdgeEnd(nodesById: Map<string, ParsedNode>, nodeId: string, row: string | undefined): string | null {
  const node = nodesById.get(nodeId);
  if (!node) return `points to a missing element ${nodeId}`;
  if (row !== undefined && !tableColumnIds(node).includes(row)) return `points to a missing table row ${row}`;
  return null;
}

function checkEdges(nodes: ParsedNode[], edges: ParsedEdge[], issue: (message: string, path: (string | number)[]) => void): void {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  edges.forEach((edge, index) => {
    const fromProblem = checkEdgeEnd(nodesById, edge.from, edge.fromRow);
    if (fromProblem) issue(`Line ${edge.id} ${fromProblem}`, ["edges", index, "from"]);
    const toProblem = checkEdgeEnd(nodesById, edge.to, edge.toRow);
    if (toProblem) issue(`Line ${edge.id} ${toProblem}`, ["edges", index, "to"]);
  });
}

export const diagramSchema = z
  .looseObject({
    ...projectRow,
    name: z.string(),
    nodes: z.array(diagramNodeSchema),
    edges: z.array(diagramEdgeSchema),
    tags,
  })
  .superRefine((diagram, context) => {
    const issue = (message: string, path: (string | number)[]) => context.addIssue({ code: "custom", message, path });
    checkNodes(diagram.nodes, issue);
    checkEdges(diagram.nodes, diagram.edges, issue);
  });
