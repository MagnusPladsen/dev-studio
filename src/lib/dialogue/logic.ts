import type { DialogueCheck, DialogueCompare, DialogueNode, DialogueSet, DialogueTree, DialogueValue, DialogueVariable } from "@/types";

export type DialogueValues = Record<string, DialogueValue>;

export const COMPARE_OPS: DialogueCompare[] = ["==", "!=", "<", "<=", ">", ">="];

/** Letters, digits and _, not starting with a digit: what Yarn and most game code accept as a variable name. */
export function cleanVariableName(name: string): string {
  return name.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").replace(/^(\d)/, "_$1");
}

export function defaultValueFor(type: DialogueVariable["type"]): DialogueValue {
  return type === "bool" ? false : type === "number" ? 0 : "";
}

/** Reads typed-in or imported text as a value of `type` ("yes"/"1" are true, anything not a number is 0). */
export function coerceValue(value: DialogueValue | undefined, type: DialogueVariable["type"]): DialogueValue {
  if (type === "bool") return typeof value === "string" ? ["true", "yes", "1"].includes(value.trim().toLowerCase()) : Boolean(value);
  if (type === "number") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  return value === undefined ? "" : String(value);
}

export function startingValues(tree: Pick<DialogueTree, "variables">): DialogueValues {
  return Object.fromEntries((tree.variables ?? []).map((variable) => [variable.name, coerceValue(variable.defaultValue, variable.type)]));
}

function variableNamed(variables: DialogueVariable[], name: string): DialogueVariable | undefined {
  return variables.find((variable) => variable.name === name);
}

