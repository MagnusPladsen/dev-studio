import { describe, expect, it } from "vitest";
import { runImporterOnFiles } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { vaultFiles } from "@/lib/import/markdown/vault-fixture";
import { notebookFolderImporter, notebookMarkdownImporter } from "./markdown";

describe("Notebook Markdown import", () => {
  it("turns a folder into notes, with sub-folders as note folders", async () => {
    const outcome = await runImporterOnFiles(notebookFolderImporter, vaultFiles());
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.items.map((note) => [note.title, note.folder])).toEqual([["Mira", ""], ["Harbor Town", ""], ["Sprint notes", "Design"]]);
  });

  it("keeps checklists in the Notebook's own form, with tags and pinned", async () => {
    const outcome = await runImporterOnFiles(notebookFolderImporter, vaultFiles());
    const sprint = outcome.ok ? outcome.result.items[2] : undefined;
    expect(sprint).toMatchObject({ pinned: true, tags: ["meeting", "sprint"], content: "- [x] Fix the jump buffer\n- [ ] Record footsteps\n- [ ] Ask [[Mira]] about the ferry" });
  });

  it("imports picked files without folders, and an empty file as an empty note", async () => {
    const outcome = await runImporterOnFiles(notebookMarkdownImporter, [textFile("", "Empty.md", "text/markdown"), textFile("- [ ] one", "Todo.md", "")]);
    expect(outcome.ok && outcome.result.items.map((note) => [note.title, note.content, note.folder, note.pinned])).toEqual([["Empty", "", "", false], ["Todo", "- [ ] one", "", false]]);
  });
});
