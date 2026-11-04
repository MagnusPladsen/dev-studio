import { ResourceTemplate } from "@modelcontextprotocol/server";
import { SHAPE_LIST } from "@/lib/canvas-shapes";
import { appConfigFor } from "@/lib/app-config";
import { assetTypeSchema } from "./refs";
import { readAsset } from "./tools/assets";
import { listProjects, overviewMarkdown, projectOverview } from "./tools/projects";
import type { ToolContext } from "./tools/context";

const MARKDOWN = "text/markdown";

function shapesMarkdown(): string {
  const rows = SHAPE_LIST.map(
    (s) => `| ${s.type} | ${s.label} | ${s.size.width}×${s.size.height} | ${s.minSize.width}×${s.minSize.height} | ${s.isContainer ? "yes" : ""} |`
  );
  return ["# Canvas shapes", "", "| kind | name | default size | min size | container |", "|---|---|---|---|---|", ...rows].join("\n");
}

export function registerResources(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerResource("projects", "studio://projects", { title: "Projects", mimeType: MARKDOWN }, async (uri) => {
    const projects = await listProjects(ctx);
    const text = projects.map((p) => `- ${p.name} [${appConfigFor(p.app).name}] studio://project/${p.id}`).join("\n") || "No projects yet.";
    return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text }] };
  });

  server.registerResource("shapes", "studio://shapes", { title: "Canvas shapes", mimeType: MARKDOWN }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: MARKDOWN, text: shapesMarkdown() }],
  }));

  /** Signed out, the list is just empty, so the static resources still show. */
  const listProjectResources = async () => {
    const projects = await listProjects(ctx).catch(() => []);
    return { resources: projects.map((p) => ({ uri: `studio://project/${p.id}`, name: p.name, mimeType: MARKDOWN })) };
  };

  server.registerResource(
    "project",
    new ResourceTemplate("studio://project/{projectId}", { list: listProjectResources }),
    { title: "Project overview", mimeType: MARKDOWN },
    async (uri, { projectId }) => ({
      contents: [{ uri: uri.href, mimeType: MARKDOWN, text: overviewMarkdown(await projectOverview(ctx, String(projectId))) }],
    })
  );

  server.registerResource(
    "asset",
    new ResourceTemplate("studio://project/{projectId}/{type}/{id}", { list: undefined }),
    { title: "Asset", description: "One issue, note, page, decision or canvas outline as Markdown.", mimeType: MARKDOWN },
    async (uri, { projectId, type, id }) => {
      const ref = { type: assetTypeSchema.parse(String(type)), id: String(id) };
      const asset = await readAsset(ctx, String(projectId), { ref });
      return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text: `${asset.markdown}\n\nOpen: ${asset.url}` }] };
    }
  );
}
