# Music: game-ready export

Status: owner said "make it" and skipped questions (2026-11-06). Every choice below is the builder's call unless noted.

## Why

Songs now have an intro and a loop (#38), but the only audio out is a plain WAV that stops dead at the end. To use a
song in a game, people open Audacity to: convert to OGG, trim to the exact loop, set the loop point, keep notes ringing
across the loop seam, make a faded version for credits, split channels, or take the notes to a DAW. The music research
(`docs/research/music-competitors.md` on `research/music-competitors`, items #6, #10, #11) ranks this the biggest reason
people leave the tool. CLAUDE.md "Next up" lists MIDI.

## Goals

- One **Export for game…** dialog that makes a file an engine can loop seamlessly, in OGG or WAV.
- Notes that ring past the loop end are heard at the loop start (tail wrapped), so the seam is clean.
- A **fade-out version**: intro + N loops, then a fade.
- **Stems**: the same export, one file per channel, all the same length, in a ZIP.
- **MIDI export** (`.mid`) of the song.
- Keep saying it's free with no watermark where people export.

## Non-goals

- MP3, reverb/echo/effects, mastering, per-channel EQ.
- OGG `LOOPSTART`/`LOOPLENGTH` comment tags (RPG Maker) and Godot `.import` files.
- Stereo or panning: renders stay mono, as today.
- SFX tool changes (the OGG encoder module is shared so SFX can use it later).
- Changing the existing "WAV (whole song)" / "WAV (this section)" / "WAV (this pattern)" items.

## Anti-goals

- A dialog that needs audio knowledge to use. Defaults must be right for most people, with one plain sentence per
  choice saying which engine wants it.
- Any server upload. Everything renders and encodes in the browser.
- A heavy first load: the encoder is loaded only when an OGG export starts.

## The dialog

Opened from the Music Export menu item **Export for game…** (description: "OGG or WAV that loops cleanly, stems,
fade-out"). A MIDI item sits next to it: **MIDI (.mid)**, "Notes and tempo for a music app like LMMS (free)".

```
Export for game                                         ×
  What for?   (•) Looping game music   ( ) Intro and loop as two files   ( ) Song with fade-out
              one line under the choice explains it (see below)
  Loops       [2 ▾]  (only for fade-out: 1–4)        Fade  [5 s ▾] (2/5/10 s)
  Format      (•) OGG — small, Godot's default     ( ) WAV — biggest, exact
  [ ] One file per channel (stems, as a ZIP)
  [x] Make it as loud as it can be without clipping
  Every channel is included; mute and solo are ignored.
  Free to use in any project, no watermark.        [Cancel] [Export]
```

- **Looping game music** (default): one file = intro + one pass of the loop part, ending exactly at the loop end, with
  the tail wrapped. Explainer: "Set the loop start to X.XX s in your engine. Godot reads it from the WAV by itself."
  (X.XX = intro length; shown live. With no intro: "Loops from the start.")
- **Intro and loop as two files**: a ZIP with `<name> - intro.<ext>` and `<name> - loop.<ext>` (the loop has the tail
  wrapped). Explainer: "For Unity and Phaser: play the intro once, then loop the second file." With no intro, the
  option is disabled with the hint "This song has no intro."
- **Song with fade-out**: intro + N loops, then the loop keeps playing while it fades to silence over F seconds, plus
  the release tail. Explainer: "For credits, trailers and videos."
- **Stems**: same choice and length per channel; ZIP of `<name> - <channel>.<ext>`. Normalising uses one gain for all
  stems (the loudest stem's peak) so they still add up to the mix. Combined with "two files": `<channel> - intro` and
  `<channel> - loop`.
- Mute/solo are ignored (all channels) — the existing WAV items keep respecting them.
- Phone: the dialog is a full-width sheet; follows the app's existing dialog patterns (`useDialogFocus`, Escape closes).
- The last choices are remembered in `localStorage` (`music.gameExport`).
- While exporting, the Export button shows "Exporting…" and is disabled; an error shows inline in the dialog.

## Audio rules

- Render through the existing offline path (`renderSong` / `scheduleWindow` / `scheduleNote`), 44.1 kHz mono, all
  channels.
- **Tail length** = the longest `releaseSeconds` of any channel's envelope (Classic channels: their fade) plus the
  longest note overhang past the end, capped at 4 s.
- **Tail wrap** (loop files): render the loop part followed by silence for the tail; the samples after the loop end are
  *added* onto the start of the loop part, then the file is cut at the loop end. With an intro, the wrap lands at the
  loop start (after the intro).
- **Fade**: equal-power (cosine) fade over F seconds starting at the end of loop N, then the tail.
- **Normalise**: peak to −1 dBFS (0.891). Off = render level as heard in the editor.
- **WAV loop points**: add a `smpl` chunk with one forward loop from the loop start sample to the last sample, so
  Godot 4 ("Loop Mode: Detect From WAV") loops it. Only for "Looping game music" (and its stems).
- **OGG**: Vorbis via `wasm-media-encoders` (MIT, WASM, lazy-imported on first OGG export), mono, 44.1 kHz, VBR quality
  ~0.6. The file ends exactly at the loop end, so engines that only take a loop start work.
- Sample-accurate lengths: the loop start in samples = round(intro seconds × 44100); the file length = loop start +
  round(loop seconds × 44100).

## MIDI export

- Standard MIDI file, format 1, 480 ticks per beat: a tempo track (BPM, 4/4) and one track per channel with its name.
- The song as Song mode plays it once: intro + one pass of the loop (repeats expanded). Notes past a section's length
  are left out, as in playback.
- Melodic channels on MIDI channels 1–3 with a GM program that roughly matches the instrument (square/sawtooth → Lead,
  triangle → Pad/Flute, sine → Sine-ish; builder picks); velocity = note velocity × 127.
- Drums (noise) go to channel 10, each noise pitch mapped to a GM drum key that the importer maps back to the same
  pitch band (kick / snare / hat), so export → import round-trips the drum feel.
- Writer next to the parser in `src/lib/import/music/` or `src/lib/music-midi-export.ts` (builder's call); unit-test
  by parsing the output with the existing `midi-file.ts` parser.

## Code shape

- `src/lib/audio/wav.ts`: `encodeWav` gains an optional `loop: { start, end }` (writes `smpl`). Existing callers
  unchanged.
- `src/lib/audio/ogg.ts`: `encodeOgg(samples, sampleRate): Promise<Uint8Array>` with the lazy import.
- `src/lib/audio/music-game-export.ts`: pure planning + sample work (`tailSeconds`, `wrapTail`, `fadeOut`,
  `normalise`, and `buildGameExport(track, options) → files[]`), unit-tested without a browser using the injectable
  `createContext` that `renderSong` already supports.
- `src/components/music/GameExportDialog.tsx`; the page only adds two menu items and the dialog.
- ZIPs with `fflate` (already a dependency; see `soundsToZip`).

## Help, docs, changelog

- Music help: canDo line becomes "Export the whole song, one section, game-ready OGG/WAV loops, stems or MIDI." (keep 5
  canDo items); a tip: "Export for game makes a file that loops cleanly; the dialog says which engine setting to use."
- CLAUDE.md "Next up": remove "MIDI"; Known gaps: drop nothing else.
- Changelog: a new entry `0.3.0-beta` with one music line, and bump `package.json` to match (CLAUDE.md versioning rule).

## Testing

- vitest: tail length, wrap (a tone ending past the loop end appears at the loop start), fade shape, normalise (one
  gain across stems), WAV `smpl` bytes, file lengths in samples for each mode, MIDI round-trip through the parser,
  dialog option persistence helper.
- OGG: a unit test that `encodeOgg` returns bytes starting with `OggS` (skip if WASM can't load in the test env, and
  cover it in Playwright instead).
- Playwright (desktop 1440×900, phone 390×844): open Overworld, Export for game with each mode and format; files
  download with the right names and non-trivial sizes; the explainer shows the loop start; no page errors; no phone
  overflow.
