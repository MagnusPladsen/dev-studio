// Packs dev-studio-mcp the way `npm publish` would, installs the tarball into an empty folder and starts the
// installed `dev-studio-mcp` bin over stdio. Fails if the package is missing files, a dependency or a tool.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listCapabilities } from "./list-capabilities.mjs";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const EXPECTED_TOOLS = ["sign_in", "list_projects", "search", "get_board", "create_issues", "edit_canvas", "create_note", "create_decision"];
const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });

const folder = mkdtempSync(join(tmpdir(), "dev-studio-mcp-smoke-"));
try {
  // The prepack build logs to stdout too; the JSON report starts at the first line that is just "[".
  const packOutput = npm(["pack", "--json", "--pack-destination", folder], PACKAGE_DIR);
  const [{ filename, files }] = JSON.parse(packOutput.slice(packOutput.search(/^\[$/m)));
  console.log(`Packed ${filename}: ${files.map((file) => file.path).join(", ")}`);

  writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "smoke", private: true }));
  npm(["install", "--no-audit", "--no-fund", join(folder, filename)], folder);

  const bin = join(folder, "node_modules", ".bin", process.platform === "win32" ? "dev-studio-mcp.cmd" : "dev-studio-mcp");
  const { tools, prompts } = await listCapabilities(bin);
  const names = tools.map((tool) => tool.name);
  const missing = EXPECTED_TOOLS.filter((name) => !names.includes(name));
  const deletes = names.filter((name) => name.startsWith("delete"));
  if (missing.length || deletes.length) throw new Error(`Missing tools: ${missing.join(", ") || "none"}; delete tools: ${deletes.join(", ") || "none"}`);
  console.log(`The installed server started and lists ${tools.length} tools and ${prompts.length} prompts:\n${names.join(", ")}`);
} finally {
  rmSync(folder, { recursive: true, force: true });
}
