# Music song sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Music track be a row of sections (intro once, then a loop), edited in the existing piano roll, with an
Advanced "Show channels" view for per-channel patterns and linked patterns.

**Architecture:** Sections live on `MusicTrack` (`sections`, `loopStartId`) and point into each channel's existing
`patterns` pool. All section logic is pure functions in `src/lib/music-sections.ts`; the scheduler, offline render
and asset preview consume a flat list of `SongStep`s built from them. The page keeps a selected section id and wires a
new `SongRow` component; legacy tracks (no `sections`) are read as one virtual section and only written as sections
on the first section-level edit.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, zod, Web Audio (`OfflineAudioContext` for render), vitest,
Playwright for UI checks.

**Spec:** `docs/superpowers/specs/2026-11-05-music-song-sections-design.md`

## Global Constraints

- Branch `feat/music-sections` (worktree `.claude/worktrees/music-sections`), stacked on `feat/music-instruments` (#37).
- A one-section song looks and behaves exactly like today's tool: no song row, only an "Add section" button next to "Loop length".
- Easy mode never shows the words "pattern", "link" or channel lanes; those live only behind "Show channels".
- Opening an existing song never changes its sound, length or layout, and writes nothing.
- Desktop stays pixel-identical outside the new row and button; phone fixes use `max-md:` classes.
- Section lengths are only 8, 16 or 32 beats; repeat is 1–8.
- Primary buttons use `background: var(--accent)`; secondary buttons `var(--text-primary)` text; icon-only buttons need `title` + `aria-label`.
- Examples are hand-written data, never generated.
- "Show channels" is stored in `localStorage` key `music.showChannels`, not in the song.
- Selected section is mirrored in the URL as `&section=<id>`.
- `npm test`, `npx tsc --noEmit -p .`, `npm run lint` (no new findings) and `npm run build` pass before the PR.

## Review Focus

1. Deleting the section that has "Loop from here": loop start moves to the section that took its place (next, or previous if it was last), never dangles.
2. A linked pattern used in an 8-beat and a 32-beat section: in the 8-beat one, notes at beat ≥ 8 are silent and hidden, and come back if it is lengthened.
3. A live update re-mounts the page while the selected section was deleted elsewhere: the first section opens, no crash.
4. Undo right after the first section edit on a legacy song returns it to legacy shape and the open section stays selected (the legacy section id is stable).
5. Exporting a song as JSON and importing it back keeps every section, link and the loop start (the shared re-importer rewrites `*Id` values only).

---

### Task 1: Types, schema and read helpers

**Files:**
- Modify: `src/types/index.ts:123-179` (add `MusicSection`, `MusicSectionPattern`, fields on `MusicTrack`)
- Modify: `src/lib/schema/audio.ts:28-50`
- Create: `src/lib/music-sections.ts`
- Test: `src/lib/music-sections.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/types/index.ts
  export type MusicSectionLength = 8 | 16 | 32;
  export interface MusicSectionPattern { channelId: string; patternId: string }
  export interface MusicSection { id: string; name: string; length: MusicSectionLength; repeat?: number; patterns: MusicSectionPattern[] }
  // MusicTrack gains: sections?: MusicSection[]; loopStartId?: string;

  // src/lib/music-sections.ts
  export const SECTION_LENGTHS: MusicSectionLength[]; // [8, 16, 32]
  export const LEGACY_SECTION_ID = "section-a";
  export function fitPatternLength(track: MusicTrack): MusicSectionLength; // moved from music/page.tsx, unchanged logic
  export function isLegacy(track: MusicTrack): boolean;                  // !track.sections?.length
  export function getSections(track: MusicTrack): MusicSection[];
  export function findPattern(track: MusicTrack, section: MusicSection, channelId: string): MusicPattern | undefined;
  export function sectionNotes(track: MusicTrack, section: MusicSection, channelId: string): MusicNote[]; // [] when silent; only notes with start < section.length
  export function resolveSelectedSection(track: MusicTrack, id: string | null): MusicSection; // falls back to first
  export interface SongStep { sectionId: string; length: number }
  export function songSteps(track: MusicTrack, mode: "song" | "section", sectionId: string): { steps: SongStep[]; loopIndex: number };
  ```

- [ ] **Step 1: Write failing tests** in `src/lib/music-sections.test.ts`:
  - `getSections` on a legacy track with notes ending at beat 12 → `[{ id: "section-a", name: "A", length: 16, patterns: [one entry per channel that has patterns[0]] }]`.
  - Legacy channel with an empty `patterns` array has no entry (silent).
  - `getSections` on a track with `sections` returns them unchanged (same reference).
  - Unknown `patternId` or `channelId` in a section → `sectionNotes` returns `[]`.
  - `sectionNotes` drops notes with `start >= section.length` (8-beat section, notes at 2 and 9 → only 2).
  - `resolveSelectedSection(track, "gone")` and `(track, null)` → first section.
  - `songSteps` for sections `Intro(8) A(16, repeat 2) B(8)` with `loopStartId = A`, mode `"song"` → steps `[Intro 8, A 16, A 16, B 8]`, `loopIndex: 1`.
  - `songSteps` with no `loopStartId` → `loopIndex: 0`; `loopStartId` naming no section → `loopIndex: 0`.
  - `songSteps(track, "section", "B")` → `{ steps: [B 8], loopIndex: 0 }` (repeat ignored in section mode).
- [ ] **Step 2: Run** `npx vitest run src/lib/music-sections.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the types, then the helpers. Schema: add `sections: z.array(z.looseObject({ id, name: z.string(), length: z.union([z.literal(8), z.literal(16), z.literal(32)]), repeat: z.number().int().min(1).max(8).optional(), patterns: z.array(z.looseObject({ channelId: z.string(), patternId: z.string() })) })).optional()` and `loopStartId: z.string().optional()`.
- [ ] **Step 4: Run** the test file and `npx tsc --noEmit -p .` — expect PASS. (The page still has its own `fitPatternLength`; switch its import to the new one in this step and delete the local copy.)
- [ ] **Step 5: Commit** `src/types/index.ts src/lib/schema/audio.ts src/lib/music-sections.ts src/lib/music-sections.test.ts src/app/(app)/project/[projectId]/music/page.tsx` — "Add song section types and read helpers to Music".

### Task 2: Section edit helpers

**Files:**
- Modify: `src/lib/music-sections.ts`
- Test: `src/lib/music-sections.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces (all pure, return a new track; never mutate):
  ```ts
  export function materialise(track: MusicTrack): MusicTrack; // legacy → sections: [getSections(track)[0]]; others unchanged
  export function nextSectionName(sections: MusicSection[]): string; // "A","B",… skipping used names; after "Z": "Section 27"…
  export function addSection(track: MusicTrack, afterId: string, mode: "copy" | "empty"): { track: MusicTrack; sectionId: string };
  export function deleteSection(track: MusicTrack, id: string): MusicTrack;
  export function moveSection(track: MusicTrack, id: string, delta: -1 | 1): MusicTrack;
  export function updateSection(track: MusicTrack, id: string, patch: Partial<Pick<MusicSection, "name" | "length" | "repeat">>): MusicTrack;
  export function setLoopStart(track: MusicTrack, id: string): MusicTrack;
  export function setSectionNotes(track: MusicTrack, sectionId: string, channelId: string, update: (notes: MusicNote[]) => MusicNote[]): MusicTrack;
  export function assignPattern(track: MusicTrack, sectionId: string, channelId: string, patternId: string | "new" | null): MusicTrack;
  export function unlinkPattern(track: MusicTrack, sectionId: string, channelId: string): MusicTrack;
  export function patternUses(track: MusicTrack, patternId: string): MusicSection[]; // sections using it, in song order, deduped
  export function patternLabel(track: MusicTrack, channelId: string, patternId: string): string; // "1","2"… by first use in song order
  ```

- [ ] **Step 1: Write failing tests:**
  - `materialise(legacy).sections[0].id === LEGACY_SECTION_ID` and its notes equal the legacy ones; `materialise` on a sectioned track returns the same reference.
  - Every edit helper called on a legacy track materialises first (e.g. `updateSection(legacy, "section-a", { name: "Verse" }).sections[0].name === "Verse"`).
  - `addSection(t, "A", "copy")`: new section after A, name "B", same length, each channel gets a **new** pattern whose notes deep-equal A's (different pattern ids, so not linked); `"empty"` → same length as A, `patterns: []`. Returned `sectionId` is the new one.
  - `nextSectionName` with names `["A","B","Intro"]` → `"C"`; with `["A","C"]` → `"B"`.
  - `deleteSection` on the only section returns the track unchanged.
  - `deleteSection` drops patterns no remaining section references, keeps ones still used elsewhere.
  - Review Focus 1: deleting the loop-start section sets `loopStartId` to the section now at that index (or the new last one); deleting another section leaves it.
  - `moveSection` swaps with its neighbour; at the ends it is a no-op.
  - `updateSection(t, id, { length: 8 })` keeps notes at beat ≥ 8 in the pattern (Review Focus 2: `sectionNotes` hides them; setting length back to 16 shows them).
  - `setSectionNotes` on a legacy track writes `channels[i].patterns[0]` and leaves `sections` undefined.
  - `setSectionNotes` on a sectioned track where the channel is silent creates a pattern, appends it to `channel.patterns` and adds `{ channelId, patternId }` to that section only.
  - `setSectionNotes` on a linked pattern changes the notes heard in every section using it.
  - `assignPattern(…, "new")` gives an empty new pattern; `null` removes the entry (silent); an existing id links it.
  - `unlinkPattern` gives this section a copy (new id, same notes); the other section keeps the original.
  - `patternUses` and `patternLabel` (first used pattern of a channel is "1", next new one "2").
- [ ] **Step 2: Run** `npx vitest run src/lib/music-sections.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the helpers. Pattern ids via `uuid` (as the page does). Unreferenced-pattern cleanup runs only in `deleteSection`.
- [ ] **Step 4: Run** the tests — expect PASS.
- [ ] **Step 5: Commit** — "Add song section editing helpers to Music".

### Task 3: Scheduler, render and preview walk the section sequence

**Files:**
- Modify: `src/lib/audio/music-scheduler.ts`, `src/lib/audio/music-render.ts`, `src/lib/audio/music-synth.ts:89-97`, `src/lib/audio/preview.ts:64-73`
- Test: `src/lib/audio/music-scheduler.test.ts`, `src/lib/audio/music-render.test.ts`, `src/lib/audio/music-synth.test.ts`
- Modify (callers, to keep the build green): `src/app/(app)/project/[projectId]/music/page.tsx` (`songRef`, `beatAt`, `renderLoop` call), passing `songSteps(track, "section", resolveSelectedSection(track, null).id)` for now.

**Interfaces:**
- Consumes: `songSteps`, `getSections`, `sectionNotes`, `SongStep` (Task 1).
- Produces:
  ```ts
  // music-scheduler.ts
  export interface LiveSong { track: MusicTrack; steps: SongStep[]; loopIndex: number; muted: boolean[]; soloed: boolean[]; looping: boolean }
  export interface PlayCursor { time: number; step: number; beat: number }
  export function scheduleWindow(song: LiveSong, cursor: PlayCursor, until: number): { notes: DueNote[]; cursor: PlayCursor; ended: boolean };
  export function beatAt(song: LiveSong, cursor: PlayCursor, now: number): { step: number; beat: number };
  // music-render.ts
  export interface RenderOptions { steps: SongStep[]; muted: boolean[]; soloed: boolean[]; sampleRate?: number; createContext?: … }
  export function songSampleCount(track: MusicTrack, steps: SongStep[], sampleRate: number): number; // replaces loopSampleCount
  export function renderSong(track: MusicTrack, options: RenderOptions): Promise<Float32Array>;     // replaces renderLoop
  ```

- [ ] **Step 1: Update the test helper** `song()` in `music-scheduler.test.ts` to build `steps: [{ sectionId: LEGACY_SECTION_ID, length: 4 }]`, `loopIndex: 0`, cursor `{ time, step: 0, beat }`; existing tests keep their expected times. Add failing tests:
  - Two sections A(4) B(4), notes at A:0 and B:1, looping off: starts `[0, 5]` (bpm 60), then `ended`.
  - Intro(4) + A(4) with `loopIndex: 1`, looping on, window to 13s: intro note heard once, A's note at 4, 8, 12.
  - Section repeat ×2 expands to two passes (via `songSteps`).
  - Review Focus 2: linked pattern with a note at beat 6, used in an 8-beat and a 4-beat section → heard only in the 8-beat one.
  - `beatAt` just after a step boundary when the cursor is already past it returns the previous step and its beat (e.g. steps A(4) B(4), cursor `{ step: 1, beat: 0.1 }`, `now` 0.2 beat earlier → `{ step: 0, beat: 3.9 }`); before beat 0 of step 0 → `{ step: 0, beat: 0 }`; across the loop wrap → last step.
- [ ] **Step 2: Run** `npx vitest run src/lib/audio` — expect FAIL.
- [ ] **Step 3: Implement.** Notes for a step come from `sectionNotes(track, section, channel.id)` for the section with `step.sectionId` (looked up from `getSections` each tick, so edits are heard on the next pass). At the end of the last step: `looping` → jump to `loopIndex`, else `ended`. `renderSong` = `scheduleWindow` with `looping: false` over `songSampleCount`. `trackLengthSeconds`: legacy/one-section track keeps the last-note-end rule; 2+ sections = sum of `songSteps(track, "song", …).steps` lengths in seconds. `preview.ts` `startMusic` schedules via `scheduleWindow` over `songSteps(track, "song", first.id)` with `looping: false`, `muted`/`soloed` all false.
- [ ] **Step 4: Add tests** in `music-synth.test.ts`: legacy track length unchanged (last note end); two sections 8 + 16 beats at 120 bpm → 12 s. In `music-render.test.ts`: `songSampleCount` for steps 8 + 8 at 60 bpm, 100 Hz → 1600. Run `npx vitest run src/lib/audio` and `npx tsc --noEmit -p .` — expect PASS.
- [ ] **Step 5: Commit** — "Play and render Music songs section by section".

### Task 4: Song JSON import keeps sections

**Files:**
- Modify: `src/lib/import/music/song-json.ts`
- Test: `src/lib/import/music/song-json.test.ts`

**Interfaces:**
- Consumes: `MusicSection` types (Task 1).
- Produces: imported tracks with sections whose refs all resolve.

- [ ] **Step 1: Write failing tests:**
  - Review Focus 5: a song with sections A, B (B links A's melody pattern) and `loopStartId = B`, run through the music re-importer: result has 2 sections, fresh ids, every `patternId` / `channelId` / `loopStartId` points at an id in the imported track, and A and B still share one pattern id.
  - A section entry pointing at a missing pattern is dropped (channel silent there); a `loopStartId` naming no section is removed; a song whose `sections` is not an array imports as legacy.
- [ ] **Step 2: Run** `npx vitest run src/lib/import/music` — expect FAIL.
- [ ] **Step 3: Implement** the validation/cleanup in `song-json.ts` after `reidentify` runs.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** — "Keep song sections when importing Music JSON".

### Task 5: Easy mode — song row, selection, Song/Section, exports

**Files:**
- Create: `src/components/music/SongRow.tsx`
- Create: `src/lib/music-section-menu.ts` (pure, like `src/lib/diagrams/canvas-menu.ts`)
- Test: `src/lib/music-section-menu.test.ts`
- Modify: `src/app/(app)/project/[projectId]/music/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  // music-section-menu.ts
  export interface SectionMenuActions { rename(): void; duplicate(): void; setRepeat(n: number): void; loopFromHere(): void; move(delta: -1 | 1): void; remove(): void }
  export function buildSectionMenu(track: MusicTrack, sectionId: string, actions: SectionMenuActions): ContextMenuEntry[];
  // SongRow.tsx
  export interface SongRowProps {
    track: MusicTrack;
    selectedId: string;
    playing: { sectionId: string; beat: number } | null;
    showChannels: boolean;
    onSelect(sectionId: string): void;
    onChange(track: MusicTrack, selectId?: string): void;
    onToggleChannels(): void;
    onSelectCell(sectionId: string, channelIndex: number): void; // used in Task 6
  }
  export function SongRow(props: SongRowProps): React.JSX.Element;
  ```

- [ ] **Step 1: Write failing tests** for `buildSectionMenu`: entries in order Rename, Duplicate, Repeat (submenu ×1–×8, current one hinted), Loop from here (disabled on the current loop start), separator, Move left (disabled on first), Move right (disabled on last), separator, Delete (`danger`; absent when it is the only section).
- [ ] **Step 2: Run** `npx vitest run src/lib/music-section-menu.test.ts` — expect FAIL; implement; run — expect PASS.
- [ ] **Step 3: Page state.** Replace `patternLen` state with `selectedSectionId` (init from `useSearchParams().get("section")` through `resolveSelectedSection`; written back with `window.history.replaceState` keeping other params) and derive `patternLen = selectedSection.length`. "Loop length" select → `updateSection(track, id, { length })` (saves sections on legacy, per spec). `setActiveNotes` → `setSectionNotes(t, selectedId, channel.id, fn)`. Background notes and `activeNotes` read `sectionNotes`. Opening another track selects its first section.
- [ ] **Step 4: Play mode.** `playMode: "song" | "section"` state (default `"song"`); the toggle renders next to Loop only when `getSections(track).length > 1`; with one section `songSteps(…, "section", …)` is used. `songRef` = `{ track, ...songSteps(track, playMode, selectedId), muted, soloed, looping }`. Playhead: store `{ step, beat }`; roll playhead shows only when `steps[step].sectionId === selectedId`; `SongRow` gets `playing`. Clicking a block while playing does not move playback.
- [ ] **Step 5: Exports.** One section: today's single "WAV (this pattern)" item, text unchanged. Two+: "WAV (whole song)" (description: intro + one pass of the loop) → `renderSong` with `songSteps(track, "song", …).steps`; "WAV (this section)" → `songSteps(track, "section", selectedId).steps`.
- [ ] **Step 6: SongRow (Easy).** One section: render only an "Add section" button (secondary style) after the "Loop length" select. Two+: a horizontally scrolling row (`overflow-x-auto`, never widens the page) above the roll with blocks sized by `length × repeat`, name, `×N` badge, loop-from-here icon (lucide `Repeat`) on the loop start, chain icon (lucide `Link`) when any channel's pattern there has `patternUses > 1`, progress fill while it plays, accent outline when selected, and an "Add section" button at the end. "Add section" opens a `ContextMenu` with "Copy of <name>" (first) and "Empty". Block right-click / long-press (500 ms, like the Canvas) opens `buildSectionMenu`. Drag-to-reorder on pointer devices (builder's implementation); touch uses Move left/right. Rename edits inline. Mini-map of notes per block is optional.
- [ ] **Step 7: Run** `npx tsc --noEmit -p .`, `npm run lint`, `npm test` — expect PASS, no new lint findings.
- [ ] **Step 8: Playwright check** (desktop 1440×900, phone 390×844, `npm run build && npx next start`): a legacy example song shows no row and the same toolbar; Add section → row with A, B; duplicate, rename, repeat ×2, loop from here, reorder, delete, undo/redo each; Song vs Section playback moves the progress fill; both WAV exports download; reload with `&section=` reopens that section; Review Focus 3 (delete the selected section in a second tab, the page re-mounts on the first); Review Focus 4 (undo after the first Add section); no horizontal overflow on phone.
- [ ] **Step 9: Commit** — "Add song sections to the Music tool".

### Task 6: Advanced mode — channel lanes and linked patterns

**Files:**
- Create: `src/components/music/ChannelLanes.tsx`
- Modify: `src/components/music/SongRow.tsx`, `src/lib/music-section-menu.ts` (+ test), `src/app/(app)/project/[projectId]/music/page.tsx`

**Interfaces:**
- Consumes: `assignPattern`, `unlinkPattern`, `patternUses`, `patternLabel` (Task 2); `SongRowProps.showChannels`, `onSelectCell` (Task 5).
- Produces:
  ```ts
  export interface CellMenuActions { usePattern(patternId: string): void; newPattern(): void; makeSilent(): void; unlink(): void }
  export function buildCellMenu(track: MusicTrack, sectionId: string, channelId: string, actions: CellMenuActions): ContextMenuEntry[];
  ```

- [ ] **Step 1: Write failing tests** for `buildCellMenu`: "Use pattern" submenu lists this channel's patterns by `patternLabel` with a hint naming the sections each plays in (current one disabled); "New empty pattern"; "Make silent" (disabled when already silent); "Unlink" only when `patternUses > 1`. Run — FAIL; implement; run — PASS.
- [ ] **Step 2: Toggle.** "Show channels" button at the right of the song row (only with 2+ sections), persisted in `localStorage` `music.showChannels`.
- [ ] **Step 3: Lanes.** `ChannelLanes` renders one lane per channel under the block row, cells aligned to blocks: pattern label + chain icon when linked, "—" when silent. Click → `onSelectCell` (page sets selected section and `activeChannelIdx`). Right-click / long-press → `buildCellMenu`.
- [ ] **Step 4: Linked notice.** Above the roll, in both modes, when the open channel's pattern in the open section has other uses: "Also plays in B, Chorus" with an "Unlink" secondary button calling `unlinkPattern`.
- [ ] **Step 5: Run** `npx tsc --noEmit -p .`, `npm run lint`, `npm test` — PASS.
- [ ] **Step 6: Playwright check** (desktop + phone): toggle persists across reload; use pattern from another section links it (chain icons appear in both cells and on both Easy blocks); editing it shows the notice and changes both; Unlink separates them; make silent; switching back to Easy keeps links; no phone overflow.
- [ ] **Step 7: Commit** — "Add a Show channels view with linked patterns to Music".

### Task 7: Examples, help and docs

**Files:**
- Modify: `src/lib/examples/audio.ts`, `src/lib/help-content.ts:70-95`, `CLAUDE.md` ("Next up")
- Create: `src/lib/examples/audio.test.ts`

**Interfaces:**
- Consumes: `MusicSection` types; `getSections`, `songSteps` for the test.

- [ ] **Step 1: Write a failing test**: every music example has ≥ 2 sections, a `loopStartId` that names one of them that is not the first (so it has an intro), every section ref resolves to a pattern of that channel, and section ids are built with `ctx.id(…)`.
- [ ] **Step 2: Run** `npx vitest run src/lib/examples` — FAIL.
- [ ] **Step 3: Write by hand**, for each of Overworld, Chill Loop, Title Theme, Boss Battle: a short intro section (new hand-written notes) plus the existing loop as the loop section, and for at least one example a second loop section that links the drums pattern (so Advanced has something to show). Extend the `channel()` helper to take extra patterns; ids via `ctx.id`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Help.** In `help-content.ts` music: canDo "Build a song from sections: an intro that plays once, then parts that loop."; replace "Export the pattern as a WAV file." with "Export the whole song or one section as a WAV file."; steps add "Press Add section to start a second part; click a block to edit it."; tips add "Right-click or long-press a section to rename, repeat, move or loop from it." and "Show channels lets each channel play a different pattern per section. Linked patterns (chain icon) change everywhere they play."
- [ ] **Step 6: CLAUDE.md** "Next up": remove "multi-pattern songs" from the music item, keep "envelopes, MIDI" only if still true (envelopes shipped in #37: leave "MIDI").
- [ ] **Step 7: Run** `npm test` — PASS. **Commit** — "Give the Music examples intros and sections".

### Task 8: Final verification and PR

- [ ] **Step 1:** `npm test && npx tsc --noEmit -p . && npm run lint && npm run build` — all pass, no new lint findings.
- [ ] **Step 2:** Full Playwright sweep per CLAUDE.md (create a project with examples, open every tool, page errors, phone overflow) plus the Task 5/6 checks on a fresh example.
- [ ] **Step 3:** Ask the owner before pushing; open the PR against `feat/music-instruments` (retarget to `main` after #37 merges). PR body lists the design-doc calls and the known gap (WAV tails cut at song end until game-ready export).
- [ ] **Step 4:** Changelog line + version bump for song sections goes into #30 (`feat/whats-new`) while it is open — that's another branch, so ask the owner first; if #30 has merged, add it in this PR.
