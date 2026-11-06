import type { DialogueChoice, DialogueNode, DialogueTranslations, DialogueTree } from "@/types";
import { CSV_BOM, csvCell } from "@/lib/csv";
import { parseCsvRows } from "@/lib/import/board/csv-table";
import { ImportError } from "@/lib/import/types";

/** One translatable text: a line, a choice's prompt, or one of its options. */
export interface DialogueText {
  id: string;
  speaker: string;
  text: string;
  translations?: DialogueTranslations;
}

/** Translations read from a localisation CSV, by text id and language. */
export interface TranslationSheet {
  languages: string[];
  rows: { id: string; source: string; translations: DialogueTranslations }[];
}

const FIXED_COLUMNS = ["id", "speaker", "source"];

/** A choice option's CSV row id. Choices made before they had ids use their node and position. */
export function choiceTextId(node: DialogueNode, choice: DialogueChoice, index: number): string {
  return choice.id ?? `${node.id}.${index}`;
}

/** Gives every option of a choice its id, so removing one doesn't move another's translations. */
export function withChoiceIds(node: DialogueNode): DialogueNode {
  if (!node.choices?.some((choice) => !choice.id)) return node;
  return { ...node, choices: node.choices.map((choice, index) => ({ ...choice, id: choiceTextId(node, choice, index) })) };
}

/** Every text a player reads, in node order. */
export function dialogueTexts(tree: DialogueTree): DialogueText[] {
  return tree.nodes.flatMap((node): DialogueText[] => {
    if (node.type === "dialogue") return [{ id: node.id, speaker: node.speaker ?? "", text: node.text ?? "", translations: node.translations }];
    if (node.type !== "choice") return [];
    const prompt: DialogueText[] = node.text ? [{ id: node.id, speaker: "", text: node.text, translations: node.translations }] : [];
    const options = (node.choices ?? []).map((choice, index) => ({ id: choiceTextId(node, choice, index), speaker: "", text: choice.text, translations: choice.translations }));
    return [...prompt, ...options];
  });
}

/** A language column name the CSV can hold: not empty and not one of the fixed columns. */
export function isUsableLanguage(code: string): boolean {
  const trimmed = code.trim();
  return trimmed !== "" && !FIXED_COLUMNS.includes(trimmed.toLowerCase());
}

/** The localisation sheet: id, speaker, source text and one column per language (filled where already translated). */
export function toLocalisationCsv(tree: DialogueTree, languages: string[] = tree.languages ?? []): string {
  const header = [...FIXED_COLUMNS, ...languages];
  const rows = dialogueTexts(tree).map((entry) => [entry.id, entry.speaker, entry.text, ...languages.map((language) => entry.translations?.[language] ?? "")]);
  return CSV_BOM + [header, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Reads a localisation CSV: the `id` column plus every column that isn't id, speaker or source is a language. */
export function readLocalisationCsv(text: string): TranslationSheet {
  const [header = [], ...rows] = parseCsvRows(text);
  const columns = header.map((name) => name.trim());
  const idColumn = columns.findIndex((name) => name.toLowerCase() === "id");
  if (idColumn < 0) throw new ImportError("This CSV has no “id” column. Export one from a dialogue with Export → Localisation CSV.");
  const sourceColumn = columns.findIndex((name) => name.toLowerCase() === "source");
  const languageColumns = columns.map((name, index) => ({ name, index })).filter(({ name }) => isUsableLanguage(name));
  return {
    languages: languageColumns.map(({ name }) => name),
    rows: rows
      .filter((cells) => (cells[idColumn] ?? "").trim() !== "")
      .map((cells) => ({
        id: cells[idColumn].trim(),
        source: sourceColumn < 0 ? "" : (cells[sourceColumn] ?? ""),
        translations: Object.fromEntries(languageColumns.map(({ name, index }) => [name, cells[index] ?? ""])),
      })),
  };
}

/** Sets the sheet's languages on one text: a filled cell is the translation, an empty one removes it. */
function mergeInto(current: DialogueTranslations | undefined, incoming: DialogueTranslations): DialogueTranslations | undefined {
  const merged = { ...current };
  for (const [language, value] of Object.entries(incoming)) {
    if (value.trim() === "") delete merged[language];
    else merged[language] = value;
  }
  return Object.keys(merged).length ? merged : undefined;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Puts a sheet's translations onto the tree's texts by id, adds its languages, and says what didn't match. */
export function applyTranslations(tree: DialogueTree, sheet: TranslationSheet): { tree: DialogueTree; warnings: string[] } {
  const byId = new Map(sheet.rows.map((row) => [row.id, row]));
  const texts = new Map(dialogueTexts(tree).map((entry) => [entry.id, entry]));
  let filled = 0;
  let changedSince = 0;
  const translate = (id: string, current?: DialogueTranslations) => {
    const row = byId.get(id);
    if (!row) return current;
    filled += Object.values(row.translations).filter((value) => value.trim() !== "").length;
    if (row.source && row.source !== texts.get(id)?.text) changedSince++;
    return mergeInto(current, row.translations);
  };
  const nodes = tree.nodes.map((node) => {
    if (node.type !== "dialogue" && node.type !== "choice") return node;
    const translations = node.type === "dialogue" || node.text ? translate(node.id, node.translations) : node.translations;
    const choices = node.choices?.map((choice, index) => ({ ...choice, translations: translate(choiceTextId(node, choice, index), choice.translations) }));
    return { ...node, translations, ...(choices ? { choices } : {}) };
  });
  const languages = [...new Set([...(tree.languages ?? []), ...sheet.languages])];
  const unknown = sheet.rows.filter((row) => !texts.has(row.id)).length;
  const warnings = [`Read ${plural(filled, "translation", "translations")}${sheet.languages.length ? ` (${sheet.languages.join(", ")})` : ""}.`];
  if (unknown) warnings.push(`${plural(unknown, "row matches", "rows match")} nothing in this dialogue (deleted, or from another dialogue) and ${unknown === 1 ? "was" : "were"} skipped.`);
  if (changedSince) warnings.push(`${plural(changedSince, "text has", "texts have")} changed since the sheet was made; check ${changedSince === 1 ? "its translation" : "their translations"}.`);
  return { tree: { ...tree, nodes, languages }, warnings };
}

function withoutLanguage(translations: DialogueTranslations | undefined, language: string): DialogueTranslations | undefined {
  if (!translations || !(language in translations)) return translations;
  const rest = Object.fromEntries(Object.entries(translations).filter(([code]) => code !== language));
  return Object.keys(rest).length ? rest : undefined;
}

/** Removes a language and every translation into it. */
export function removeLanguage(tree: DialogueTree, language: string): DialogueTree {
  return {
    ...tree,
    languages: tree.languages?.filter((code) => code !== language),
    nodes: tree.nodes.map((node) => ({
      ...node,
      translations: withoutLanguage(node.translations, language),
      ...(node.choices ? { choices: node.choices.map((choice) => ({ ...choice, translations: withoutLanguage(choice.translations, language) })) } : {}),
    })),
  };
}

/** How many texts have a translation into `language`. */
export function translatedCount(tree: DialogueTree, language: string): number {
  return dialogueTexts(tree).filter((entry) => entry.translations?.[language]?.trim()).length;
}

/** The text in `language`, or the source text when it has no translation (or no language is picked). */
export function translated(text: string | undefined, translations: DialogueTranslations | undefined, language: string | null): string {
  return (language && translations?.[language]?.trim() ? translations[language] : text) ?? "";
}
