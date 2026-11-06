# Music: song sections (Easy + Advanced)

Status: approved by the owner (2026-11-06).

## Why

Today a Music track is one loop of 8, 16 or 32 beats. Real game music has an intro, a verse, a chorus, a bridge, and
loops back to somewhere after the intro. "Multi-pattern songs" is the top music item in CLAUDE.md's "Next up".

The owner's words: **easy to use is VERY important**, and there should be **both an Easy and an Advanced mode**.
Someone who has never used a tracker should get a song out of this without reading help.

## Goals

- Build a song from a row of sections (A, B, Intro, Chorus…), each edited in the existing piano roll.
- Play the whole song (intro once, then loop) or just the open section.
- Export the whole song or one section as WAV.
- Advanced view: see and change which pattern each channel plays in each section, and share (link) a pattern
  between sections so one edit changes every use.
- Both views are one data model: switching never rebuilds or loses anything.

## Non-goals

- OGG, loop-point metadata, release tails, N loops + fade, stems, MIDI export: the next PR (game-ready export).
- Per-section tempo, key or instrument changes.
- Sections of other lengths than 8 / 16 / 32 beats; time signatures.
- MCP changes (it treats music as read-only).

## Anti-goals (a failure even if it works)

- A one-section song looks or behaves differently from today's tool. The song row only appears once a second
  section exists.
- Easy mode shows patterns, links or channel lanes. Those words and controls live only in Advanced.
- Existing songs change sound, length or layout when opened.
- Desktop layout changes outside the new row (CLAUDE.md: desktop is done; phone fixes use `max-md:`).

## Data model

```ts
interface MusicSection {
  id: string;
  name: string;              // "A", "B", "Intro"… default names are the next free letter
  length: 8 | 16 | 32;       // beats
  repeat?: number;           // plays this many times in a row, default 1 (2–8 in the menu)
  patterns: { channelId: string; patternId: string }[]; // a channel with no entry is silent here
}

interface MusicTrack {
  // …existing fields; channels[].patterns stays the pattern pool for each channel
  sections?: MusicSection[];
  loopStartId?: string;      // section id; missing = loop from the first section
}
```

- *(My call)* `patterns` is an array of `{ channelId, patternId }` and the loop start is `loopStartId`, not a
  `Record<channelId, patternId>` / `loopStart`: the shared JSON re-importer (`src/lib/import/reidentify.ts`) only
  rewrites values under `id` / `*Id` keys, never object keys, so the record shape would lose every section on
  re-import.

- **Legacy tracks** (no `sections`): read as one section named "A", using each channel's `patterns[0]`, length from
  today's `fitPatternLength`. A helper `getSections(track)` returns this so every reader (page, scheduler, render,
  preview, `trackLengthSeconds`) sees sections. Nothing is written until the first edit that needs sections
  (adding a second section, renaming, changing loop start or length, or any Advanced change); then sections are materialised
  and saved. Plain note edits on a legacy track keep writing to `patterns[0]` exactly as now.
- **Length** is stored per section and is the final word. *(My call)* Shortening a section keeps the notes past its
  end (silent, not shown; they come back if it is lengthened), as today's "Loop length" does. A linked pattern
  plays in each section only up to that section's length.
- **Song end** = end of the last section (including repeats). No separate end marker.
- **Song order** = `sections` array order. Each entry is its own block; Duplicate makes a new section, which shares
  nothing in Easy (it copies patterns) — see Links.
- **Pattern cleanup:** when a section is deleted, patterns no section references any more are dropped from the
  channel. (A legacy track's `patterns[1..]`, which nothing uses today, are left alone until then.)
- **Schema** (`src/lib/schema/audio.ts`): add `sections` and `loopStartId` as optional, loose like the rest. A section
  pointing at a missing channel or pattern is treated as silent for that channel, not an error.
- **Import** (`song-json.ts`): drop section refs to missing patterns, drop `loopStartId` if it names no section.
  MIDI import is unchanged (one section).

## Easy mode (default)

```
[ Song | Section ]  ▶  ⟳                                  ← existing transport, toggle only with 2+ sections
┌──────┐┌──────┐┌──────────┐┌──────┐  [+ Add section]
│Intro ││ A ⟲  ││ B   ×2   ││ A    │                       ⟲ = "Loop from here"
└──────┘└──────┘└──────────┘└──────┘
──────────── existing piano roll, showing the selected block ────────────
```

- **One section = today's tool.** No row; instead an "Add section" button sits next to the "Loop length" select.
  It opens the same Copy / Empty menu as below and creates the row with "A" (the existing loop) and "B".
- **Blocks:** width proportional to length × repeat (so the row reads as a timeline), name, repeat badge (×2),
  loop-from-here icon on the loop start block, chain icon when any of its channels uses a linked pattern. A tiny
  4-row mini-map of notes inside each block helps recognise them (builder may drop it if it hurts performance).
  The selected block is highlighted in `var(--accent)`.
- **Click a block** → the piano roll edits that section. The "Loop length" select edits the selected section's length.
- **Add section** → menu: "Copy of <selected>" (default, first) or "Empty". Inserted after the selected block,
  becomes selected.
- **Reorder:** drag a block on desktop. On touch, the block menu has "Move left" / "Move right" (Task Board uses the
  same pattern).
- **Block menu** (right-click / long-press, on the shared `ContextMenu`): Rename, Duplicate, Repeat (×1–×8),
  Loop from here, Move left / right, Delete. Delete of the last remaining section is not offered. Deleting is undoable.
- **Loop from here:** exactly one block has it (the first by default, so with no change the whole song loops).
  Blocks before it are the intro; they play once.
- **Row overflow:** scrolls horizontally inside its own container; never widens the page on phones.

## Advanced mode ("Show channels")

A "Show channels" toggle at the right of the song row. It is a view preference in `localStorage`
(`music.showChannels`), not song data.

```
            ┌──────┐┌──────┐┌──────────┐
Sections    │Intro ││ A ⟲  ││ B   ×2   │
Square 1    │ p1   ││ p2 ⛓ ││ p2 ⛓     │
Square 2    │ p3   ││ p4   ││  —       │                    — = silent
Triangle    │ …
Noise       │ …
```

- The row grows one lane per channel. Each cell shows that channel's pattern in that section (short label + mini
  notes), or "—" when silent.
