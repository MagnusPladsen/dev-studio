import { describe, expect, it } from "vitest";
import { DEV_STUDIO_COPY } from "./dev-studio";
import { GAMEDEV_STUDIO_COPY } from "./gamedev-studio";

/** Every key path in `value`, with array items and function results flattened to their own paths. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "function") return [`${prefix}()`];
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => keyPaths((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

/** Every string in `value`, with the path it sits at. Functions are called with a sample argument. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return strings((value as (arg: string) => unknown)("example.json"), `${path}()`);
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  return [];
}

const BOTH = { "GameDev Studio": GAMEDEV_STUDIO_COPY, "Dev Studio": DEV_STUDIO_COPY };

/** Strings that are empty on purpose, like the Blank note template's content. */
const MAY_BE_EMPTY = /^notebook\.templates\[\d+\]\.content$/;

describe("app copy", () => {
  it("should have the same nested keys in both apps", () => {
    expect(keyPaths(DEV_STUDIO_COPY)).toEqual(keyPaths(GAMEDEV_STUDIO_COPY));
  });

  it.each(Object.entries(BOTH))("should have no empty strings in %s", (_, copy) => {
    const empty = strings(copy).filter(([path, text]) => !text.trim() && !MAY_BE_EMPTY.test(path));
    expect(empty).toEqual([]);
  });

  it.each(Object.entries(BOTH))("should keep the help bullet counts each tool's icons expect in %s", (_, copy) => {
    expect(Object.fromEntries(Object.entries(copy.help).map(([topic, help]) => [topic, help.canDo.length]))).toEqual({
      assets: 5,
      board: 5,
      diagrams: 5,
      story: 4,
      notebook: 5,
      decisions: 5,
    });
  });

  it("should not mention games in Dev Studio", () => {
    const gameWords = /\b(games?|player|playtest|sprites?|quests?|lore|levels?|npcs?)\b/i;
    expect(strings(DEV_STUDIO_COPY).filter(([path, text]) => gameWords.test(text) && !path.startsWith("landing."))).toEqual([]);
  });
});
