import { asService, passwordSession, rest, type TestUser } from "./admin";
import { check, section } from "./check";
import type { E2eEnv } from "./env";
import type { Created } from "./tools";

type Row = { id: string; rev?: number; data?: unknown };
const rows = (body: unknown): Row[] => (Array.isArray(body) ? (body as Row[]) : []);

async function ownerRows(env: E2eEnv, owner: TestUser, projectId: string) {
  return rows((await asService(env, `assets?user_id=eq.${owner.id}&project_id=eq.${projectId}&select=id,rev,data`)).body);
}

/** User B must see none of A's rows and change none of them, through tables, RPCs and search. */
export async function checkOtherUser(env: E2eEnv, owner: TestUser, other: TestUser, created: Created) {
  section("Row level security: user B against A's rows");
  const { accessToken: token } = await passwordSession(env, other);
  const project = created.projectId;
  const before = await ownerRows(env, owner, project);
  check("A has rows to protect", before.length >= 8, before.length);
  const target = before.find((row) => row.id === created.items.find((item) => item.type === "note")?.id)!;

  check("B reads none of A's projects", rows((await rest(env, token, `projects?id=eq.${project}`)).body).length === 0);
  check("B reads none of A's assets", rows((await rest(env, token, `assets?project_id=eq.${project}`)).body).length === 0);
  const search = await rest(env, token, "rpc/search_assets", { method: "POST", body: JSON.stringify({ p_project_id: null, p_query: created.marker }) });
  check("B's search finds none of A's text", search.status === 200 && rows(search.body).length === 0, search);
  const update = await rest(env, token, `assets?id=eq.${target.id}`, { method: "PATCH", body: JSON.stringify({ data: { hacked: true } }) });
  check("B's update touches no rows", rows(update.body).length === 0, update);
  const remove = await rest(env, token, `assets?project_id=eq.${project}`, { method: "DELETE" });
  check("B's delete touches no rows", rows(remove.body).length === 0, remove);
  const insert = await rest(env, token, "assets", { method: "POST", body: JSON.stringify({ user_id: owner.id, id: "e2e-intruder", project_id: project, collection: "notes", data: {} }) });
  check("B can't insert a row as A", insert.status >= 400, insert);

  const casUpdate = await rest(env, token, "rpc/save_assets", { method: "POST", body: JSON.stringify({ p_rows: [{ id: target.id, project_id: project, collection: "notes", data: { hacked: true }, rev: target.rev }] }) });
  check("B's save_assets with A's id and rev changes nothing", rows(casUpdate.body).every((row) => (row as { status?: string }).status !== "ok"), casUpdate);
  const casProject = await rest(env, token, "rpc/save_projects", { method: "POST", body: JSON.stringify({ p_rows: [{ id: project, data: { name: "hacked" }, rev: 1 }] }) });
  check("B's save_projects with A's project id changes nothing", rows(casProject.body).every((row) => (row as { status?: string }).status !== "ok"), casProject);
  // A fresh insert lands in B's own namespace (rows are keyed by user) or is refused: either way A never sees it.
  await rest(env, token, "rpc/save_assets", { method: "POST", body: JSON.stringify({ p_rows: [{ id: "e2e-planted", project_id: project, collection: "notes", data: { title: "planted" } }] }) });

  const after = await ownerRows(env, owner, project);
  check("A's rows are unchanged afterwards", JSON.stringify(after) === JSON.stringify(before), { before: before.length, after: after.length });
  const planted = rows((await asService(env, `assets?id=eq.e2e-planted&select=user_id`)).body) as unknown as { user_id: string }[];
  check("nothing B saved is owned by A", planted.every((row) => row.user_id !== owner.id), planted);
}

/** Tokens with a `client_id` claim (OAuth clients like the MCP server) may read and write but never delete. */
export async function checkClientTokenCannotDelete(env: E2eEnv, owner: TestUser, created: Created, tokens: { label: string; token: string }[]) {
  section("Row level security: OAuth client tokens can't delete");
  const scratch = created.scratchNoteId;
  for (const { label, token } of tokens) {
    check(`${label}: reads A's rows`, rows((await rest(env, token, `assets?project_id=eq.${created.projectId}&select=id`)).body).length > 0);
    const asset = await rest(env, token, `assets?id=eq.${scratch}`, { method: "DELETE" });
    check(`${label}: asset delete removes nothing`, rows(asset.body).length === 0, asset);
    const project = await rest(env, token, `projects?id=eq.${created.otherProjectId}`, { method: "DELETE" });
    check(`${label}: project delete removes nothing`, rows(project.body).length === 0, project);
  }
  const stillThere = rows((await asService(env, `assets?user_id=eq.${owner.id}&id=eq.${scratch}&select=id`)).body);
  const projectThere = rows((await asService(env, `projects?user_id=eq.${owner.id}&id=eq.${created.otherProjectId}&select=id`)).body);
  check("the scratch note and the project are still there", stillThere.length === 1 && projectThere.length === 1);

  const { accessToken } = await passwordSession(env, owner);
  const control = await rest(env, accessToken, `assets?id=eq.${scratch}`, { method: "DELETE" });
  check("control: A's own browser-style session can delete it", rows(control.body).length === 1, control);
}
