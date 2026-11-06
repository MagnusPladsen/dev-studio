import type { DialogueCheck, DialogueNode, DialogueSet, DialogueTree, DialogueValue } from "@/types";
import { choiceTextId } from "./localisation";

const TITLE_PREFIX: Record<DialogueNode["type"], string> = {
  start: "Start",
  dialogue: "Dialogue",
  choice: "Choice",
  condition: "Condition",
  action: "Action",
  end: "End",
};

function yarnValue(value: DialogueValue | undefined): string {
  if (typeof value === "string") return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return String(value ?? 0);
}

function yarnCheck(check: DialogueCheck): string {
  if (check.op === "==" && check.value === true) return `$${check.variable}`;
  if (check.op === "==" && check.value === false) return `!$${check.variable}`;
  return `$${check.variable} ${check.op} ${yarnValue(check.value)}`;
}

function yarnSet(set: DialogueSet): string {
  if (set.op === "toggle") return `<<set $${set.variable} to !$${set.variable}>>`;
  if (set.op === "add" && typeof set.value === "number" && set.value < 0) return `<<set $${set.variable} to $${set.variable} - ${-set.value}>>`;
  if (set.op === "add") return `<<set $${set.variable} to $${set.variable} + ${yarnValue(set.value)}>>`;
  return `<<set $${set.variable} to ${yarnValue(set.value)}>>`;
}

/** `#line:` tags give each line the same id as its row in the Localisation CSV. */
const lineTag = (id: string) => ` #line:${id.replace(/[^\w.-]/g, "_")}`;

/**
 * Converts a tree to Yarn Spinner script: one Yarn node per tree node, choices as -> options, variables as
 * <<declare>>, sets as <<set>> and conditions as <<if>> / <<else>>.
 */
export function toYarn(tree: DialogueTree): string {
  const titles = new Map<string, string>();
  tree.nodes.forEach((n, i) => {
    titles.set(n.id, n.type === "start" ? "Start" : `${TITLE_PREFIX[n.type]}_${i}`.replace(/[^A-Za-z0-9_]/g, "_"));
  });
  const jump = (id?: string) => (id && titles.has(id) ? `<<jump ${titles.get(id)}>>` : "<<stop>>");
  const cond = (c: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? `$${c}` : c);
  const blocks = tree.nodes.map((n) => {
    const body: string[] = [];
    if (n.type === "start") {
      for (const variable of tree.variables ?? []) body.push(`<<declare $${variable.name} = ${yarnValue(variable.defaultValue)}>>`);
      body.push(jump(n.nextId));
    } else if (n.type === "end") body.push("<<stop>>");
    else if (n.type === "dialogue") body.push(`${n.speaker ? `${n.speaker}: ` : ""}${n.text ?? ""}${lineTag(n.id)}`, jump(n.nextId));
    else if (n.type === "choice") {
      if (n.text) body.push(`${n.text}${lineTag(n.id)}`);
      (n.choices ?? []).forEach((c, index) => body.push(`-> ${c.text}${lineTag(choiceTextId(n, c, index))}`, `    ${jump(c.targetId)}`));
    } else if (n.type === "condition") {
      const test = n.check ? yarnCheck(n.check) : cond(n.condition || n.text || "true");
      body.push(`<<if ${test}>>`, `    ${jump(n.nextId)}`, "<<else>>", `    ${jump(n.elseId)}`, "<<endif>>");
    } else if (n.type === "action") body.push(n.set ? yarnSet(n.set) : `<<${n.text || "action"}>>`, jump(n.nextId));
    return `title: ${titles.get(n.id)}\n---\n${body.join("\n")}\n===`;
  });
  return `// ${tree.name}, exported from GameDev Studio\n${blocks.join("\n\n")}\n`;
}
