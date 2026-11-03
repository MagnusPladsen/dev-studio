/** For tests: a `File` holding `text`, as the file picker would hand it over. */
export function textFile(text: string, name = "import.json", type = "application/json"): File {
  return new File([text], name, { type });
}

const isIdKey = (key: string, refKeys: string[]) => key === "id" || key.endsWith("Id") || key.endsWith("Ids") || refKeys.includes(key);

/**
 * For tests: are `copy` and `original` the same apart from their ids? Ids may differ, but each must map one to one,
 * so references inside the copy still point at the matching things. Returns the first difference, or null.
 */
export function differenceIgnoringIds(original: unknown, copy: unknown, refKeys: string[] = []): string | null {
  const forward = new Map<string, string>();
  const backward = new Map<string, string>();
  const sameId = (a: string, b: string) => {
    if ((forward.get(a) ?? b) !== b || (backward.get(b) ?? a) !== a) return false;
    forward.set(a, b);
    backward.set(b, a);
    return true;
  };
  const walk = (a: unknown, b: unknown, path: string, isRef: boolean): string | null => {
    if (isRef && typeof a === "string" && typeof b === "string") return sameId(a, b) ? null : `${path}: ${a} → ${b} breaks the id mapping`;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return `${path}: length ${a.length} → ${b.length}`;
      for (let i = 0; i < a.length; i++) {
        const difference = walk(a[i], b[i], `${path}[${i}]`, isRef);
        if (difference) return difference;
      }
      return null;
    }
    if (typeof a === "object" && a && typeof b === "object" && b) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        const difference = walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, isIdKey(key, refKeys));
        if (difference) return difference;
      }
      return null;
    }
    return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`;
  };
  return walk(original, copy, "", false);
}
