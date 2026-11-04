# dev-studio-mcp (beta)

A local [MCP](https://modelcontextprotocol.io) server that lets Claude Desktop, Claude Code and other MCP clients read
and edit your projects in [Dev Studio](https://dev-studio.pladsen.dev) and
[GameDev Studio](https://gamedev-studio.pladsen.dev). Free, like everything there.

It runs on your computer, signs in to your own account and talks to it directly. Nothing goes anywhere else, and there
is no telemetry.

## Use it

Needs [Node.js](https://nodejs.org) 20.9 or newer for the npm route; the Claude Desktop extension brings its own.

**Claude Code** (`--scope user` makes it work in every folder):

```bash
claude mcp add --scope user dev-studio -- npx -y dev-studio-mcp
```

A team can commit it to a repo's `.mcp.json` instead:

```json
{ "mcpServers": { "dev-studio": { "command": "npx", "args": ["-y", "dev-studio-mcp"] } } }
```

**Claude Desktop extension:** download `dev-studio-mcp-<version>.mcpb` from the newest
[`mcp-v*` release](https://github.com/MagnusPladsen/dev-studio/releases?q=mcp-v&expanded=true) and double-click it, or
use Settings → Extensions → Install Extension. Its one setting picks the app new projects go to. The bundle isn't
signed yet, so Claude Desktop may say it comes from an unverified developer.

**Claude Desktop without the extension** (Settings → Developer → Edit config):

```json
{ "mcpServers": { "dev-studio": { "command": "npx", "args": ["-y", "dev-studio-mcp"] } } }
```

Any other MCP client: run `npx -y dev-studio-mcp` as a stdio server.

The first time, ask Claude to sign in (the `sign_in` tool), or run `npx dev-studio-mcp login` in a terminal. A browser
tab opens on the GameDev Studio site (it serves both apps); sign in, press **Allow**, and go back to Claude.

To disconnect: **Use with Claude → Connected apps → Disconnect** in the studio's sidebar. `npx dev-studio-mcp logout`
only forgets the sign-in on this computer. An access token keeps working for up to an hour after Disconnect.

## What Claude can do (this version)

| Tool | Does |
|---|---|
| `list_projects`, `get_project`, `create_project` | your projects in both apps; one project's board summary, note folders and recent changes; a new empty project |
| `list_assets`, `get_asset` | issues, notes, wiki/story pages, decisions and canvas outlines, as Markdown; art and audio as name and size only |
| `search` | full-text search over titles, text and canvas labels |
| `get_related`, `link`, `unlink` | links between assets (either end may be one canvas element) |
| `get_board`, `list_issues`, `get_issue` | the Task Board: columns, sprints and labels; issues filtered by sprint, column, type, priority, label or text; one issue with its checklist progress |
| `create_issues`, `update_issues` | up to 100 issues per call, with the next free keys; fields, labels, column, sprint, order and archive (no deletes) |
| `create_sprint`, `complete_sprint` | plan or start a sprint (one runs at a time); complete it like the app: done issues archived, open ones moved |
| `check_task` | tick or untick a `- [ ]` task in an issue, note or wiki/story page, or an item of a canvas checklist |
| `create_note`, `update_note` | Notebook notes, from the app's note templates; append or swap passages without resending the note |
| `create_wiki_page`, `update_wiki_page` | Wiki pages (Story in GameDev Studio) with the app's page types and templates; reports where each `[[link]]` points |
| `create_decision`, `update_decision` | Decision log entries as the next ADR number; `supersedes` marks the old ADR superseded and points it at the new one |
| `get_canvas` | a canvas as a short outline: one line per element and line, with handles (`t1`, `n2`, `e3`) that stay the same for the session |
| `create_canvas`, `edit_canvas` | a new canvas (blank or from a template) and changes to one: add, update, move, delete, connect, group. Tables with columns and relation lines make a data model in one call. The server places new elements and never moves the ones already there |
| `layout_canvas` | arranges named elements (or the whole canvas, when asked) as an ERD, flow, tree or grid |
| `sign_in`, `whoami`, `sign_out` | the connection |

Resources: `studio://projects`, `studio://project/{projectId}`, `studio://project/{projectId}/{type}/{id}` (one asset as
Markdown, for `@`-mentions in Claude Code) and `studio://shapes` (canvas shapes).

### Prompts

Ready-made jobs; Claude Desktop shows them in the **+** menu, Claude Code as `/mcp__dev-studio__<name>`. Each one asks
before it writes anything you haven't agreed to.

| Prompt | Arguments | Does |
|---|---|---|
| `plan_sprint` | `projectId`, `capacity?` (points), `goal?` | reads the board, the backlog and the active sprint, proposes the next sprint, creates it once you agree |
| `draw_data_model` | `projectId`, `source?` (a schema, code or a description) | builds an ERD canvas with tables, columns and relation lines, and links it to matching wiki pages and decisions |
| `meeting_notes_to_issues` | `projectId`, `note` (title or id) | turns the note's `- [ ]` action items into issues linked back to the note; ticks nothing without asking |
| `record_decision` | `projectId`, `topic` | asks a few questions, writes the next ADR, and offers to supersede an older one |

Rules it keeps:

- **No deletes.** Tokens issued to Claude can't delete rows (the database refuses). So `unlink` can take a link off a
  wiki/story page, but a link made with `link` stays until you remove it in the app; Claude says so.
- **Art and audio are read-only.** Pixel art, sprite sheets, palettes, tilemaps, 3D models, music and sound effects are
  shown as names and sizes, never created or changed.
- **Your text is data.** Note, page and issue text comes back fenced and labelled as user data, so Claude doesn't take
  instructions from it.
- **Edits never overwrite someone else's.** Every save sends the row's revision; if the row changed meanwhile, the server
  reloads and applies the change again (up to three times).

## Commands

```text
dev-studio-mcp          run the server over stdio (what Claude starts)
dev-studio-mcp login    sign in in the browser
dev-studio-mcp logout   forget this computer's sign-in
dev-studio-mcp whoami   show who is signed in
```

| Env | Default | |
|---|---|---|
| `STUDIO_AUTH` | `oauth` | `cli` uses the app's `/auth/cli` page instead of Supabase's OAuth server (needs `NEXT_PUBLIC_MCP_CLI_AUTH=on` on the site) |
| `STUDIO_DEFAULT_APP` | app of your most recently changed project | `dev-studio` or `gamedev-studio`, for `create_project` |
| `STUDIO_SUPABASE_URL`, `STUDIO_SUPABASE_KEY`, `STUDIO_CLIENT_ID` | production | for a staging project |
| `STUDIO_SITE_URL` | `https://gamedev-studio.pladsen.dev` | where `/auth/cli` lives |

The sign-in's refresh token is kept in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret
Service). Without a usable keychain it goes to `~/.config/studio-mcp/<project>.json`, readable only by you, and the server
says so. The access token stays in memory.

## Develop

The server lives in this repo so it runs the app's own code (`src/lib`: ids, links, board rules, schemas). `tsup`
bundles that code into `dist/index.js`; only the MCP SDK, supabase-js, zod and the keychain module stay dependencies.

```bash
npm install                      # at the repo root (npm workspaces)
npm run build -w dev-studio-mcp  # → packages/mcp/dist/index.js
npm run typecheck -w dev-studio-mcp
npm test                         # the root vitest run includes packages/*/src/**/*.test.ts
```

How it works: each tool call loads the rows it needs into the app's `storage` cache (`src/store/studio.ts`), runs the
app's functions on them, and saves the changed rows through the `save_projects` / `save_assets` RPCs with the `rev` it
loaded (`src/store/persister.ts`). Calls run one at a time.

MCP SDK: `@modelcontextprotocol/server` 2.x. Claude Code 2.1 and Claude Desktop first try the 2026-07-28 protocol
(`server/discover`) and fall back to `initialize`; SDK 2.4 answers that with 2025-11-25, which both accept.

### Try it against your real account before it's on npm

1. Build it: `npm install && npm run build -w dev-studio-mcp`.
2. Sign in: `node packages/mcp/dist/index.js login`. The browser shows the consent page; press **Allow**. Then
   `node packages/mcp/dist/index.js whoami` should print your masked email.
3. Add it to Claude Code with the absolute path:
   `claude mcp add --scope user dev-studio-local -- node "$PWD/packages/mcp/dist/index.js"`.
   `claude mcp list` should show it as connected.
4. In Claude Code, try: "List my studio projects", "What's on the board in <project>?", "Search my notes for
   <word>", "Show me TIDE-3", "Link the note <title> to the canvas <name>", "Create a Dev Studio project called MCP test".
5. Open the links Claude gives in the browser and check the link and project show up (the open tab updates live).
6. Clean up: `claude mcp remove dev-studio-local --scope user`; delete the test project in the app.

Releasing to npm and building the Claude Desktop extension: [PUBLISHING.md](PUBLISHING.md).
