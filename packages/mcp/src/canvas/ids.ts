import { v4 as uuid } from "uuid";

/**
 * New ids for one tool call that come out the same on every attempt. `save_assets` writes row by row, so after a
 * conflict some rows (element links) may already be saved; the rerun then makes the same elements again, and those
 * rows still point at them.
 */
export class IdSequence {
  private ids: string[] = [];
  private cursor = 0;

  readonly next = (): string => {
    if (this.cursor === this.ids.length) this.ids.push(uuid());
    return this.ids[this.cursor++];
  };

  /** Starts handing out the same ids again, for the next attempt. */
  restart(): void {
    this.cursor = 0;
  }
}
