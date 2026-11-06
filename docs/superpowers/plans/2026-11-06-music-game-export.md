# Music game-ready export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Export for game…" dialog in Music that makes seamless OGG/WAV loops, intro+loop pairs, fade-out versions and stems, plus a MIDI export.

**Architecture:** Pure sample helpers and an export planner in `src/lib/audio/music-game-export.ts` render through the existing offline path (`renderSong`), then encode with `encodeWav` (new `smpl` loop chunk) or a lazily loaded Vorbis encoder (`src/lib/audio/ogg.ts`, `wasm-media-encoders`). A MIDI writer sits next to the parser. The page adds two Export menu items and a dialog component.

**Tech Stack:** Next.js 16, React, TypeScript, Web Audio `OfflineAudioContext`, `wasm-media-encoders` (MIT), `fflate`, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-music-game-export-design.md`

## Global Constraints

- Worktree `.claude/worktrees/music-game-export`, branch `feat/music-game-export` from `main` (0694ee4).
- All rendering and encoding in the browser; the OGG encoder is `import()`ed only when an OGG export starts.
- 44.1 kHz mono; normalise target peak 0.891 (−1 dBFS); tail capped at 4 s; fade lengths 2/5/10 s (default 5); fade-out loops 1–4 (default 2).
- Game exports ignore mute/solo (all channels). Existing WAV menu items are unchanged.
- The dialog says "Free to use in any project, no watermark." and one plain sentence per choice.
- Choices persist in `localStorage` key `music.gameExport`.
- Primary buttons `background: var(--accent)`; secondary `var(--text-primary)` text; icon-only buttons need `title` + `aria-label`; phone fixes with `max-md:`; desktop unchanged elsewhere.
- Use npm (the repo has `package-lock.json`).
- `npm test`, `npx tsc --noEmit -p .` (only `packages/mcp/e2e` and generated `PageProps`/`LayoutProps` errors allowed in this worktree), `npm run lint` (no new findings) pass.

## Review Focus

1. A song with no intro: "Looping game music" loops from 0 with the tail wrapped at sample 0; "two files" is disabled.
2. A note that starts in the last beat and rings past the loop end: its tail is heard at the loop start, and the file length is still exactly loop start + loop length in samples.
3. Stems normalised with one shared gain: summing the stem samples equals the normalised mix (within float error).
4. Drums round-trip through MIDI: export then import gives the same noise pitch band for kick/snare/hat.
5. OGG encoder fails to load (offline/blocked WASM): the dialog shows an inline error and the WAV path still works.

---

### Task 1: Sample helpers and WAV loop points

**Files:**
- Modify: `src/lib/audio/wav.ts` (+ `wav.test.ts`)
- Create: `src/lib/audio/music-game-export.ts`, `src/lib/audio/music-game-export.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // wav.ts
  export function encodeWav(samples: Float32Array, sampleRate: number, bitDepth?: WavBitDepth, loop?: { start: number; end: number }): ArrayBuffer;
  // music-game-export.ts
  export const NORMALISE_PEAK = 0.891;
  export const MAX_TAIL_SECONDS = 4;
  export function tailSeconds(track: MusicTrack): number;            // longest channel release (envelope or Classic fade) + longest note overhang past its section end, capped
  export function wrapTail(samples: Float32Array, loopStart: number, loopEnd: number): Float32Array; // adds samples[loopEnd..] onto [loopStart..], returns length loopEnd
  export function fadeOut(samples: Float32Array, fadeStart: number, fadeLength: number): Float32Array; // cosine fade to 0 at fadeStart+fadeLength, silence after
  export function peakGain(buffers: Float32Array[], target?: number): number; // one gain so the loudest sample across all buffers hits target; 1 for silence
  export function applyGain(samples: Float32Array, gain: number): Float32Array;
  ```

- [ ] **Step 1: Failing tests:** `encodeWav` with `loop` writes a `smpl` chunk (RIFF size includes it; chunk id at the byte after the data; one loop, type 0, start/end as given); without `loop` output is byte-identical to today. `wrapTail`: samples `[0,0,0,0 | 1,1]` with loopStart 1, loopEnd 4 → `[0,1,1,0]`; tail longer than the loop wraps around again. `fadeOut`: value at fadeStart = original, at middle ≈ cos²-shaped, after end = 0. `peakGain([a,b])` uses the max abs over both; silence → 1. `tailSeconds`: Classic channel uses its fade length (read `music-synth.ts` for the Classic duration), envelope channel uses `releaseSeconds`, capped at 4.
- [ ] **Step 2:** Run `npx vitest run src/lib/audio/wav.test.ts src/lib/audio/music-game-export.test.ts` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS. Commit "Add loop points to WAV and sample helpers for game export".

### Task 2: OGG encoder

**Files:**
- Modify: `package.json`, `package-lock.json` (add `wasm-media-encoders`)
- Create: `src/lib/audio/ogg.ts` (+ `ogg.test.ts`)

**Interfaces:**
- Produces: `export async function encodeOgg(samples: Float32Array, sampleRate: number): Promise<Uint8Array>` — mono Vorbis, VBR quality ≈ 0.6, `import("wasm-media-encoders")` inside the function (never at module top). Throws `Error` with a plain message on load/encode failure.

- [ ] **Step 1:** `npm install wasm-media-encoders` (check the WASM URL/asset loading works with Next 16 Turbopack: read the package README and `node_modules/next/dist/docs/` on static assets/WASM; prefer the package's documented `createOggEncoder` with an explicit wasm URL if needed).
- [ ] **Step 2: Test:** one second of a 440 Hz sine encodes to bytes starting with `OggS` and containing `vorbis`; if WASM cannot load under vitest, mark the test `it.skipIf` with the reason and cover it in Task 5's Playwright run.
- [ ] **Step 3:** Implement; run the test; `npm run build` must still pass (use the worktree build workarounds from Task 5 notes if the symlinked node_modules breaks Turbopack, and revert them).
- [ ] **Step 4:** Commit "Add an OGG Vorbis encoder loaded on demand".

### Task 3: Export planner

**Files:**
- Modify: `src/lib/audio/music-game-export.ts` (+ test)

**Interfaces:**
- Consumes: Task 1 helpers; `renderSong`, `RENDER_SAMPLE_RATE` (`music-render.ts`); `songSteps`, `getSections` (`src/lib/music-sections.ts`); `encodeWav`; `encodeOgg` (injected for tests).
- Produces:
  ```ts
  export type GameExportMode = "loop" | "intro-and-loop" | "fade-out";
  export interface GameExportOptions { mode: GameExportMode; format: "ogg" | "wav"; stems: boolean; normalise: boolean; loops: 1 | 2 | 3 | 4; fadeSeconds: 2 | 5 | 10 }
  export const DEFAULT_GAME_EXPORT: GameExportOptions; // { mode: "loop", format: "ogg", stems: false, normalise: true, loops: 2, fadeSeconds: 5 }
  export interface ExportFile { name: string; bytes: Uint8Array }
  export function introSeconds(track: MusicTrack): number;   // beats before the loop step × 60/bpm (0 with no intro)
  export function hasIntro(track: MusicTrack): boolean;
  export async function buildGameExport(track: MusicTrack, options: GameExportOptions, deps?: { createContext?; encodeOgg? }): Promise<ExportFile>; // one file, or one ZIP when stems / intro-and-loop
  export function readGameExportOptions(raw: string | null): GameExportOptions; // validates, falls back to DEFAULT
  ```
  File names: `<song>.<ext>`, `<song> - intro.<ext>` / `<song> - loop.<ext>`, `<song> - <channel>.<ext>` (`safeFileName` from `sfx-export.ts`), ZIP `<song>.zip`.

- [ ] **Step 1: Failing tests** (fake `createContext` as in `music-render.test.ts`, fake `encodeOgg` returning tagged bytes): loop mode length = round(intro×44100) + round(loop×44100) and the WAV has `smpl` start = intro samples; Review Focus 1 (no intro → loop start 0, `hasIntro` false); Review Focus 2 (tail wrapped, exact length); intro-and-loop → ZIP with two entries of the right lengths; fade-out length = intro + N loops + fade + tail, last samples 0; stems → one entry per channel, same length, and Review Focus 3 (sum of stems = mix within 1e-5); mute/solo ignored; `readGameExportOptions` rejects bad JSON/values.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (render with `muted`/`soloed` all false; stems render with all-but-one muted). **Step 4:** PASS. Commit "Plan and render game-ready Music exports".

### Task 4: MIDI export

**Files:**
- Create: `src/lib/import/music/midi-write.ts` (+ `midi-write.test.ts`)

**Interfaces:**
- Consumes: `songSteps`, `getSections`, `sectionNotes`; `parseMidiFile` (tests); the importer's drum mapping in `midi.ts` (export the band helper or mirror it).
- Produces: `export function writeMidiFile(track: MusicTrack): Uint8Array` — format 1, 480 PPQ, tempo + 4/4 in track 0, one named track per channel, melodic on MIDI channels 0–2 with a GM program per instrument, drums on channel 9 with noise pitch → GM key so the importer maps back to the same band.

- [ ] **Step 1: Failing tests:** parse the output with `parseMidiFile`: format 1, tracks = channels + 1, tempo matches BPM, note starts/durations in ticks match intro + one loop pass (repeats expanded, notes past a section's length left out); Review Focus 4 (round-trip through the Music MIDI importer keeps drum bands).
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit "Add MIDI export for Music songs".

### Task 5: Dialog and menu items

**Files:**
- Create: `src/components/music/GameExportDialog.tsx`
- Modify: `src/app/(app)/project/[projectId]/music/page.tsx`

**Interfaces:**
- Consumes: `buildGameExport`, `DEFAULT_GAME_EXPORT`, `readGameExportOptions`, `introSeconds`, `hasIntro` (Task 3); `writeMidiFile` (Task 4); `downloadBlob` (as the page uses); `useDialogFocus` (see `src/components/WhatsNew.tsx`).
- Produces: `GameExportDialog({ track, onClose }): React.JSX.Element`.

- [ ] **Step 1:** Export menu gains, after the WAV items: "Export for game…" (description "OGG or WAV that loops cleanly, stems, fade-out") and "MIDI (.mid)" ("Notes and tempo for a music app like LMMS (free)").
- [ ] **Step 2:** Build the dialog exactly as the spec's sketch and explainer texts (loop start shown as `X.XX s`), persistence to `music.gameExport`, "Exporting…" state, inline error (Review Focus 5: make `encodeOgg` reject → error shown, WAV still exports). Phone: full-width sheet, no overflow.
- [ ] **Step 3:** `npx tsc`, `npm run lint`, `npm test` pass.
- [ ] **Step 4: Playwright** (desktop + phone; scripts under the worktree `.claude/pw/`, playwright at `/Users/magnuspladsen/.npm/_npx/a78846c3c5730f70/node_modules/playwright`; build with the temporary workarounds — `outputFileTracingRoot` → `/Users/magnuspladsen/git/gamedev-studio` in `next.config.ts`, `packages/mcp/e2e` in tsconfig `exclude` — `npx next start -p 3108`, then revert both files): Overworld, every mode × format, stems on/off, MIDI; downloads have the right names and sizes > 1 KB; OGG starts with `OggS`; explainer shows the loop start; no page errors; no phone overflow.
- [ ] **Step 5:** Commit "Add an Export for game dialog and MIDI export to Music".

### Task 6: Help, docs, changelog

**Files:** `src/lib/help-content.ts`, `CLAUDE.md`, `src/lib/changelog.ts`, `package.json`

- [ ] **Step 1:** Help per spec (keep canDo at 5 items; `tutorials.test.ts` checks).
- [ ] **Step 2:** CLAUDE.md "Next up": remove "MIDI" (tidy the separators).
- [ ] **Step 3:** New changelog entry `0.3.0-beta` dated 2026-11-06 with: `{ text: "Export for game: OGG or WAV that loops cleanly in your engine, an intro + loop pair, a fade-out version, stems, and MIDI.", tool: "music" }`; bump `package.json` version to `0.3.0-beta`.
- [ ] **Step 4:** `npm test` PASS. Commit "Document game-ready Music export".
