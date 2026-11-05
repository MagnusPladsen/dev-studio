# Music tool: competitors and what we need to finish songs here

Research, 5 Nov 2026. Goal: someone can make **and finish** game music in our Music tool, without sketching it
here and then fixing it in Audacity, a DAW or BeepBox. Companion to the SFX study (`sfx-competitors.md`, parallel
session); shared audio pieces are called out in [Shared with SFX](#shared-with-sfx).

Owner rule kept throughout: no AI generation. Every recommendation below is a tool the user drives (scale lock,
chord stamps, presets made by hand), never "make me a song".

## Where we are today

Read from `src/app/(app)/project/[projectId]/music/page.tsx`, `src/lib/audio/music-*.ts`, `src/lib/music-draw.ts`,
`src/lib/import/music/`, `src/lib/examples/audio.ts`, `src/lib/help-content.ts`.

What works:

- Piano roll, 4 fixed channels (Melody, Harmony, Bass, Drums), each one waveform: square, sawtooth, sine,
  triangle, noise (noise is band-passed at the note's pitch, so it doubles as a drum kit).
- Click or drag paints notes at a chosen length (¼–4 beats); a stroke that starts on a note erases. One undo step
  per stroke (`useHistory`), autosave, `SaveIndicator`, zoom (Ctrl/⌘ + wheel), phone drawer.
- Live playback with a look-ahead scheduler (`music-scheduler.ts`): edits are heard on the next pass. Loop on/off,
  BPM 60–200, per-channel volume, mute, solo, master `VolumeControl`.
- Other channels show as faint ghost notes behind the active one.
- Import: MIDI (format 0/1, folded into C3–C6, 32 beats, GM drums mapped to noise pitches) and Song JSON.
- Export: WAV of the current loop, Song JSON. Four hand-made examples (Overworld, Chill Loop, Title Theme, Boss Battle).

What a beginner hits within five minutes (walked through the code paths as a first-time user would):

1. **The WAV doesn't sound like the preview.** `exportWav` re-implements the synth: linear fade instead of the
   exponential decay used by `scheduleNote`, raw white noise instead of the band-passed noise, so drums turn into
   hiss. This is a bug, not a gap, and it is the first thing that sends people to Audacity.
2. **Silence when placing a note.** Painting is mute; you only hear notes by pressing Play.
3. **A song is at most 32 beats (8 bars)** and only `patterns[0]` is used, though the data model already has a
   `patterns` array. No intro, verse, chorus or ending.
4. **Every note has a hard click or a long smear.** No attack/release, no vibrato, no volume per note (velocity
   exists in the data but cannot be edited).
5. **Notes can't be selected, moved, copied, transposed or resized.** Fixing a wrong note means erase and redraw.
6. **Any note is allowed**, so beginners land on sour notes. No key or scale guide.
7. **No reverb, delay, panning or EQ.** The mix sounds dry and centred, which is the main reason people "finish it
   in a DAW".
8. **Export stops dead at the loop end.** No reverb/release tail, no fade-out, no loop-count option, no OGG/MP3, no
   MIDI out, no stems.
9. Fixed 4 channels, C3–C6 range, mute/solo are not saved (but they silently change the WAV export).

## Competitors at a glance

✓ = has it, ~ = partly, – = no. "Beginner value" is what each does best for someone who can't read music.

| | **Ours** | BeepBox | JummBox / UltraBox | Bosca Ceoil (Blue) | FamiStudio | 1BitDragon | Song Maker (Chrome Music Lab) | Online Sequencer | PICO-8 / TIC-80 | LMMS | BandLab |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Price / platform | Free, browser | Free, browser | Free, browser | Free, desktop + browser (3.1) | Free, desktop + mobile | Paid, desktop | Free, browser | Free, browser | Paid fantasy consoles | Free, desktop | Free, browser + app |
| Editing model | Piano roll | Pattern grid per channel + song sequence | Same as BeepBox | Pattern piano roll + arrangement | Piano roll + pattern sequence | Doodle grid, scale-locked | Grid | Piano roll | Tracker (notes + effect column) | DAW piano roll | DAW |
| Song arrangement from patterns | – (one 32-beat loop) | ✓ | ✓ + loop bar | ✓ | ✓ | ✓ blocks | – (one grid) | ~ (long roll) | ✓ (SFX → patterns) | ✓ | ✓ |
| Key / scale lock | – | ✓ (scale + key) | ✓ | ✓ (scale, key) | – | ✓ (24 scales, per-column chord) | ✓ | – | – | ~ (scale highlight) | ~ |
| Chord helper | – | – | ~ (chord modes) | – | ~ (arp chords) | ✓ accompaniment library | – | – | ~ (arp effect) | ✓ chord stamp | ✓ |
| Drum grid / kit | ~ (noise only) | ✓ drum channel | ✓ | ✓ drumkits | ✓ DPCM / noise | ✓ | ✓ two-row drums | ✓ kits | ~ | ✓ | ✓ |
| Instrument presets | 5 waves | ✓ big preset list | ✓ larger | ✓ ~100 (SiON) | ✓ editable | ✓ | ~ 5 | ✓ many sampled | ~ 8 waves | ✓ | ✓ |
| Envelopes (ADSR) | – | ✓ | ✓ + more | ✓ | ✓ volume/pitch/duty/arp | ~ | – | – | ✓ per-note fx | ✓ | ✓ |
| Vibrato / slide / arp | – | ✓ | ✓ | ~ | ✓ | ~ | – | – | ✓ effect column | ✓ | ✓ |
| Per-note volume | data only | ✓ | ✓ | – | ✓ | – | – | ✓ | ✓ | ✓ | ✓ |
| Reverb / echo | – | ✓ reverb, echo | ✓ more FX | ✓ global FX | – (hardware-faithful) | ✓ | – | ~ | – | ✓ plugins | ✓ |
| Panning | – | ✓ | ✓ | – | ✓ (stereo) | – | – | – | – | ✓ | ✓ |
| EQ / filter | – | ✓ filter | ✓ | ✓ | – | – | – | ~ | ~ (PICO-8 only) | ✓ | ✓ |
| Hear note while placing | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Select / move / copy notes | – | ✓ | ✓ | ✓ | ✓ | ~ | – | ✓ | ✓ | ✓ | ✓ |
| Keyboard playing (QWERTY) | – | ✓ | ✓ | – | ✓ | – | – | ~ | ✓ | ✓ | ✓ |
| Undo / redo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Loop point / intro | – | ✓ loop range | ✓ loop bar | – | ✓ loop point | ~ | – | – | ✓ pattern loop flags | ✓ | ✓ |
| WAV | ✓ (buggy) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| OGG / MP3 | – | MP3 | MP3, OGG (UltraBox) | – | MP3, OGG | ✓ | – | MP3 | – | ✓ | ✓ |
| Loop count / fade on export | – | ✓ | ✓ | – | ✓ | – | – | – | – | ✓ | – |
| Stems (one file per channel) | – | – | ~ | – | ✓ (separate channels) | – | – | – | – | ✓ | ✓ |
| MIDI import | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | – | ✓ | ✓ |
| MIDI export | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| Share link | – (asset links in project) | ✓ whole song in URL | ✓ | – | – | – | ✓ | ✓ | ✓ carts | – | ✓ |
| Beginner value (best thing) | Easy start, examples | Instant presets + scale lock + URL share | Same, more power | Simple screen, good presets | NES-accurate, great docs | "Can't sound bad" (scale/chord lock) | Zero learning curve | Large community library | Tiny, fun, one screen | Everything, steep | Loops library, mastering |

Notes on individual tools:

- **BeepBox** is the closest model for us: browser, free, channels of patterns, a song row to arrange them, scale
  and key lock, rhythm (snap) setting, preset instruments, reverb/echo/chorus, panning, WAV/MP3/MIDI export with loop
  count, and the song stored in the URL. JummBox and UltraBox add more channels, effects and an editable loop bar.
- **1BitDragon** proves the "can't sound bad" idea sells: scale lock plus per-column chords mean every note fits.
- **Song Maker** proves the minimum: one grid, a scale and a range, two drum rows, Save as WAV/MIDI, share link.
- **FamiStudio / PICO-8 / TIC-80** show how far envelopes, arpeggios, slides and vibrato go for chiptune — that is
  where chip music gets its character, and our waveforms already are chip voices.
- **LMMS / BandLab** are the "finish it elsewhere" destination: effects chain, automation, mastering, stems.

## What people do in other programs after composing

From the BeepBox / Bosca / PICO-8 communities and game-audio guides, in rough order of how often it comes up:

1. **Make it loop cleanly in the engine.** Trim to the exact loop, keep an intro before the loop start, and set the
   loop point. Godot 4: WAV takes loop begin/end in samples; OGG only takes a loop offset (start), so the file has to
   end exactly at the loop end ([Godot issue #87427](https://github.com/godotengine/godot/issues/87427) also notes the
   import dialog rounds the offset). Unity and Phaser loop whole clips, so "intro file + loop file" is the common
   trick. RPG Maker reads `LOOPSTART`/`LOOPLENGTH` OGG tags.
2. **Convert to OGG (or MP3) to shrink it.** WAV is ~10 MB a minute; OGG is the engine default in Godot.
3. **Add reverb/echo** so the mix doesn't sound dry, and a release tail so notes don't cut off at the loop end
   (with the tail wrapped onto the start for a seamless loop).
4. **Balance levels and normalise.** Fix clipping, bring it to a sane loudness (game music commonly sits around
   −16 LUFS, peaks under −1 dBTP; the [ITU-R BS.2434 report](https://www.itu.int/dms_pub/itu-r/opb/rep/R-REP-BS.2434-2018-PDF-E.pdf)
   measures −24 for consoles, −18 for handhelds).
5. **Pan instruments** left/right for width.
6. **Fade out** for a non-looping version (credits, trailer).
7. **Export stems** for adaptive music (drums drop out when calm) or to remix in a DAW.
8. **Export MIDI** to carry on in a DAW with better instruments.
9. **Tempo / key changes** between sections (rarer; boss phase speed-up).

Items 1–6 are exactly what a beginner should never have to leave our app for.

## Gaps ranked

Value is for beginners making game music; effort is focused developer-days including undo, autosave, examples,
phone layout and tests per house rules. Rank = value ÷ effort, with "blocks finishing" weighted up.

| # | Gap | Value | Effort | Why |
|---|---|---|---|---|
| 1 | **One render path: offline render through the same synth** (fixes WAV ≠ preview) | Very high | 1–2 d | `OfflineAudioContext` + `scheduleNote`; every export below builds on it. Bug fix. |
| 2 | **Hear the note when you place it** + QWERTY keys to audition | High | 0.5–1 d | Every competitor does it; the cheapest "feels right" win. |
| 3 | **Key/scale lock** (highlight + snap rows to scale, key picker) | Very high | 1–2 d | 1BitDragon/BeepBox/Song Maker's main beginner trick. Pure tool, no generation. |
| 4 | **Instrument presets with envelope** (attack/decay/sustain/release, vibrato, per-channel) | Very high | 3–4 d | Removes clicks and smears; gives chip character. Hand-made presets ("Lead", "Pluck", "Pad", "Bass", "Kick", "Snare", "Hat"). `CLAUDE.md` "envelopes". |
| 5 | **Song arrangement: patterns + song row** (patterns per channel, sequence of bars, loop start/end markers) | Very high | 5–7 d | Turns loops into songs with intro + loop. Model already has `patterns[]`. `CLAUDE.md` "multi-pattern songs". Needs migration of `patterns[0]` songs and scheduler change. |
| 6 | **Loop-ready export** (OGG + WAV, intro + loop or loop only, N loops + fade-out, tail wrapped to start, peak normalise) | Very high | 2–3 d after #1 | The single biggest reason to open Audacity. OGG needs an encoder (see Shared). |
| 7 | **Mix: pan + reverb + echo per channel** (send to one shared reverb/delay) | High | 2–3 d | Web Audio `ConvolverNode`/`DelayNode` with a generated impulse; same graph offline. |
| 8 | **Select, move, copy/paste, transpose, resize notes** | High | 3–4 d | Editing without redrawing; Shift+drag box select, arrow keys, Ctrl+C/V, drag note end. |
| 9 | **Drum lane / kit** (noise channel shows named rows: Kick, Snare, Hat, Crash…) | High | 1–2 d | Drums are today "noise at a pitch", which beginners can't read. |
| 10 | **MIDI export** | Medium | 1 d | Reuses `midi-file.ts` knowledge; a way out to a DAW, and owner rule "keep saying it's free". `CLAUDE.md` "MIDI". |
| 11 | **Stems export** (zip of one OGG/WAV per channel) | Medium | 0.5 d after #1, #6 | Adaptive music; uses fflate already in the repo. |
| 12 | **Per-note volume** (velocity lane) | Medium | 1–2 d | Accents and dynamics; data already there. |
| 13 | Chord stamp (place a triad of the chosen scale in one click) | Medium | 1 d after #3 | A tool, not generation. |
| 14 | Add/remove channels (beyond 4), wider range (C2–C7) | Medium | 1–2 d | Bass below C3 is common; more voices for harmony. |
| 15 | Slide / arpeggio note effects (chip style) | Medium | 2–3 d | PICO-8/FamiStudio character; after #4. |
| 16 | Save mute/solo with the track, or ignore them on export | Low | 0.5 d | Today they silently change the WAV. Quick fix alongside #1. |
| 17 | Share link (read-only play) | Low-med | — | Already in `CLAUDE.md` "Next up" for all tools; do it there, not here. |
| 18 | Tempo/key change per section, swing | Low | 2 d | Rare for beginners. |
| 19 | Sampled instruments / user samples | Low-med | 4–6 d | Big scope (storage, licensing); our identity is chiptune. Later. |

Where the `CLAUDE.md` "Next up" items rank: **envelopes #4, multi-pattern songs #5, MIDI #10**. Envelopes beat
multi-pattern because they fix how *every* note sounds and are cheaper; MIDI export is a way out, which matters less
than making the way out unnecessary.

## Recommended v1 scope

Ship in three PRs, each useful on its own:

**PR 1 — "Sounds right" (≈4–5 days):** #1 offline render, #2 hear notes + QWERTY, #3 scale lock, #16 mute/solo fix,
#9 drum lane names.

**PR 2 — "Sounds good" (≈5–7 days):** #4 instrument presets + envelope editor, #7 pan/reverb/echo, #12 velocity lane.

**PR 3 — "Finished song" (≈8–11 days):** #5 arrangement, #6 loop-ready OGG/WAV export, #10 MIDI export, #11 stems.

Then #8 note selection/editing (3–4 d) as its own PR; it touches the drawing code that PR 1–3 leave alone.

Total v1 ≈ 20–27 developer-days.

### UI sketch (in words)

Top bar unchanged: Undo/Redo, name, `SaveIndicator`, `HelpButton`, `ImportMenu`, `ExportMenu`.

Controls bar: Play/Stop (Space), Loop, `VolumeControl`, zoom, BPM, **Key** (C, C#, … B) + **Scale** (Major, Minor,
Pentatonic, Blues, Chromatic = off). Rows outside the scale are dimmed and can't be painted; Chromatic restores today.

Channel strip: each channel chip opens a small popover instead of the bare select: **Preset** list (hand-made),
then Wave, Attack, Decay, Sustain, Release, Vibrato, Pan, Reverb, Echo, Volume. Mute/Solo stay on the chip. A "+"
adds a channel (up to 8). A Drums channel shows kit names on the piano keys instead of note names.

Song row (new, above the piano roll, collapsible): one lane per channel, one cell per bar showing a pattern number
(1, 2, 3…, empty = silence), like BeepBox. Click a cell to edit that pattern in the roll below; type a number or pick
from a menu to reuse a pattern. Two draggable flags on the bar ruler: **Loop start** and **Song end**. Bars before
Loop start are the intro. Phone: the row scrolls horizontally; cells are 44 px tap targets.

Piano roll: clicking or painting plays the note. Velocity lane under the roll (bar height per note), hidden by default.

Export menu:

- **Game loop (OGG)** — intro + loop, tail wrapped, normalised; description says which engine setting to use.
- **Game loop (WAV)** — same, with `smpl` loop points for Godot/Unity.
- **Loop only (OGG/WAV)** — for engines that loop whole clips.
- **Full song with fade-out (OGG/WAV)** — N loops (1–4) then a fade.
- **Stems (ZIP)** — one file per channel, same length, so they stay in sync.
- **MIDI**, **Song JSON**.
- Footer: "Free, no watermark, no sign-up" (house rule).

### Shared pieces to reuse

- `useHistory` + `UndoRedoButtons`: all new edits (presets, effects, song row) go through the same track state, so
  they undo for free; checkpoint on popover open like note strokes.
- `useAutosave` + `SaveIndicator`, `useRemoteChanges` / `<LiveRefresh>` as today.
- `ExportMenu` (items above), `ImportMenu` + `MUSIC_IMPORTERS` (MIDI importer must map to multiple patterns once #5
  lands, and lift its 32-beat cap), `ImportDropZone`, `ExamplesBar` (update the 4 examples to use presets, a song
  row and loop start; hand-made).
- `VolumeControl` / `usePreviewVolume` for the master; `getAudioContext()` for playback; `downloadBlob`.
- `fflate` (already used by engine exports) for the stems ZIP; `src/lib/engine-export/` could later bundle music
  with a Godot `.import` loop offset.
- `src/lib/import/music/midi-file.ts` — add a writer next to the parser.
- `ContextMenu` for right-click on song-row cells and notes.

## Shared with SFX

Pieces both tools need; build once in `src/lib/audio/`:

- **Offline render helper**: `renderOffline(durationSeconds, build: (ctx, destination) => void): AudioBuffer`, used by
  Music export, SFX export and the asset preview (`preview.ts`).
- **Encoders**: `encodeWav(buffer, { loop?: {start, end} })` (move the code out of `music/page.tsx`; add the `smpl`
  chunk) and `encodeOgg` / `encodeMp3`. Browsers can't encode OGG Vorbis natively (`MediaRecorder` gives Opus in
  WebM/Ogg on some browsers, not Vorbis, and isn't offline). Options: a small WASM Vorbis encoder loaded only on
  export (like the 3D route's lazy bundle), or `lamejs` for MP3. Pick one library for both tools; check licence
  (must be OSI) and size.
- **Effects graph**: one `createEffects(ctx, settings)` returning reverb (generated impulse, no sample files),
  echo, pan, low/high-pass, used live and offline. SFX can reuse it for its own reverb/echo.
- **Normalise / fade / trim** helpers on `Float32Array` (peak normalise to −1 dBFS, linear/exp fade, trim silence).
- **Envelope shape** (ADSR) type and apply function; SFX's synth has its own attack/sustain/decay already —
  align names so presets read the same in both tools.
- **Waveform view** component if SFX builds one (Music could show the rendered song on export).

## Not recommended

- AI "generate melody/accompaniment" — against the owner rule. Scale lock, chord stamps and presets cover the
  "I can't write music" fear with tools.
- A full DAW (automation lanes, plugin hosting, audio recording, mastering chain). LMMS and BandLab are free; add a
  help line "Want more? Export MIDI or stems and open them in LMMS (free)" like the Voxels "use Blender" card.
- Tracker view as a second editor. The piano roll is easier for beginners; PICO-8 users will still find effects in
  the instrument popover.

## Sources

- [UltraBox features](https://ultrabox-blog.pages.dev/features) (third-party, unverified), [JummBox docs](https://jummb.us/1_2/),
  [BeepBox releases](https://github.com/johnnesky/beepbox/releases/), [BeepBox on Newgrounds wiki](https://newgrounds.wiki.gg/wiki/BeepBox)
- [Bosca Ceoil Blue 3.1 devlog](https://yurisizov.itch.io/boscaceoil-blue/devlog/871748/a-box-full-of-improvements-bosca-ceoil-blue-31)
- [FamiStudio releases](https://github.com/BleuBleu/FamiStudio/releases), [nesdev audio drivers](https://nesdev.org/wiki/Audio_drivers)
- [1BitDragon 5.0](https://rekkerd.org/1bitdragon-5-0-brings-new-creative-tools-workflow-improvements-and-expanded-composition-features/),
  [1BitDragon overview](https://gamefromscratch.com/1bitdragon-idiot-proof-music-creation-software/)
- [Godot OGG loop offset precision, #87427](https://github.com/godotengine/godot/issues/87427),
  [OGG vs WAV loop points in Godot](https://yukievt.itch.io/chill-vibes-2022-music)
- [ITU-R BS.2434 game loudness](https://www.itu.int/dms_pub/itu-r/opb/rep/R-REP-BS.2434-2018-PDF-E.pdf)
- Song Maker, Online Sequencer, PICO-8, TIC-80, LMMS, BandLab: from their public editors and manuals; feature
  marks are as of late 2026 and worth a spot check before quoting externally.