- **Click a cell** → selects that section and that channel in the piano roll.
- **Cell menu:** Use pattern ▸ (list of this channel's patterns, by label, with where each is used), New empty
  pattern, Make silent, Link to… (pick another section's pattern for this channel; same as Use pattern), Unlink
  (make a separate copy).
- **Links:** a pattern used in 2+ cells is *linked*; every such cell shows a chain icon. Editing its notes changes
  every use (FamiStudio-style). While editing a linked pattern, a small notice above the roll says
  "Also plays in B, Chorus" with an "Unlink" button (in Easy mode the button reads "Make separate").
- Pattern labels are generated (`1`, `2`, … per channel, in order of first use) — not stored, not renamable.
- **Back to Easy:** links stay. Blocks with linked patterns show the chain icon; the linked notice still shows in the
  roll. Easy's Duplicate copies patterns (never links), so links only ever come from Advanced.

## Editing rules (both modes)

- Painting into a channel that is silent in the open section creates a new pattern for it in that section.
- Undo/redo covers every section and Advanced change, using the existing `useHistory` on the whole track.
- Live updates: *(my call)* Music keeps being re-mounted by `<LiveRefresh>` (moving it to `useRemoteChanges` is
  separate work). The selected section is kept in the URL (`&section=<id>`) so a re-mount reopens it; if it was
  deleted elsewhere, select the first. Undo history restarts on a re-mount, as today.

## Playback

- With 2+ sections the transport gets a **Song / Section** toggle (default Song).
  - **Song:** plays sections in order (repeats included). With loop on, after the last section it jumps to the loop
    start block; with loop off, it stops at the end.
  - **Section:** loops (or plays once) the selected section, exactly as today.
- The playing block shows a progress fill. The roll's playhead shows only while the playing section is the one open.
  Clicking another block while playing in Song mode does not jump playback (builder's call whether a double-click
  should "play from here").
- `music-scheduler.ts`: `LiveSong` carries the resolved section sequence instead of `patternLen`; `scheduleWindow`
  walks it and wraps to `loopStart`; `beatAt` returns `{ sectionIndex, beat }`. Edits while playing are heard on
  the next pass, as now.
- `trackLengthSeconds` (asset previews): with 2+ sections, intro + one pass of the loop. *(My call)* A one-section
  track keeps today's behaviour (stops after the last note), so existing previews don't change length.

## Export

- "WAV (whole song)": intro + one pass of the loop part. "WAV (this section)": today's export, for the selected
  section. With one section only the existing single item shows.
- `music-render.ts` renders the same section sequence the scheduler uses.

## Examples, help, docs

- Each hand-made music example gets an intro and a looping section (or two), written by hand in
  `src/lib/examples/audio.ts`. Never generated.
- Help (`COPY.help` / music help content): explain sections, loop from here, Song/Section, and in Advanced: links.
- CLAUDE.md "Next up": remove "multi-pattern songs".
- What's new: a changelog line + version bump go in #30 while it is open (this branch doesn't have the feature);
  if #30 has merged by then, in this PR.

## Code shape

- Extract `SongRow` (Easy + Advanced lanes) into `src/components/music/SongRow.tsx`; the page (≈1076 lines) only
  wires it.
- Pure helpers in `src/lib/music-sections.ts`: `getSections`, `materialiseSections`, `addSection`,
  `duplicateSection`, `deleteSection` (+ pattern cleanup), `moveSection`, `setPattern`, `unlink`, `linkedUses`,
  `songSequence`. Unit-tested.
- Branch `feat/music-sections`, stacked on `feat/music-instruments` (#37).

## Testing

- vitest: sections helpers, legacy read, scheduler walking sections + loop start + repeats, render length,
  song-json import cleanup, examples.
- Playwright desktop 1440×900 and phone 390×844: one-section track looks unchanged; add/duplicate/reorder/
  rename/repeat/delete/undo; Song vs Section playback progress; Advanced swap, link, edit-shows-notice, unlink;
  WAV exports; no horizontal overflow on phone.

## Left to the builder

- Exact block styling, mini-map rendering, drag implementation.
- Whether double-click on a block plays from there.
- Default name sequence details (skip used letters).
