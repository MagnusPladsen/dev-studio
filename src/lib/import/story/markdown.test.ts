import { describe, expect, it } from "vitest";
import { runImporterOnFiles } from "@/lib/import";
import { vaultFiles } from "@/lib/import/markdown/vault-fixture";
import { entryTypeFrom, storyFolderImporter } from "./markdown";

async function importVault() {
  const outcome = await runImporterOnFiles(storyFolderImporter, vaultFiles());
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.result;
}

describe("Wiki Markdown import", () => {
  it("makes one entry per note with front-matter title, type and tags", async () => {
    const { items } = await importVault();
    expect(items.map((entry) => entry.title)).toEqual(["Mira", "Harbor Town", "Sprint notes"]);
    expect(items[0]).toMatchObject({ type: "character", tags: ["crew", "pilot"], links: [] });
    expect(items[1]).toMatchObject({ type: "note", tags: ["place", "coast"], content: "Fog most mornings. The ferry leaves from the north pier." });
  });

  it("keeps [[wiki links]] by title and drops heading anchors and picture embeds", async () => {
    const [mira] = (await importVault()).items;
    expect(mira.content).toBe("Pilot of the *Kestrel*. Grew up in [[Harbor Town]] and owes [[Old Joss|Joss]] money.");
  });

  it("skips non-Markdown files and the .obsidian folder, and says what it changed", async () => {
    expect((await importVault()).warnings).toEqual([
      'Skipped 1 file this tool can\'t read: "mira-portrait.png"',
      "Left out 1 embedded picture or file (![[…]]); only Markdown text is imported",
      "1 file has a type the wiki doesn't know, so it was filed under Other",
    ]);
  });

  it("knows the entry types by value and by either app's name", () => {
    expect(entryTypeFrom("quest")).toBe("quest");
    expect(entryTypeFrom("Person")).toBe("character");
    expect(entryTypeFrom("system")).toBe("location");
    expect(entryTypeFrom("Spaceship")).toBeNull();
  });
});
