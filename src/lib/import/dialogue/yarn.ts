import { v4 as uuid } from "uuid";
import type { DialogueNode, DialogueTree } from "@/types";
import { ImportError, type Importer } from "@/lib/import/types";
import { assertFileSize } from "@/lib/import/file-size";
import { layOutDialogue } from "./dialogue-layout";
import { parseYarn, type YarnStatement } from "./yarn-parse";

const MAX_BYTES = 1024 * 1024;

/** Somewhere a connection still has to be made: called with the id of the node it should lead to. */
type Exit = (targetId: string) => void;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** `$has_key` → `has_key`, the inverse of how the Yarn export writes a bare variable. */
const readCondition = (condition: string) => condition.replace(/^\$([A-Za-z_]\w*)$/, "$1");

/** Turns parsed Yarn nodes into one dialogue tree's nodes, wiring jumps once every node exists. */
class DialogueBuilder {
  nodes: DialogueNode[] = [];
  /** For layout: else-branch conditions sit next to the `if` they belong to. */
  near = new Map<string, string>();
  entries = new Map<string, string>();
  jumps: { exits: Exit[]; target: string }[] = [];
  elseBranches = 0;
  dynamicJumps = 0;

  add(node: Omit<DialogueNode, "id" | "x" | "y">, pending: Exit[]): DialogueNode {
    const created: DialogueNode = { id: uuid(), x: 0, y: 0, ...node };
    pending.forEach((exit) => exit(created.id));
    this.nodes.push(created);
    return created;
  }

  /** Builds `statements` after `pending`, returning the exits that lead on to whatever comes next. */
  build(statements: YarnStatement[], pending: Exit[]): Exit[] {
    let exits = pending;
    for (let index = 0; index < statements.length; index++) {
      const statement = statements[index];
      const next = statements[index + 1];
      // a narrator line right before options is the choice's prompt, as the Yarn export writes it
      if (statement.kind === "line" && !statement.speaker && next?.kind === "options") {
        exits = this.options(next, exits, statement.text);
        index++;
      } else exits = this.statement(statement, exits);
    }
    return exits;
  }

  private options(statement: Extract<YarnStatement, { kind: "options" }>, pending: Exit[], prompt?: string): Exit[] {
    const node = this.add({ type: "choice", text: prompt, choices: statement.options.map((option) => ({ text: option.text, targetId: "" })) }, pending);
    return statement.options.flatMap((option, index) => this.build(option.body, [(id) => (node.choices![index].targetId = id)]));
  }

  private statement(statement: YarnStatement, pending: Exit[]): Exit[] {
    switch (statement.kind) {
      case "line": {
        const node = this.add({ type: "dialogue", speaker: statement.speaker, text: statement.text }, pending);
        return [(id) => (node.nextId = id)];
      }
      case "command": {
        const node = this.add({ type: "action", text: statement.text }, pending);
        return [(id) => (node.nextId = id)];
      }
      case "stop":
        this.add({ type: "end" }, pending);
        return [];
      case "jump":
        if (statement.target) this.jumps.push({ exits: pending, target: statement.target });
        else this.dynamicJumps++;
        return [];
      case "options":
        return this.options(statement, pending);
      case "if":
        return this.ifBlock(statement.branches, pending);
    }
  }

  /** The app's condition node has one exit, so each else/elseif becomes its own "not …" condition, unconnected. */
  private ifBlock(branches: { condition: string | null; body: YarnStatement[] }[], pending: Exit[]): Exit[] {
    const earlier: string[] = [];
    let first: DialogueNode | null = null;
    return branches.flatMap((branch) => {
      const parts = [...earlier.map((condition) => `not (${condition})`), ...(branch.condition ? [readCondition(branch.condition)] : [])];
      const condition = parts.join(" and ");
      const node = this.add({ type: "condition", condition, text: condition }, first ? [] : pending);
      if (first) {
        this.elseBranches++;
        this.near.set(node.id, first.id);
      } else first = node;
      if (branch.condition) earlier.push(readCondition(branch.condition));
      return this.build(branch.body, [(id) => (node.nextId = id)]);
    });
  }

