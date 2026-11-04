import * as z from "zod";
import { v4 as uuid } from "uuid";
import type { Project } from "@/types";
import { appConfigFor, type AppId } from "@/lib/app-config";
import { assetKindLabel, assetTypesFor } from "@/lib/assets";
import { activeSprintOf, doneColumnIds } from "@/lib/board";
import { storage } from "@/lib/storage";
import { selectAssetCounts } from "../store/loader";
import { collectionOf, projectApp, projectIdSchema, projectUrl } from "../refs";
import { assetList, listLine } from "../summaries";
import { guarded, READ_ONLY, result, WRITES, type ToolContext } from "./context";

const appSchema = z.enum(["gamedev-studio", "dev-studio"]);

function countsFor(project: Project, perCollection: Record<string, number> = {}): Record<string, number> {
  const app = projectApp(project);
  return Object.fromEntries(assetTypesFor(app).map((type) => [assetKindLabel(type, app), perCollection[collectionOf(type)] ?? 0]));
}

export async function listProjects(ctx: ToolContext, app: AppId | "all" = "all") {
  const projects = await ctx.studio.read({}, () => storage.getAll("projects"));
  const counts = await selectAssetCounts(ctx.studio.client);
  return projects
    .filter((p) => app === "all" || projectApp(p) === app)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => ({
      id: p.id,
      name: p.name,
      app: projectApp(p),
      description: p.description,
      updatedAt: p.updatedAt,
      counts: countsFor(p, counts.get(p.id)),
      url: projectUrl(p),
    }));
}

function boardSummary(projectId: string) {
  const board = storage.getAll("boards", projectId)[0];
  if (!board) return null;
  const done = doneColumnIds(board);
  const open = storage.getAll("issues", projectId).filter((i) => !i.archived && !done.has(i.status));
  return {
    keyPrefix: board.keyPrefix,
    columns: board.columns.map((c) => ({ name: c.name, category: c.category, issues: open.filter((i) => i.status === c.id).length })),
    activeSprint: activeSprintOf(board)?.name ?? null,
    openIssues: open.length,
  };
}

export async function projectOverview(ctx: ToolContext, projectId: string) {
  return ctx.studio.read({ projectId, collections: "all" }, () => {
    const project = storage.getById("projects", projectId)!;
    const assets = assetList(project);
    const folders = [...new Set(storage.getAll("notes", projectId).map((n) => n.folder).filter(Boolean))] as string[];
    const counts = Object.fromEntries(
      assetTypesFor(projectApp(project)).map((t) => [assetKindLabel(t, projectApp(project)), assets.filter((a) => a.ref.type === t).length])
    );
    return {
      project: { id: project.id, name: project.name, app: projectApp(project), description: project.description, url: projectUrl(project) },
      counts,
      board: boardSummary(projectId),
      noteFolders: folders,
      recent: assets.slice(0, 10),
    };
  });
}

export function overviewMarkdown(overview: Awaited<ReturnType<typeof projectOverview>>): string {
  const { project, counts, board, noteFolders, recent } = overview;
  const lines = [`# ${project.name} (${appConfigFor(project.app).name})`, project.description, project.url, ""];
  lines.push(`Contents: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  if (board) {
    lines.push(`Board ${board.keyPrefix}: ${board.openIssues} open issues, active sprint: ${board.activeSprint ?? "none"}`);
    lines.push(`Columns: ${board.columns.map((c) => `${c.name} (${c.issues})`).join(", ")}`);
  }
  if (noteFolders.length) lines.push(`Note folders: ${noteFolders.join(", ")}`);
  lines.push("", "Recently changed:", ...recent.map(listLine));
  return lines.filter((l) => l !== undefined).join("\n");
}

/** The app the user worked in last, for a new project when neither the call nor `STUDIO_DEFAULT_APP` names one. */
function lastUsedApp(): AppId {
  const newest = storage.getAll("projects").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return newest ? projectApp(newest) : "gamedev-studio";
}

export function registerProjectTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Lists the user's projects in Dev Studio and GameDev Studio with what's in each.",
      inputSchema: z.object({ app: z.enum(["gamedev-studio", "dev-studio", "all"]).optional().describe("Default all.") }),
      annotations: READ_ONLY,
    },
    ({ app }) =>
      guarded(async () => {
        const projects = await listProjects(ctx, app);
        const text = projects.length
          ? projects.map((p) => `- ${p.name} [${appConfigFor(p.app).name}] id ${p.id}, updated ${p.updatedAt.slice(0, 10)}`).join("\n")
          : "No projects yet. create_project makes one.";
        return result(text, { projects });
      })
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "One project: counts per kind, board summary, note folders and the 10 most recently changed assets.",
      inputSchema: z.object({ projectId: projectIdSchema }),
      annotations: READ_ONLY,
    },
    ({ projectId }) =>
      guarded(async () => {
        const overview = await projectOverview(ctx, projectId);
        return result(overviewMarkdown(overview), overview);
      })
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Creates an empty project. app is dev-studio (planning tools) or gamedev-studio (all tools).",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().max(2000).optional(),
        app: appSchema.optional().describe("Default: the app the user used last."),
      }),
      annotations: WRITES,
    },
    ({ name, description, app }) =>
      guarded(async () => {
        const project = await ctx.studio.write({}, () => {
          const now = new Date().toISOString();
          const created: Project = {
            id: uuid(),
            name,
            description: description?.trim() ?? "",
            showTutorials: true,
            app: app ?? ctx.config.defaultApp ?? lastUsedApp(),
            createdAt: now,
            updatedAt: now,
          };
          storage.save("projects", created);
          return created;
        });
        const url = projectUrl(project);
        return result(`Created ${project.name} in ${appConfigFor(projectApp(project)).name}: ${url}`, {
          project: { id: project.id, name: project.name, app: projectApp(project), url },
        });
      })
  );
}
