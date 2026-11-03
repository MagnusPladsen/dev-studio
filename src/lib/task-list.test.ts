import { describe, expect, it } from "vitest";
import { parseTask, taskProgress, toggleTask } from "./task-list";

const text = "Steps\n- [ ] Write spec\n- [x] Draw flow\n  * [X] Nested done\n- plain item\n-[ ] not a task";

describe("parseTask", () => {
  it("reads open and done tasks with - or * bullets", () => {
    expect(parseTask("- [ ] Write spec", 3)).toEqual({ line: 3, done: false, text: "Write spec" });
    expect(parseTask("  * [X] Nested", 0)).toEqual({ line: 0, done: true, text: "Nested" });
  });

  it("ignores plain list items and malformed boxes", () => {
    expect(parseTask("- plain item", 0)).toBeNull();
    expect(parseTask("-[ ] no space", 0)).toBeNull();
    expect(parseTask("- [ ]", 0)).toBeNull();
  });
});

describe("taskProgress", () => {
  it("counts done and total tasks", () => {
    expect(taskProgress(text)).toEqual({ done: 2, total: 3 });
  });

  it("is zero for text without tasks", () => {
    expect(taskProgress("Just a description")).toEqual({ done: 0, total: 0 });
  });
});

describe("toggleTask", () => {
  it("ticks an open task and unticks a done one", () => {
    expect(toggleTask(text, 1).split("\n")[1]).toBe("- [x] Write spec");
    expect(toggleTask(text, 3).split("\n")[3]).toBe("  * [ ] Nested done");
  });

  it("leaves every other line untouched", () => {
    const lines = toggleTask(text, 2).split("\n");
    expect(lines.filter((_, i) => i !== 2)).toEqual(text.split("\n").filter((_, i) => i !== 2));
  });

  it("returns the text unchanged for a line that is not a task", () => {
    expect(toggleTask(text, 0)).toBe(text);
    expect(toggleTask(text, 99)).toBe(text);
  });
});