  /** Connects every jump to its node's first dialogue node. Returns the titles that weren't in the file. */
  resolveJumps(): string[] {
    for (let progress = true; progress; ) {
      progress = false;
      this.jumps = this.jumps.filter(({ exits, target }) => {
        const id = this.entries.get(target);
        if (!id) return true;
        exits.forEach((exit) => exit(id));
        progress = true;
        return false;
      });
    }
    return [...new Set(this.jumps.map((jump) => jump.target))];
  }
}

function warningsFor(builder: DialogueBuilder, missing: string[], counts: ReturnType<typeof parseYarn>["counts"]): string[] {
  const warnings: string[] = [];
  if (builder.elseBranches) {
    warnings.push(`Conditions here have one exit, so ${plural(builder.elseBranches, "else branch became a separate “not …” condition", "else branches became separate “not …” conditions")} with nothing leading in. Connect them where you need them.`);
  }
  if (missing.length) warnings.push(`Jumps to nodes that aren't in the file were left unconnected: ${missing.join(", ")}.`);
  if (builder.dynamicJumps) warnings.push(`${plural(builder.dynamicJumps, "jump uses", "jumps use")} a variable as the target and ${builder.dynamicJumps === 1 ? "was" : "were"} left out.`);
  if (counts.conditionalLines) warnings.push(`${plural(counts.conditionalLines, "line or option had its", "lines or options had their")} <<if>> condition removed; they always show.`);
  if (counts.unclosedIfs) warnings.push(`${plural(counts.unclosedIfs, "<<if>> has", "<<if>>s have")} no <<endif>>; ${counts.unclosedIfs === 1 ? "it ends" : "they end"} with ${counts.unclosedIfs === 1 ? "its" : "their"} block.`);
  if (counts.strayCommands) warnings.push(`Skipped ${plural(counts.strayCommands, "<<else>> or <<endif>>", "<<else>>s or <<endif>>s")} outside an <<if>>.`);
  return warnings;
}

function treeName(text: string, fileName: string): string {
  const exported = /^\s*\/\/\s*(.+?), exported from /.exec(text);
  return exported?.[1] ?? (fileName.replace(/\.[^.]+$/, "") || "Imported dialogue");
}

/** Converts a Yarn Spinner script into one dialogue tree, starting at the node titled "Start" (or the first). */
export function yarnToDialogue(text: string, fileName: string): { tree: DialogueTree; warnings: string[] } {
  const script = parseYarn(text);
  if (script.nodes.length === 0) throw new ImportError("This isn't a Yarn Spinner script: it has no nodes. A node starts with “title:” and “---” and ends with “===”.");
  const builder = new DialogueBuilder();
  const start = builder.add({ type: "start" }, []);
  const startTitle = script.nodes.find((node) => node.title.toLowerCase() === "start")?.title ?? script.nodes[0].title;
  builder.jumps.push({ exits: [(id) => (start.nextId = id)], target: startTitle });

  for (const node of script.nodes) {
    if (builder.entries.has(node.title)) continue;
    let isEntered = false;
    const enter: Exit = (id) => {
      if (isEntered) return;
      isEntered = true;
      builder.entries.set(node.title, id);
    };
    const exits = builder.build(node.body, [enter]);
    if (!isEntered && exits.includes(enter)) builder.add({ type: "end" }, exits);
  }
  const missing = builder.resolveJumps();

  const now = new Date().toISOString();
  const tree: DialogueTree = {
    id: uuid(),
    projectId: "",
    name: treeName(text, fileName),
    nodes: layOutDialogue(builder.nodes, builder.near),
    tags: ["yarn"],
    createdAt: now,
    updatedAt: now,
  };
  return { tree, warnings: warningsFor(builder, missing, script.counts) };
}

/** Yarn Spinner 2 scripts as a new dialogue. */
export const yarnImporter: Importer<DialogueTree> = {
  id: "yarn",
  label: "Yarn Spinner (.yarn)",
  description: "Nodes, lines, options, jumps and <<if>>, as a new dialogue",
  accept: [".yarn", ".yarn.txt"],
  async parse(file) {
    assertFileSize(file, MAX_BYTES);
    const { tree, warnings } = yarnToDialogue(await file.text(), file.name.replace(/\.yarn(\.txt)?$/i, ".yarn"));
    return { items: [tree], warnings };
  },
};
