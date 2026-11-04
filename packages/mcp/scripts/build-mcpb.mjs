// Builds the Claude Desktop extension: release/dev-studio-mcp-<version>.mcpb. Claude Desktop runs `node` servers
// from the bundle's own node_modules (no npx), so the dependencies go in at the versions this workspace has
// installed, plus the keychain module's prebuilt binaries for every platform Claude Desktop runs on.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listCapabilities } from "./list-capabilities.mjs";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_DIR = join(PACKAGE_DIR, "..", "..");
const RELEASE_DIR = join(PACKAGE_DIR, "release");
const STAGE_DIR = join(RELEASE_DIR, "stage");
const MCPB_CLI = "@anthropic-ai/mcpb@2.1.2";
const KEYRING_TARGETS = ["darwin-arm64", "darwin-x64", "win32-x64-msvc", "win32-arm64-msvc", "linux-x64-gnu", "linux-arm64-gnu"];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

function installedVersion(name) {
  for (const base of [PACKAGE_DIR, REPO_DIR]) {
    const path = join(base, "node_modules", name, "package.json");
    if (existsSync(path)) return readJson(path).version;
  }
  throw new Error(`${name} is not installed; run npm ci at the repo root first.`);
}

function bundleDependencies(dependencies) {
  const pinned = Object.fromEntries(Object.keys(dependencies).map((name) => [name, installedVersion(name)]));
  const keyring = pinned["@napi-rs/keyring"];
  for (const target of KEYRING_TARGETS) pinned[`@napi-rs/keyring-${target}`] = keyring;
  return pinned;
}

/** One line per tool for the install dialog: the first sentence of its description. */
function manifestTools(tools) {
  return tools.map(({ name, description = "" }) => ({ name, description: description.split(/(?<=\.)\s/)[0] }));
}

const pkg = readJson(join(PACKAGE_DIR, "package.json"));
run("npm", ["run", "build"], PACKAGE_DIR);

rmSync(RELEASE_DIR, { recursive: true, force: true });
mkdirSync(join(STAGE_DIR, "server"), { recursive: true });
copyFileSync(join(PACKAGE_DIR, "dist", "index.js"), join(STAGE_DIR, "server", "index.js"));
copyFileSync(join(PACKAGE_DIR, "LICENSE"), join(STAGE_DIR, "LICENSE"));
copyFileSync(join(REPO_DIR, "desktop", "build", "dev-studio", "icon.png"), join(STAGE_DIR, "icon.png"));
writeFileSync(
  join(STAGE_DIR, "package.json"),
  JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: "module", dependencies: bundleDependencies(pkg.dependencies) }, null, 2),
);
// --force installs the keychain binaries for the other platforms too (npm skips them by default).
run("npm", ["install", "--omit=dev", "--force", "--no-audit", "--no-fund", "--no-package-lock"], STAGE_DIR);

const { tools } = await listCapabilities(process.execPath, [join(STAGE_DIR, "server", "index.js")]);
const manifest = { ...readJson(join(PACKAGE_DIR, "mcpb", "manifest.json")), version: pkg.version, tools: manifestTools(tools) };
writeFileSync(join(STAGE_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const output = join(RELEASE_DIR, `${pkg.name}-${pkg.version}.mcpb`);
run("npx", ["-y", MCPB_CLI, "validate", join(STAGE_DIR, "manifest.json")], PACKAGE_DIR);
run("npx", ["-y", MCPB_CLI, "pack", STAGE_DIR, output], PACKAGE_DIR);
console.log(`Built ${output} (${(statSync(output).size / 1024 / 1024).toFixed(1)} MB, ${tools.length} tools, unsigned)`);
