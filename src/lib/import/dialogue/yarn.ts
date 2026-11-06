import { v4 as uuid } from "uuid";
import type { DialogueNode, DialogueSet, DialogueTree, DialogueValue, DialogueVariable } from "@/types";
import { ImportError, type Importer } from "@/lib/import/types";
import { assertFileSize } from "@/lib/import/file-size";
import { layOutDialogue } from "./dialogue-layout";
import { parseYarn, type YarnStatement } from "./yarn-parse";
import { conditionCheck } from "@/lib/dialogue/logic";

const MAX_BYTES = 1024 * 1024;

/** Somewhere a connection still has to be made: called with the id of the node it should lead to. */
type Exit = (targetId: string) => void;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** `$has_key` → `has_key`, the inverse of how the Yarn export writes a bare variable. */
const readCondition = (condition: string) => condition.replace(/^\$([A-Za-z_]\w*)$/, "$1");

/** A Yarn literal: true/false, a number or a "quoted string"; null for anything else (an expression). */
function readLiteral(text: string): DialogueValue | null {
  const trimmed = text.trim();
  if (/^(true|false)$/.test(trimmed)) return trimmed === "true";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const quoted = /^"((?:[^"\\]|\\.)*)"$/.exec(trimmed);
  return quoted ? quoted[1].replace(/\\(.)/g, "$1") : null;
}

const typeOf = (value: DialogueValue): DialogueVariable["type"] => (typeof value === "boolean" ? "bool" : typeof value === "number" ? "number" : "string");

/** `set $gold to 5`, `set $gold to $gold + 2` (or `- 2`), `set $met to !$met` as a set; null when it's anything else. */
function readSet(command: string): DialogueSet | null {
  const match = /^set\s+\$([A-Za-z_]\w*)\s+(?:to|=)\s+(.+)$/.exec(command);
  if (!match) return null;
  const [, variable, expression] = match;
  const literal = readLiteral(expression);
  if (literal !== null) return { variable, op: "set", value: literal };
  if (new RegExp(`^(!|not\\s+)\\$${variable}$`).test(expression.trim())) return { variable, op: "toggle" };
  const added = new RegExp(`^\\$${variable}\\s*([+-])\\s*(\\d+(?:\\.\\d+)?)$`).exec(expression.trim());
  return added ? { variable, op: "add", value: Number(added[2]) * (added[1] === "-" ? -1 : 1) } : null;
}

/** Turns parsed Yarn nodes into one dialogue tree's nodes, wiring jumps once every node exists. */
class DialogueBuilder {
  nodes: DialogueNode[] = [];
  entries = new Map<string, string>();
  jumps: { exits: Exit[]; target: string }[] = [];
  variables = new Map<string, DialogueVariable>();
  dynamicJumps = 0;

  /** Declares a variable the first time it shows up; a <<declare>> always sets its type and default. */
  declare(name: string, value: DialogueValue, isDeclaration = false) {
    if (this.variables.has(name) && !isDeclaration) return;
    this.variables.set(name, { name, type: typeOf(value), defaultValue: value });
  }

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
        const declared = /^declare\s+\$([A-Za-z_]\w*)\s*=\s*(.+?)(?:\s+as\s+\w+)?$/.exec(statement.text);
        const value = declared && readLiteral(declared[2]);
        if (declared && value !== null) {
          this.declare(declared[1], value, true);
          return pending;
        }
        const set = readSet(statement.text);
        if (set) this.declare(set.variable, set.op === "toggle" ? false : set.op === "add" ? 0 : set.value!);
        const node = this.add({ type: "action", text: statement.text, ...(set ? { set } : {}) }, pending);
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

  /** An if / elseif / else chain: each condition's else exit leads to the next condition, or the else block. */
  private ifBlock(branches: { condition: string | null; body: YarnStatement[] }[], pending: Exit[]): Exit[] {
    let entry = pending;
    const exits: Exit[] = [];
    for (const branch of branches) {
      if (branch.condition === null) return [...exits, ...this.build(branch.body, entry)];
      const condition = readCondition(branch.condition);
      this.guessVariable(condition);
      const node = this.add({ type: "condition", condition, text: condition }, entry);
      exits.push(...this.build(branch.body, [(id) => (node.nextId = id)]));
      entry = [(id) => (node.elseId = id)];
    }
    return [...exits, ...entry];
  }

  /** `has_key`, `not $has_key`, `$gold >= 5`: a variable nothing declared gets the type the condition implies. */
  private guessVariable(condition: string) {
    const flag = /^(?:!|not\s+)?\$?([A-Za-z_]\w*)$/.exec(condition.trim());
    if (flag) return this.declare(flag[1], false);
    const compared = /^\$([A-Za-z_]\w*)\s*(?:==|!=|<=|>=|<|>|is)\s*(.+)$/.exec(condition.trim());
    const value = compared && readLiteral(compared[2]);
    if (compared && value !== null) this.declare(compared[1], typeOf(value) === "string" ? "" : typeOf(value) === "number" ? 0 : false);
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
  if (missing.length) warnings.push(`Jumps to nodes that aren't in the file were left unconnected: ${missing.join(", ")}.`);
  if (builder.dynamicJumps) warnings.push(`${plural(builder.dynamicJumps, "jump uses", "jumps use")} a variable as the target and ${builder.dynamicJumps === 1 ? "was" : "were"} left out.`);
  if (counts.conditionalLines) warnings.push(`${plural(counts.conditionalLines, "line or option had its", "lines or options had their")} <<if>> condition removed; they always show.`);
  if (counts.unclosedIfs) warnings.push(`${plural(counts.unclosedIfs, "<<if>> has", "<<if>>s have")} no <<endif>>; ${counts.unclosedIfs === 1 ? "it ends" : "they end"} with ${counts.unclosedIfs === 1 ? "its" : "their"} block.`);
  if (counts.strayCommands) warnings.push(`Skipped ${plural(counts.strayCommands, "<<else>> or <<endif>>", "<<else>>s or <<endif>>s")} outside an <<if>>.`);
  return warnings;
}

/** Conditions on known variables get a `check`, so Preview can play them. */
function withChecks(nodes: DialogueNode[], variables: DialogueVariable[]): DialogueNode[] {
  return nodes.map((node) => {
    const check = node.type === "condition" ? conditionCheck(node, variables) : null;
    return check ? { ...node, check } : node;
  });
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
  const variables = [...builder.variables.values()];

  const now = new Date().toISOString();
  const tree: DialogueTree = {
    id: uuid(),
    projectId: "",
    name: treeName(text, fileName),
    nodes: layOutDialogue(withChecks(builder.nodes, variables)),
    ...(variables.length ? { variables } : {}),
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
