import { describe, expect, it } from "vitest";
import { isEqual, mergeBodies, mergeText } from "./merge";

const node = (id: string, label: string, x = 0) => ({ id, type: "rect", label, x });

describe("mergeBodies", () => {
  it("takes each side's change to different fields", () => {
    const base = { id: "a", title: "Plan", status: "todo", points: 1 };
    const merged = mergeBodies(base, { ...base, title: "Plan v2" }, { ...base, status: "done" });
    expect(merged).toEqual({ id: "a", title: "Plan v2", status: "done", points: 1 });
  });

  it("lets the local edit win when both changed the same field", () => {
    const base = { id: "a", title: "Plan" };
    expect(mergeBodies(base, { id: "a", title: "Mine" }, { id: "a", title: "Theirs" }).title).toBe("Mine");
  });

  it("keeps fields added or removed by one side", () => {
    const base = { id: "a", dueDate: "2026-11-10" } as Record<string, unknown>;
    const merged = mergeBodies(base, { id: "a" }, { id: "a", dueDate: "2026-11-10", points: 3 });
    expect(merged).toEqual({ id: "a", points: 3 });
  });

  it("merges canvas nodes by id: both sides' additions, edits to different nodes, deletes win", () => {
    const base = { id: "c", nodes: [node("n1", "A"), node("n2", "B"), node("n3", "C")] };
    const mine = { id: "c", nodes: [node("n1", "A", 40), node("n2", "B"), node("n4", "Mine")] }; // moved n1, deleted n3, added n4
    const theirs = { id: "c", nodes: [node("n1", "A"), node("n2", "B!"), node("n3", "C2"), node("n5", "Claude")] }; // edited n2 and n3, added n5
    expect(mergeBodies(base, mine, theirs).nodes).toEqual([
      node("n1", "A", 40),
      node("n2", "B!"),
      node("n5", "Claude"), // after n2, its nearest neighbour that survived
      node("n4", "Mine"),
    ]);
  });

  it("drops a node the other side deleted, even if we edited it", () => {
    const base = { id: "c", nodes: [node("n1", "A"), node("n2", "B")] };
    const merged = mergeBodies(base, { id: "c", nodes: [node("n1", "A2"), node("n2", "B")] }, { id: "c", nodes: [node("n2", "B")] });
    expect(merged.nodes).toEqual([node("n2", "B")]);
  });

  it("inserts the other side's new element after its neighbour", () => {
    const base = { id: "b", items: [node("a", "1"), node("c", "3")] };
    const merged = mergeBodies(base, { id: "b", items: [node("a", "1"), node("c", "3!")] }, { id: "b", items: [node("a", "1"), node("b", "2"), node("c", "3")] });
    expect(merged.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("merges tags as sets", () => {
    const base = { id: "a", tags: ["x", "y"] };
    expect(mergeBodies(base, { id: "a", tags: ["x", "y", "mine"] }, { id: "a", tags: ["y", "theirs"] }).tags).toEqual(["y", "mine", "theirs"]);
  });

  it("merges multi-line text by line", () => {
    const base = { id: "n", content: "# Notes\n- one\n- two" };
    const mine = { id: "n", content: "# Notes\n- one (done)\n- two" };
    const theirs = { id: "n", content: "# Notes\n- one\n- two\n- three from Claude" };
    expect(mergeBodies(base, mine, theirs).content).toBe("# Notes\n- one (done)\n- two\n- three from Claude");
  });

  it("without a base, keeps both sides' elements", () => {
    const merged = mergeBodies(undefined, { id: "c", nodes: [node("n1", "A")] }, { id: "c", nodes: [node("n2", "B")] });
    expect(merged.nodes.map((n) => n.id)).toEqual(["n2", "n1"]);
  });
});

describe("mergeText", () => {
  it("keeps both versions where both sides changed the same lines", () => {
    expect(mergeText("a\nb\nc", "a\nB mine\nc", "a\nB theirs\nc")).toBe("a\nB mine\nB theirs\nc");
  });

  it("applies non-overlapping edits from both sides", () => {
    expect(mergeText("1\n2\n3\n4", "0\n1\n2\n3\n4", "1\n2\n3\n4\n5")).toBe("0\n1\n2\n3\n4\n5");
    expect(mergeText("1\n2\n3\n4\n5", "1\n3\n4\n5", "1\n2\n3\n4!\n5")).toBe("1\n3\n4!\n5");
  });
});

describe("isEqual", () => {
  it("ignores key order and undefined fields", () => {
    expect(isEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1, d: undefined })).toBe(true);
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(isEqual([1, 2], [2, 1])).toBe(false);
  });
});
