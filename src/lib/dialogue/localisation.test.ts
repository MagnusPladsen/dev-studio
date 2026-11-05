import { describe, expect, it } from "vitest";
import type { DialogueNode, DialogueTree } from "@/types";
import { applyTranslations, dialogueTexts, readLocalisationCsv, removeLanguage, toLocalisationCsv, translated, withChoiceIds } from "./localisation";

const TRICKY = 'Pip said, "Hello, world!"\nThen left; again.';

const tree: DialogueTree = {
  id: "t",
  projectId: "p",
  name: "Inn",
  languages: ["nb"],
  tags: [],
  createdAt: "",
  updatedAt: "",
  nodes: [
    { id: "s", type: "start", x: 0, y: 0, nextId: "hi" },
    { id: "hi", type: "dialogue", x: 0, y: 0, speaker: "Innkeeper, Old", text: TRICKY, translations: { nb: "Hei!" }, nextId: "pick" },
    {
      id: "pick",
      type: "choice",
      x: 0,
      y: 0,
      text: "What now?",
      choices: [
        { id: "room", text: "A room, please.", targetId: "" },
        { text: "=1+1 (just kidding)", targetId: "" },
      ],
    },
    { id: "c", type: "condition", x: 0, y: 0, condition: "tired" },
  ],
};

describe("localisation CSV", () => {
  it("lists every line, prompt and option with a stable id", () => {
    expect(dialogueTexts(tree).map((entry) => entry.id)).toEqual(["hi", "pick", "room", "pick.1"]);
    expect(withChoiceIds(tree.nodes[2]).choices?.map((choice) => choice.id)).toEqual(["room", "pick.1"]);
  });

  it("writes id, speaker, source and a column per language, quoting commas, quotes and newlines", () => {
    const csv = toLocalisationCsv(tree, ["nb", "de"]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"id","speaker","source","nb","de"\r\n');
    expect(csv).toContain(`"hi","Innkeeper, Old","Pip said, ""Hello, world!""\nThen left; again.","Hei!",""`);
    expect(csv).toContain(`"pick.1","","'=1+1 (just kidding)","",""`);
  });

  it("round-trips: export, fill in, import back by id", () => {
    const filled = toLocalisationCsv(tree, ["nb", "de"])
      .replace('"Hei!",""', `"Hei, ""venn""!\nVelkommen.","Hallo, ""Freund""!"`)
      .replace('"room","","A room, please.","",""', '"room","","A room, please.","Et rom, takk.",""');
    const sheet = readLocalisationCsv(filled);
    expect(sheet.languages).toEqual(["nb", "de"]);
    expect(sheet.rows.find((row) => row.id === "hi")?.source).toBe(TRICKY);
    expect(sheet.rows.find((row) => row.id === "pick.1")?.source).toBe("=1+1 (just kidding)");

    const { tree: translated, warnings } = applyTranslations(tree, sheet);
    const hi = translated.nodes[1];
    expect(hi.translations).toEqual({ nb: 'Hei, "venn"!\nVelkommen.', de: 'Hallo, "Freund"!' });
    expect(translated.nodes[2].choices?.[0].translations).toEqual({ nb: "Et rom, takk." });
    expect(translated.nodes[2].choices?.[1].translations).toBeUndefined();
    expect(translated.languages).toEqual(["nb", "de"]);
    expect(warnings).toEqual(["Read 3 translations (nb, de)."]);

    // and the next export carries them
    const again = readLocalisationCsv(toLocalisationCsv(translated));
    expect(again.rows.find((row) => row.id === "hi")?.translations).toEqual({ nb: 'Hei, "venn"!\nVelkommen.', de: 'Hallo, "Freund"!' });
  });

  it("clears emptied cells, skips unknown ids and notices changed source text", () => {
    const csv = ['id,source,nb', 'hi,Something else,', 'gone,Old line,Gammel', 'room,"A room, please.",Rom'].join("\n");
    const { tree: updated, warnings } = applyTranslations(tree, readLocalisationCsv(csv));
    expect(updated.nodes[1].translations).toBeUndefined();
    expect(updated.nodes[2].choices?.[0].translations).toEqual({ nb: "Rom" });
    expect(warnings).toEqual([
      "Read 1 translation (nb).",
      "1 row matches nothing in this dialogue (deleted, or from another dialogue) and was skipped.",
      "1 text has changed since the sheet was made; check its translation.",
    ]);
  });

  it("reads semicolon sheets from spreadsheets and rejects sheets without ids", () => {
    const sheet = readLocalisationCsv("﻿id;speaker;source;de\r\nhi;;x;Hallo\r\n");
    expect(sheet.rows).toEqual([{ id: "hi", source: "x", translations: { de: "Hallo" } }]);
    expect(() => readLocalisationCsv("name,text\na,b")).toThrow("no “id” column");
  });

  it("shows a language when translated and falls back to the source", () => {
    const hi = tree.nodes[1] as DialogueNode;
    expect(translated(hi.text, hi.translations, "nb")).toBe("Hei!");
    expect(translated(hi.text, hi.translations, "de")).toBe(TRICKY);
    expect(translated(hi.text, hi.translations, null)).toBe(TRICKY);
    expect(removeLanguage(tree, "nb").nodes[1].translations).toBeUndefined();
  });
});
