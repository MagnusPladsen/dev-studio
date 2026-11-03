import type { ColumnCategory, IssuePriority, IssueType, Sprint } from "@/types";

/** A CSV file as rows of cells, kept on the drafts so the column-matching step can map it again. */
export interface CsvSource {
  headers: string[];
  rows: string[][];
}

export interface SprintDraft {
  name: string;
  state: Sprint["state"];
  goal?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * An issue read from a file, before it joins the board: its status and sprint are names, matched to the board's
 * columns and sprints (or added) by `mergeIntoBoard`, and it gets its key there.
 */
export interface IssueDraft {
  title: string;
  description: string;
  /** Any word from the file ("Story", "bug"); `mergeIntoBoard` turns it into one of the app's types. */
  type: IssueType | null;
  priority: IssuePriority;
  status: {
    name: string;
    category: ColumnCategory;
    color?: string;
    /** A column from a board export: added to the board when it has no column of that name. */
    addIfMissing?: boolean;
  };
  sprint: SprintDraft | null;
  points?: number;
  dueDate?: string;
  labels: string[];
  archived?: boolean;
  /** The whole CSV file, for the column-matching step (the same object on every draft of one file). */
  csv?: CsvSource;
}
