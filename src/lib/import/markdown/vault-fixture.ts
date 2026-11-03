import { readFileSync } from "node:fs";

const FILES = ["Mira.md", "Harbor Town.md", "Design/Sprint notes.md", "mira-portrait.png", ".obsidian/app.json"];

/** For tests: the hand-written vault fixture as the folder picker hands it over (paths start at "vault/"). */
export function vaultFiles(): File[] {
  return FILES.map((path) => {
    const file = new File([readFileSync(new URL(`./fixtures/vault/${path}`, import.meta.url))], path.split("/").pop()!, { type: path.endsWith(".md") ? "text/markdown" : "" });
    Object.defineProperty(file, "webkitRelativePath", { value: `vault/${path}` });
    return file;
  });
}
