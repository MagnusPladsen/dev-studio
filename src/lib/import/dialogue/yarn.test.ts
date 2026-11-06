import { describe, expect, it } from "vitest";
import type { DialogueNode, DialogueTree } from "@/types";
import { runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { yarnImporter } from "./yarn";

const SHOP = `title: Start
tags: intro
position: 0,0
---
// the shopkeeper greets you
Mira: Welcome to the Rusty Anchor! #line:a1
<<set $visits to $visits + 1>>
What do you want?
-> Buy a lantern
    Mira: That'll be 5 gold.
    <<if $gold >= 5>>
        <<set $gold to $gold - 5>>
        Mira: Mind the wick.
    <<elseif $has_coupon>>
        Mira: A coupon? Fine.
    <<else>>
        Mira: Come back with coin.
    <<endif>>
-> Ask about the lighthouse <<if $heard_rumour>>
    <<jump Lighthouse>>
-> Leave
    <<stop>>
Mira: Safe travels.
===
title: Lighthouse
---
Mira: Nobody's been up there for years.
<<jump Missing>>
===
`;

async function importYarn(text: string, name = "shop.yarn") {
  const outcome = await runImporter(yarnImporter, textFile(text, name, "text/plain"));
  if (!outcome.ok) throw new Error(outcome.message);
  return { tree: outcome.result.items[0], warnings: outcome.result.warnings };
}

/** Follows the tree from the start: each step is "type: speaker/text", choices list their own paths. */
function byId(tree: DialogueTree) {
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  return (id?: string) => (id ? nodes.get(id) : undefined) as DialogueNode;
}

describe("Yarn Spinner import", () => {
  it("turns lines, options, commands, ifs and jumps into connected nodes", async () => {
    const { tree, warnings } = await importYarn(SHOP);
    const node = byId(tree);
    expect(tree.name).toBe("shop");

    const start = tree.nodes[0];
    expect(start.type).toBe("start");
    const greeting = node(start.nextId);
    expect(greeting).toMatchObject({ type: "dialogue", speaker: "Mira", text: "Welcome to the Rusty Anchor!" });
    const visit = node(greeting.nextId);
    expect(visit).toMatchObject({ type: "action", text: "set $visits to $visits + 1" });
    const choice = node(visit.nextId);
    expect(choice.type).toBe("choice");
    expect(choice.text).toBe("What do you want?");
    expect(choice.choices?.map((option) => option.text)).toEqual(["Buy a lantern", "Ask about the lighthouse", "Leave"]);

    const price = node(choice.choices![0].targetId);
    expect(price.text).toBe("That'll be 5 gold.");
    const condition = node(price.nextId);
    expect(condition).toMatchObject({ type: "condition", condition: "$gold >= 5" });
    expect(node(condition.nextId)).toMatchObject({ type: "action", text: "set $gold to $gold - 5" });
    expect(condition.check).toEqual({ variable: "gold", op: ">=", value: 5 });
    const elseIf = node(condition.elseId);
    expect(elseIf).toMatchObject({ type: "condition", condition: "has_coupon", check: { variable: "has_coupon", op: "==", value: true } });
    expect(node(elseIf.nextId).text).toBe("A coupon? Fine.");
    expect(node(elseIf.elseId).text).toBe("Come back with coin.");
    expect(tree.variables).toEqual([
      { name: "visits", type: "number", defaultValue: 0 },
      { name: "gold", type: "number", defaultValue: 0 },
      { name: "has_coupon", type: "bool", defaultValue: false },
    ]);

    // every branch of the shop meets again at the goodbye line
    const goodbye = tree.nodes.find((entry) => entry.text === "Safe travels.")!;
    const intoGoodbye = tree.nodes.filter((entry) => entry.nextId === goodbye.id).map((entry) => entry.text);
    expect(intoGoodbye.sort()).toEqual(["A coupon? Fine.", "Come back with coin.", "Mind the wick."]);

    const lighthouse = node(choice.choices![1].targetId);
    expect(lighthouse.text).toBe("Nobody's been up there for years.");
    expect(lighthouse.nextId).toBeUndefined();
    expect(node(choice.choices![2].targetId).type).toBe("end");

    expect(warnings).toEqual([
      "Jumps to nodes that aren't in the file were left unconnected: Missing.",
      "1 line or option had its <<if>> condition removed; they always show.",
    ]);
  });

  it("lays nodes out in columns without overlaps", async () => {
    const { tree } = await importYarn(SHOP);
    expect(tree.nodes[0]).toMatchObject({ x: 100, y: 100 });
    const positions = new Set(tree.nodes.map((node) => `${node.x},${node.y}`));
    expect(positions.size).toBe(tree.nodes.length);
  });

  it("reads the Yarn this app exports, starting at Start and skipping jump-only nodes", async () => {
    const exported = `// Guard post, exported from GameDev Studio
title: Start
---
<<jump Dialogue_1>>
===

title: Dialogue_1
---
Guard: Halt!
<<jump Choice_2>>
===

title: Choice_2
---
Who goes there?
-> A friend
    <<jump Condition_3>>
-> Nobody
    <<stop>>
===

title: Condition_3
---
<<if $has_pass>>
    <<jump End_4>>
<<endif>>
<<stop>>
===

title: End_4
---
<<stop>>
===
`;
    const { tree, warnings } = await importYarn(exported, "guard.yarn");
    const node = byId(tree);
    expect(warnings).toEqual([]);
    expect(tree.name).toBe("Guard post");
    const halt = node(tree.nodes[0].nextId);
    expect(halt).toMatchObject({ speaker: "Guard", text: "Halt!" });
    const choice = node(halt.nextId);
    expect(choice).toMatchObject({ type: "choice", text: "Who goes there?" });
    const condition = node(choice.choices![0].targetId);
    expect(condition).toMatchObject({ type: "condition", condition: "has_pass" });
    expect(node(condition.nextId).type).toBe("end");
    expect(node(choice.choices![1].targetId).type).toBe("end");
  });

  it("rejects files without nodes, and too-big files", async () => {
    expect(await runImporter(yarnImporter, textFile("Just some notes.", "notes.yarn"))).toEqual({ ok: false, message: expect.stringContaining("isn't a Yarn Spinner script") });
    expect(await runImporter(yarnImporter, textFile("x".repeat(1024 * 1024 + 1), "big.yarn"))).toEqual({ ok: false, message: expect.stringContaining("is too big") });
  });
});
