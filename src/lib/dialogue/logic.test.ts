import { describe, expect, it } from "vitest";
import type { DialogueNode, DialogueTree, DialogueVariable } from "@/types";
import { applySet, conditionCheck, evaluateCheck, playFrom, removeVariable, renameVariable, startingValues } from "./logic";

const VARIABLES: DialogueVariable[] = [
  { name: "gold", type: "number", defaultValue: 3 },
  { name: "met_elder", type: "bool", defaultValue: false },
  { name: "title", type: "string", defaultValue: "Pip" },
];

const tree = (nodes: DialogueNode[], variables = VARIABLES): DialogueTree => ({ id: "t", projectId: "p", name: "Test", nodes, variables, tags: [], createdAt: "", updatedAt: "" });
const node = (id: string, type: DialogueNode["type"], extra: Partial<DialogueNode> = {}): DialogueNode => ({ id, type, x: 0, y: 0, ...extra });

describe("condition evaluation", () => {
  const values = startingValues({ variables: VARIABLES });

  it("compares numbers, flags and text", () => {
    expect(values).toEqual({ gold: 3, met_elder: false, title: "Pip" });
    expect(evaluateCheck({ variable: "gold", op: ">=", value: 3 }, values, VARIABLES)).toBe(true);
    expect(evaluateCheck({ variable: "gold", op: ">", value: 3 }, values, VARIABLES)).toBe(false);
    expect(evaluateCheck({ variable: "gold", op: "<", value: 10 }, values, VARIABLES)).toBe(true);
    expect(evaluateCheck({ variable: "gold", op: "!=", value: 3 }, values, VARIABLES)).toBe(false);
    expect(evaluateCheck({ variable: "met_elder", op: "==", value: false }, values, VARIABLES)).toBe(true);
    expect(evaluateCheck({ variable: "title", op: "==", value: "Pip" }, values, VARIABLES)).toBe(true);
  });

  it("reads values typed as text in the variable's type", () => {
    expect(evaluateCheck({ variable: "gold", op: "==", value: "3" }, values, VARIABLES)).toBe(true);
    expect(evaluateCheck({ variable: "met_elder", op: "==", value: "false" }, values, VARIABLES)).toBe(true);
  });

  it("turns older free-text conditions on known variables into a check, and leaves the rest to the game", () => {
    expect(conditionCheck(node("c", "condition", { condition: "met_elder" }), VARIABLES)).toEqual({ variable: "met_elder", op: "==", value: true });
    expect(conditionCheck(node("c", "condition", { condition: "not met_elder" }), VARIABLES)).toEqual({ variable: "met_elder", op: "==", value: false });
    expect(conditionCheck(node("c", "condition", { condition: "$gold >= 5" }), VARIABLES)).toEqual({ variable: "gold", op: ">=", value: 5 });
    expect(conditionCheck(node("c", "condition", { condition: 'title = "Sir Pip"' }), VARIABLES)).toEqual({ variable: "title", op: "==", value: "Sir Pip" });
    expect(conditionCheck(node("c", "condition", { condition: "is_night" }), VARIABLES)).toBeNull();
    expect(conditionCheck(node("c", "condition", { condition: "player.hp < 3 and boss_dead" }), VARIABLES)).toBeNull();
  });
});

describe("sets", () => {
  const values = startingValues({ variables: VARIABLES });

  it("sets, adds and toggles", () => {
    expect(applySet({ variable: "gold", op: "set", value: 10 }, values, VARIABLES).gold).toBe(10);
    expect(applySet({ variable: "gold", op: "add", value: -2 }, values, VARIABLES).gold).toBe(1);
    expect(applySet({ variable: "met_elder", op: "toggle" }, values, VARIABLES).met_elder).toBe(true);
    expect(applySet({ variable: "title", op: "add", value: " the Brave" }, values, VARIABLES).title).toBe("Pip the Brave");
    expect(applySet({ variable: "gold", op: "set", value: "7" }, values, VARIABLES).gold).toBe(7);
  });

  it("ignores sets on variables that don't exist and never changes the values it was given", () => {
    expect(applySet({ variable: "missing", op: "set", value: 1 }, values, VARIABLES)).toBe(values);
    applySet({ variable: "gold", op: "set", value: 99 }, values, VARIABLES);
    expect(values.gold).toBe(3);
  });

  it("renames and removes variables with the nodes that use them", () => {
    const original = tree([node("c", "condition", { check: { variable: "gold", op: ">", value: 1 } }), node("a", "action", { set: { variable: "gold", op: "add", value: 1 } })]);
    const renamed = renameVariable(original, "gold", "coins");
    expect(renamed.variables?.[0].name).toBe("coins");
    expect(renamed.nodes.map((entry) => entry.check?.variable ?? entry.set?.variable)).toEqual(["coins", "coins"]);
    const removed = removeVariable(renamed, "coins");
    expect(removed.variables?.map((variable) => variable.name)).toEqual(["met_elder", "title"]);
    expect(removed.nodes[0]).toMatchObject({ check: undefined, condition: "coins > 1" });
    expect(removed.nodes[1]).toMatchObject({ set: undefined, text: "coins + 1" });
  });
});

describe("play-through", () => {
  const shop = tree([
    node("s", "start", { nextId: "pay" }),
    node("pay", "action", { set: { variable: "gold", op: "add", value: -5 }, nextId: "rich" }),
    node("rich", "condition", { check: { variable: "gold", op: ">=", value: 0 }, nextId: "yes", elseId: "no" }),
    node("yes", "dialogue", { text: "Here you go." }),
    node("no", "dialogue", { text: "Come back with coin." }),
  ]);

  it("runs sets and follows the true or else exit until a line", () => {
    expect(playFrom(shop, "s", startingValues(shop))).toEqual({ nodeId: "no", values: { gold: -2, met_elder: false, title: "Pip" }, isLooping: false });
    expect(playFrom(shop, "s", { ...startingValues(shop), gold: 10 }).nodeId).toBe("yes");
  });

  it("ends when an exit leads nowhere, and stops on loops of hidden nodes", () => {
    const open = tree([node("s", "start", { nextId: "c" }), node("c", "condition", { check: { variable: "met_elder", op: "==", value: true }, nextId: "x" })]);
    expect(playFrom(open, "s", startingValues(open))).toMatchObject({ nodeId: null, isLooping: false });
    const loop = tree([node("a", "action", { set: { variable: "gold", op: "add", value: 1 }, nextId: "b" }), node("b", "action", { set: { variable: "gold", op: "add", value: 1 }, nextId: "a" })]);
    expect(playFrom(loop, "a", startingValues(loop))).toMatchObject({ nodeId: null, isLooping: true });
  });

  it("plays old single-exit conditions: true takes the exit, false ends; free text waits for the player", () => {
    const old = tree(
      [node("s", "start", { nextId: "c" }), node("c", "condition", { condition: "met_elder", text: "met_elder", nextId: "line" }), node("line", "dialogue", { text: "Welcome back." })],
      [{ name: "met_elder", type: "bool", defaultValue: true }]
    );
    expect(playFrom(old, "s", startingValues(old)).nodeId).toBe("line");
    expect(playFrom(old, "s", { met_elder: false }).nodeId).toBeNull();
    const noVariables = { ...old, variables: undefined };
    expect(playFrom(noVariables, "s", {}).nodeId).toBe("c");
  });
});
