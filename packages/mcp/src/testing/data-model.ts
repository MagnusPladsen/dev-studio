import { fileURLToPath } from "node:url";

/** What Claude sends for "draw a data model of a team task tracker": tables first, then the relation lines. */
export const DATA_MODEL_OPS = [
  { op: "add", ref: "teams", kind: "table", text: "teams", columns: [{ name: "id", type: "uuid", pk: true }, { name: "name", type: "text" }] },
  {
    op: "add", ref: "users", kind: "table", text: "users",
    columns: [{ name: "id", type: "uuid", pk: true }, { name: "email", type: "text" }, { name: "team_id", type: "uuid", fk: true }],
  },
  {
    op: "add", ref: "tasks", kind: "table", text: "tasks",
    columns: [{ name: "id", type: "uuid", pk: true }, { name: "title", type: "text" }, { name: "assignee_id", type: "uuid", fk: true }, { name: "team_id", type: "uuid", fk: true }, { name: "due_at", type: "timestamptz" }],
  },
  { op: "add", ref: "tags", kind: "table", text: "tags", columns: [{ name: "id", type: "uuid", pk: true }, { name: "label", type: "text" }] },
  { op: "add", ref: "task_tags", kind: "table", text: "task_tags", columns: [{ name: "task_id", type: "uuid", pk: true, fk: true }, { name: "tag_id", type: "uuid", pk: true, fk: true }] },
  { op: "connect", from: "users.team_id", to: "teams.id" },
  { op: "connect", from: "tasks.assignee_id", to: "users.id" },
  { op: "connect", from: "tasks.team_id", to: "teams.id" },
  { op: "connect", from: "task_tags.task_id", to: "tasks.id" },
  { op: "connect", from: "task_tags.tag_id", to: "tags.id" },
  { op: "add", kind: "note", text: "Soft deletes: rows keep deleted_at instead of going away.", near: "tasks", side: "below" },
] as const;

/** The canvas the ops above produce, saved as Export → JSON would write it; `app-load.test.ts` opens it with the app's code. */
export const DATA_MODEL_FIXTURE = fileURLToPath(new URL("./fixtures/data-model.canvas.json", import.meta.url));