/** Parses a literal written in a condition: true/false, a number, or text with or without quotes. */
function readLiteral(text: string): DialogueValue {
  const trimmed = text.trim();
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

/**
 * The test a condition node runs. Older conditions are free text: `name`, `not name` / `!name` and `name op value`
 * become a test when `name` is one of the variables; anything else returns null (the game's code decides).
 */
export function conditionCheck(node: DialogueNode, variables: DialogueVariable[]): DialogueCheck | null {
  if (node.check) return node.check;
  const text = (node.condition || node.text || "").trim().replace(/\$/g, "");
  const negated = /^(?:not\s+|!)\s*([A-Za-z_]\w*)$/.exec(text);
  const bare = /^([A-Za-z_]\w*)$/.exec(text);
  const compared = /^([A-Za-z_]\w*)\s*(==|!=|<=|>=|<|>|=|is)\s*(.+)$/.exec(text);
  const name = (negated ?? bare ?? compared)?.[1];
  if (!name || !variableNamed(variables, name)) return null;
  if (negated) return { variable: name, op: "==", value: false };
  if (bare) return { variable: name, op: "==", value: true };
  const op = compared![2] === "=" || compared![2] === "is" ? "==" : (compared![2] as DialogueCompare);
  return { variable: name, op, value: readLiteral(compared![3]) };
}

export function evaluateCheck(check: DialogueCheck, values: DialogueValues, variables: DialogueVariable[]): boolean {
  const type = variableNamed(variables, check.variable)?.type ?? (typeof check.value === "boolean" ? "bool" : typeof check.value === "number" ? "number" : "string");
  const current = coerceValue(values[check.variable] ?? defaultValueFor(type), type);
  const expected = coerceValue(check.value, type);
  // order only means something for numbers and text; both sides have the same type here
  const [left, right] = [current, expected] as [number, number];
  switch (check.op) {
    case "==":
      return current === expected;
    case "!=":
      return current !== expected;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

/** The values after an action's set: `set` replaces, `add` adds (or appends text), `toggle` flips true/false. */
export function applySet(set: DialogueSet, values: DialogueValues, variables: DialogueVariable[]): DialogueValues {
  const type = variableNamed(variables, set.variable)?.type;
  if (!type) return values;
  const current = coerceValue(values[set.variable] ?? defaultValueFor(type), type);
  const next =
    set.op === "toggle"
      ? !coerceValue(current, "bool")
      : set.op === "add"
        ? type === "number"
          ? (current as number) + (coerceValue(set.value, "number") as number)
          : type === "string"
            ? `${current}${set.value ?? ""}`
            : coerceValue(set.value, "bool")
        : coerceValue(set.value, type);
  return { ...values, [set.variable]: next };
}

const formatValue = (value: DialogueValue) => (typeof value === "string" ? `"${value}"` : String(value));

/** "gold >= 5", "has_sword", "not has_sword". */
export function describeCheck(check: DialogueCheck): string {
  if (check.value === true && check.op === "==") return check.variable;
  if (check.value === false && check.op === "==") return `not ${check.variable}`;
  return `${check.variable} ${check.op} ${formatValue(check.value)}`;
}

/** "gold = 5", "gold + 2", "toggle met_elder". */
export function describeSet(set: DialogueSet): string {
  if (set.op === "toggle") return `toggle ${set.variable}`;
  return `${set.variable} ${set.op === "add" ? "+" : "="} ${formatValue(set.value ?? "")}`;
}

/** Renames a variable and every condition and set that uses it. */
export function renameVariable(tree: DialogueTree, from: string, to: string): DialogueTree {
  return {
    ...tree,
    variables: tree.variables?.map((variable) => (variable.name === from ? { ...variable, name: to } : variable)),
    nodes: tree.nodes.map((node) => ({
      ...node,
      ...(node.check?.variable === from ? { check: { ...node.check, variable: to } } : {}),
      ...(node.set?.variable === from ? { set: { ...node.set, variable: to } } : {}),
    })),
  };
}

/** How many conditions and sets use a variable. */
export function variableUses(tree: DialogueTree, name: string): number {
  return tree.nodes.filter((node) => node.check?.variable === name || node.set?.variable === name).length;
}

/** Removes a variable; conditions and sets that used it keep their text and become free text for the game's code. */
export function removeVariable(tree: DialogueTree, name: string): DialogueTree {
  return {
    ...tree,
    variables: tree.variables?.filter((variable) => variable.name !== name),
    nodes: tree.nodes.map((node) => {
      if (node.check?.variable === name) return { ...node, check: undefined, condition: describeCheck(node.check), text: describeCheck(node.check) };
      if (node.set?.variable === name) return { ...node, set: undefined, text: describeSet(node.set) };
      return node;
    }),
  };
}

/** Where the preview stops: a node the player sees or decides at, or null at the end of the conversation. */
export interface PlayStop {
  nodeId: string | null;
  values: DialogueValues;
  /** True when the path kept going round without reaching anything to show. */
  isLooping: boolean;
}

const MAX_SILENT_STEPS = 500;

/**
 * Plays from `nodeId` through the nodes the player doesn't see (start, sets, conditions with a test), applying sets
 * and following each condition's true or else exit, until something to show: a line, a choice, an end, an action
 * for the game, or a condition only the game can decide.
 */
export function playFrom(tree: DialogueTree, nodeId: string | undefined, values: DialogueValues): PlayStop {
  const variables = tree.variables ?? [];
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  let current = nodeId ? byId.get(nodeId) : undefined;
  let state = values;
  for (let step = 0; current; step++) {
    if (step > MAX_SILENT_STEPS) return { nodeId: null, values: state, isLooping: true };
    if (current.type === "start") current = current.nextId ? byId.get(current.nextId) : undefined;
    else if (current.type === "action" && current.set) {
      state = applySet(current.set, state, variables);
      current = current.nextId ? byId.get(current.nextId) : undefined;
    } else if (current.type === "condition" && conditionCheck(current, variables)) {
      const exit = evaluateCheck(conditionCheck(current, variables)!, state, variables) ? current.nextId : current.elseId;
      current = exit ? byId.get(exit) : undefined;
    } else return { nodeId: current.id, values: state, isLooping: false };
  }
  return { nodeId: null, values: state, isLooping: false };
}
