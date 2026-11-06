import { describe, expect, it } from "vitest";
import { createHistoryStacks, recordChange, stepHistory, type HistoryStacks } from "./history";

/**
 * Plays the editor's side: every new value it shows goes through `recordChange`, like `useHistory`'s
 * effect, which React skips when the value is identical to the one already shown.
 */
function editor(initial: string, { cloneOnApply = false } = {}) {
  const stacks: HistoryStacks<{ text: string }> = createHistoryStacks({ text: initial });
  let shown = stacks.last;
  const show = (value: { text: string }, isInBurst = false) => {
    if (Object.is(value, shown)) return "unchanged";
    shown = value;
    return recordChange(stacks, value, isInBurst);
  };
  const step = (direction: "undo" | "redo") => {
    const target = stepHistory(stacks, direction);
    if (target) show(cloneOnApply ? { ...target } : target);
  };
  return {
    stacks,
    edit: (text: string, isInBurst = false) => show({ text }, isInBurst),
    show,
    undo: () => step("undo"),
    redo: () => step("redo"),
    text: () => shown.text,
  };
}

describe("history stacks", () => {
  it("should give the edit after an undo its own step", () => {
    const e = editor("a");
    e.edit("b");
    e.edit("c");
    e.undo();
    expect(e.text()).toBe("b");
    expect(e.edit("x")).toBe("newStep");
    e.undo();
    expect(e.text()).toBe("b");
    e.undo();
    expect(e.text()).toBe("a");
  });

  it("should give the edit after a redo its own step", () => {
    const e = editor("a");
    e.edit("b");
    e.undo();
    e.redo();
    expect(e.text()).toBe("b");
    e.edit("c");
    e.undo();
    expect(e.text()).toBe("b");
  });

  it("should keep steps when the editor hands back a copy of the undone value", () => {
    const e = editor("a", { cloneOnApply: true });
    e.edit("b");
    e.edit("c");
    e.undo();
    e.edit("x");
    e.undo();
    expect(e.text()).toBe("b");
  });

  it("should clear redo when a new edit follows an undo", () => {
    const e = editor("a");
    e.edit("b");
    e.edit("c");
    e.undo();
    expect(e.stacks.future).toHaveLength(1);
    e.edit("x");
    expect(e.stacks.future).toHaveLength(0);
    e.redo();
    expect(e.text()).toBe("x");
  });

  it("should merge edits into one step when made during a burst", () => {
    const e = editor("a");
    expect(e.edit("b")).toBe("newStep");
    expect(e.edit("bb", true)).toBe("merged");
    expect(e.edit("bbb", true)).toBe("merged");
    expect(e.stacks.past).toHaveLength(1);
    e.undo();
    expect(e.text()).toBe("a");
    e.redo();
    expect(e.text()).toBe("bbb");
  });

  it("should keep undo steps when a burst of edits follows an undo", () => {
    const e = editor("a");
    e.edit("b");
    e.undo();
    e.edit("x");
    e.edit("xx", true);
    e.undo();
    expect(e.text()).toBe("a");
  });

  it("should record the next edit when an undo puts back the value already shown", () => {
    const e = editor("a");
    const first = e.stacks.last;
    e.edit("b");
    e.show(first, true);
    e.undo();
    expect(e.edit("x")).toBe("newStep");
  });

  it("should do nothing when there is nothing to undo or redo", () => {
    const e = editor("a");
    e.undo();
    e.redo();
    expect(e.text()).toBe("a");
    expect(e.edit("b")).toBe("newStep");
  });
});
