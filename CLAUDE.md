@AGENTS.md

# GameDev Studio

Free, open source, browser-based game-dev toolkit (beta). Live at https://gamedev-studio.pladsen.dev, deployed by the
owner through Vercel from `main`.

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run build` — production build (must pass before pushing; Vercel runs the same)
- `npm test` — vitest unit tests
- `npx tsc --noEmit -p .` — typecheck
- `npm run lint` — ESLint (a few older `react-hooks/set-state-in-effect` findings remain; don't add new ones)

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
- **Supabase**: tables `projects` and `assets` (JSON bodies, row level security per user). Schema lives in
  `supabase/migrations/` and is applied by Supabase's GitHub integration. Adding a collection means a new migration
  that widens `assets_collection_check`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Assets & links**: `src/lib/assets.ts` (`ASSET_KINDS` registry: collection, label, tool path, colour) and
  `src/lib/links.ts` (`getRelated`, `addLink`, `removeLink`). Any asset can link to any other; story `[[wiki links]]`
  count too. `<LinkedAssets>` is the shared panel; `assetHref()` + `useOpenParam()` open an asset via `?open=<id>`.
- **Examples**: `src/lib/examples/` — one module per tool group; items get `example: true` and ids
  `ctx.id(slug)`; `addExamples` / `removeExamples` only ever touch flagged items. Slugs in `types.ts`.
- **Shared editor pieces**: `useAutosave` + `SaveIndicator`, `ExportMenu`, `ExamplesBar`, `useHistory` +
  `UndoRedoButtons` (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y; text fields keep native undo), `VolumeControl`,
  `src/lib/pixels.ts` (decoded image cache), `src/lib/gif.ts` (GIF89a encoder).

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

- Task Board: on touch screens cards move via a "Move to…" menu, not drag; undoing a deleted issue doesn't restore its links.
- Dialogue condition nodes have a single exit (no "else" branch).
- Cloud sign-in hasn't been tested end to end yet.
- Voxels: OBJ `Kd` is written in linear colour, so OBJ colours look dark in Godot/Unity/three.js; use `.glb` for engines.

## Next up (from competitor research, highest value first)

Pixel Art animation tags + per-frame durations · Tilemap auto-tiling and collision layer · one-click engine exports
(Godot, Unity, Phaser, Tiled) · mirror / pixel-perfect / dither tools and Lospec palette import · Tilemap object layer
· dialogue variables and localisation CSV · story timeline and world map · multi-pattern songs, envelopes, MIDI ·
pixel font maker · read-only share links and a "play this level" preview.
