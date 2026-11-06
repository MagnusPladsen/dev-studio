import { describe, expect, it } from "vitest";
import type { DialogueNode, DialogueTree } from "@/types";
import { yarnToDialogue } from "@/lib/import/dialogue/yarn";
import { toYarn } from "./yarn-export";

const tree: DialogueTree = {
  id: "t",
  projectId: "p",
  name: "Shop",
  variables: [
    { name: "gold", type: "number", defaultValue: 5 },
    { name: "met", type: "bool", defaultValue: false },
  ],
  tags: [],
  createdAt: "",
  updatedAt: "",
  nodes: [
    { id: "s", type: "start", x: 0, y: 0, nextId: "rich" },
    { id: "rich", type: "condition", x: 0, y: 0, check: { variable: "gold", op: ">=", value: 3 }, nextId: "pay", elseId: "poor" },
    { id: "pay", type: "action", x: 0, y: 0, set: { variable: "gold", op: "add", value: -3 }, nextId: "flag" },
    { id: "flag", type: "action", x: 0, y: 0, set: { variable: "met", op: "toggle" }, nextId: "thanks" },
    { id: "thanks", type: "dialogue", x: 0, y: 0, speaker: "Tobb", text: "Thanks!" },
    { id: "poor", type: "dialogue", x: 0, y: 0, speaker: "Tobb", text: "No coin, no rope." },
  ],
};

describe("Yarn export", () => {
  it("writes declares, sets, if/else and line ids", () => {
    const yarn = toYarn(tree);
    expect(yarn).toContain("<<declare $gold = 5>>\n<<declare $met = false>>");
    expect(yarn).toContain("<<if $gold >= 3>>\n    <<jump Action_2>>\n<<else>>\n    <<jump Dialogue_5>>\n<<endif>>");
    expect(yarn).toContain("<<set $gold to $gold - 3>>");
    expect(yarn).toContain("<<set $met to !$met>>");
    expect(yarn).toContain("Tobb: Thanks! #line:thanks");
  });

  it("reads back with the same variables, sets and branches", () => {
    const { tree: copy, warnings } = yarnToDialogue(toYarn(tree), "shop.yarn");
    expect(warnings).toEqual([]);
    expect(copy.variables).toEqual(tree.variables);
    const byId = new Map(copy.nodes.map((node) => [node.id, node]));
    const at = (id?: string) => byId.get(id!) as DialogueNode;
    const rich = at(copy.nodes[0].nextId);
    expect(rich.check).toEqual({ variable: "gold", op: ">=", value: 3 });
    expect(at(rich.elseId)).toMatchObject({ text: "No coin, no rope." });
    const pay = at(rich.nextId);
    expect(pay.set).toEqual({ variable: "gold", op: "add", value: -3 });
    expect(at(pay.nextId).set).toEqual({ variable: "met", op: "toggle" });
    expect(at(at(pay.nextId).nextId)).toMatchObject({ speaker: "Tobb", text: "Thanks!" });
  });
});
