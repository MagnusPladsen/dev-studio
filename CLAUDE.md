@AGENTS.md

# GameDev Studio

Free, open source, browser-based game-dev toolkit (beta). Live at https://gamedev-studio.pladsen.dev, deployed by the
owner through Vercel from `main`.

## Commands

- `npm run dev` — dev server on http://localhost:3000 (`NEXT_PUBLIC_APP=dev-studio npm run dev` for Dev Studio)
- `npm run build` — production build (must pass before pushing; Vercel runs the same)
- `npm test` — vitest unit tests
- `npx tsc --noEmit -p .` — typecheck
- `npm run lint` — ESLint (a few older `react-hooks/set-state-in-effect` findings remain; don't add new ones)

## Two apps

The same code builds **GameDev Studio** (all tools) and **Dev Studio** (Task Board, Canvas, Wiki, Notebook, Decision log), picked at
build time by `NEXT_PUBLIC_APP` (`dev-studio` or unset). `src/lib/app-config.ts` holds each app's name, initials, URL,
brand `accent` (purple / teal: root layout sets `--accent`, `src/app/icon.tsx` + `apple-icon.tsx` draw the favicon) and
`assetTypes`; `ASSET_TYPES` and the sidebar only show those, and `src/proxy.ts` redirects other tool routes to the
dashboard. In Dev Studio, Story is labelled **Wiki** (entry types Person/System/Component/Event/Reference/Goal).
Both landing pages end with `<OtherAppPromo>` linking to the other app. Projects carry `app` (missing = GameDev Studio); the projects list shows the other app's projects behind a toggle
and opens them on the other site. Examples: `src/lib/examples/dev-studio.ts` (Tidepool, a habit app).

**Text per app:** wording that differs between the apps lives in `src/copy/` (`AppCopy` in `types.ts`, one object per
app in `gamedev-studio.ts` / `dev-studio.ts`, same key order; read it as `COPY` from `@/copy`). New per-app text goes
there, not in `isDevStudio ? … : …` ternaries; text that reads the same in both apps stays inline. Help for the shared
tools comes from `COPY.help`. `npm test` checks both objects have the same keys and no empty strings.

## Architecture

- Next.js 16 App Router with `cacheComponents` on. Route segment configs like `dynamic` are not allowed; client-heavy
  route segments use `export const instant = false` (see `src/app/(app)/project/[projectId]/layout.tsx`).
  Client pages that read `useSearchParams` live under the `<Suspense>` in `src/app/(app)/layout.tsx`.
- `src/app/page.tsx` — landing page (server component). `src/app/(app)/` — the studio: projects list, per-project
  dashboard (`assets`) and one folder per tool under `project/[projectId]/`.
- **Storage** (`src/lib/storage.ts`): a synchronous in-memory cache that every editor reads and writes
  (`storage.getAll/getById/save/delete`, keyed by collection + projectId). Persisters mirror changes:
  - browser `localStorage` for guests,
  - Supabase when signed in (`src/lib/sync/cloud.ts`, coalesced + ordered + retried),
  - optional local folder via the File System Access API (`src/lib/sync/folder.ts`).
  `src/components/SyncProvider.tsx` picks the mode, moves browser data into the account on first sign-in, and bumps
  `generation` to re-mount editors after bulk changes (`reloadView()`).
- **Live updates**: changes from other tabs, devices and the MCP server reach the cache through
  `applyRemoteChanges` (not sent back to where they came from; `storage.onRemoteChange` hears them). Signed in:
  `src/lib/sync/realtime.ts` (Supabase Realtime + catch-up after reconnect/wake). Guests: `src/lib/sync/tabs.ts`
  (`storage` event). Echo/conflict rule: a row with a write of ours queued or in flight is re-read once it lands;
  otherwise last writer wins by the server's `updated_at`. Editors use `useRemoteChanges`: unsaved local edits win,
  otherwise the remote copy replaces the open asset (selection/view kept) and undo history restarts, so undo never
  reverts someone else's change. Canvas, Task Board, Notebook, Wiki/Story and Decision log do this; other editors
  are re-mounted on their open asset by `<LiveRefresh>`, which also shows the "deleted elsewhere" notice.
- **Supabase**: tables `projects` and `assets` (JSON bodies, row level security per user). Schema lives in
  `supabase/migrations/` and is applied by Supabase's GitHub integration. Adding a collection means a new migration
  that widens `assets_collection_check`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Assets & links**: `src/lib/assets.ts` (`ASSET_KINDS` registry: collection, label, tool path, colour) and
  `src/lib/links.ts` (`getRelated`, `addLink`, `removeLink`). Any asset can link to any other; story `[[wiki links]]`
  count too. `<LinkedAssets>` is the shared panel; `assetHref()` + `useOpenParam()` open an asset via `?open=<id>`.
  A link end can be one Canvas element: `{ type: "diagram", id, elementId }` (`&element=<nodeId>` deep-links to it).
  Deleting an element drops its links and undo restores them; `src/lib/diagrams/element-links.ts` migrates the old
  one-way `node.data.asset` on load. `<AssetPickerList allowElements>` picks a whole asset or a canvas element.
  Canvas right-click/long-press menus are built in `src/lib/diagrams/canvas-menu.ts` on the shared `ContextMenu`.
- **Examples**: `src/lib/examples/` — one module per tool group; items get `example: true` and ids
  `ctx.id(slug)`; `addExamples` / `removeExamples` only ever touch flagged items. Slugs in `types.ts`.
- **Shared editor pieces**: `useAutosave` + `SaveIndicator`, `ExportMenu`, `ExamplesBar`, `useHistory` +
  `UndoRedoButtons` (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y; text fields keep native undo), `VolumeControl`,
  `src/lib/pixels.ts` (decoded image cache), `src/lib/gif.ts` (GIF89a encoder).
- **Import**: `src/lib/import/` (contract + how to add one in its `README.md`). One file per `Importer` (`parse` →
  items with fresh ids + warnings) listed in the tool's array (`CANVAS_IMPORTERS`…); `useImport` + `<ImportMenu>`
  (right before `ExportMenu`) + `<ImportDropZone>`; `jsonReimporter` re-imports a tool's own JSON export.

## Conventions (agreed with the owner)

- Everything is free, no watermark, no sign-up required; keep saying so where people export.
- Never generate assets with AI. Examples are hand-made data in code that users edit and make their own.
- Each tool has its own colour (`ASSET_KINDS[type].color`). The layout tints the workspace and sets `--accent` /
  `--on-accent` to it, so primary buttons are written as `background: var(--accent)`; never hardcode purple.
- Desktop layout is considered done. Phone fixes use `max-md:` classes (or mobile base classes restored by `md:`) so
  desktop stays pixel-identical.
- Every edit autosaves; every editor has undo/redo, a `SaveIndicator`, an `ExportMenu` at the right of its toolbar
  and an `ExamplesBar`. Secondary buttons use `var(--text-primary)` text so they never look disabled. Icon-only
  buttons need `title` + `aria-label`. Pointer cursor and hover come from `globals.css`.
- The app is marked **beta** in the UI and README.
- Commit messages: short imperative summary + a body explaining why. Don't commit secrets; `.env*` is ignored
  except `.env.example`.

## Testing

vitest unit tests cover the voxel lib and the examples (`npm test`). UI changes are still verified by building, running `next start`, and driving the app with
Playwright (desktop 1440×900 and phone 390×844): create a project with examples, open every tool, check for page
errors and horizontal overflow on phones, and exercise the feature changed. Do the same before pushing UI work.

## Known gaps

- Task Board: on touch screens cards move via a "Move to…" menu, not drag.
- Dialogue condition nodes have a single exit (no "else" branch).
- Cloud sign-in hasn't been tested end to end yet, and neither have Realtime live updates (unit-tested with mocks).
- Folder sync has no live updates: edits made to the JSON files on disk show up only after reconnecting the folder
  or reloading.
- 3D Pixel Art (voxels, route `/voxels`): OBJ `Kd` is written in linear colour, so OBJ colours look dark in Godot/Unity/three.js; use `.glb` for engines.

## Next up (from competitor research, highest value first)

Pixel Art animation tags + per-frame durations · Tilemap auto-tiling and collision layer · one-click engine exports
(Godot, Unity, Phaser, Tiled) · mirror / pixel-perfect / dither tools and Lospec palette import · Tilemap object layer
· dialogue variables and localisation CSV · story timeline and world map · multi-pattern songs, envelopes, MIDI ·
pixel font maker · read-only share links and a "play this level" preview.
