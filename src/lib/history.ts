const LIMIT = 200;

/** Undo/redo stacks behind `useHistory`, kept free of React so they can be unit-tested. */
export interface HistoryStacks<T> {
  past: T[];
  future: T[];
  /** The value the editor showed last. */
  last: T;
  /** An undo/redo was handed to the editor and its value hasn't come back yet. */
  isApplying: boolean;
}

/** What `recordChange` did with a value. */
export type ChangeResult = "unchanged" | "applied" | "newStep" | "merged";

export function createHistoryStacks<T>(value: T): HistoryStacks<T> {
  return { past: [], future: [], last: value, isApplying: false };
}

/**
 * Records the editor's current value. A change during a burst is merged into the open step;
 * otherwise it starts a new one and clears redo. The value an undo/redo put back is not a change.
 */
export function recordChange<T>(stacks: HistoryStacks<T>, value: T, isInBurst: boolean): ChangeResult {
  if (stacks.isApplying) {
    stacks.isApplying = false;
    stacks.last = value;
    return "applied";
  }
  if (Object.is(value, stacks.last)) return "unchanged";
  const previous = stacks.last;
  stacks.last = value;
  if (isInBurst) return "merged";
  stacks.past.push(previous);
  if (stacks.past.length > LIMIT) stacks.past.shift();
  stacks.future = [];
  return "newStep";
}

/** Moves one step back (undo) or forward (redo). Returns the value to apply, if there is one. */
export function stepHistory<T>(stacks: HistoryStacks<T>, direction: "undo" | "redo"): T | undefined {
  const [from, to] = direction === "undo" ? [stacks.past, stacks.future] : [stacks.future, stacks.past];
  const target = from.pop();
  if (target === undefined) return undefined;
  to.push(stacks.last);
  stacks.isApplying = !Object.is(target, stacks.last);
  stacks.last = target;
  return target;
}
