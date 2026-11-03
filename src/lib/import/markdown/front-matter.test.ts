import { describe, expect, it } from "vitest";
import { textFile } from "@/lib/import/test-helpers";
import { readMarkdown, tagsOf, titleAndBody } from "./front-matter";
import { fromObsidian } from "./obsidian";

describe("Markdown front matter", () => {
  it("reads scalars, inline lists, dash lists and booleans", () => {
    const { data, body } = readMarkdown('---\r\ntitle: "Hello: world"\r\ntags: [a, "#b"]\r\naliases:\r\n  - x\r\n  - y\r\npinned: true\r\n---\r\nBody');
    expect(data).toEqual({ title: "Hello: world", tags: ["a", "#b"], aliases: ["x", "y"], pinned: true });
    expect(body).toBe("Body");
    expect(tagsOf(data)).toEqual(["a", "b"]);
    expect(tagsOf({ tags: "#one two, three" })).toEqual(["one", "two", "three"]);
  });

  it("uses the file name as title and drops a heading that repeats it", () => {
    expect(titleAndBody(textFile("", "Ideas.md"), readMarkdown("# Ideas\n\nText"))).toEqual({ title: "Ideas", body: "Text" });
    expect(titleAndBody(textFile("", "x.md"), readMarkdown("# Other\nText")).body).toBe("# Other\nText");
  });

  it("points heading links at the note and drops file embeds", () => {
    expect(fromObsidian("See [[A#Part|alias]] and [[B#C]].\n![[pic.png]]\n![[clip.mp3|200]]\nEnd")).toEqual({ body: "See [[A|alias]] and [[B]].\nEnd", droppedEmbeds: 2 });
  });
});
