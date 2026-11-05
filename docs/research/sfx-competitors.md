# SFX Generator vs other sound-effect makers

Research for the SFX Generator (`src/app/(app)/project/[projectId]/sfx/page.tsx`). The goal is that people can make a
game sound **and finish it** here, without the round trip "make it in sfxr, fix it in Audacity". Checked 2026-11-05.
Nothing here is implemented yet; the owner picks the scope.

Owner rules that shape the scope: everything free, no watermark, no sign-up; **never generate assets with AI**. Every
idea below is a plain tool (synth parameters, editing, mixing) that people drive themselves.

## 1. What our tool does today

Tried as a beginner on `next dev` (desktop 1440×900, new project with examples) and read in the code.

**Good already**

- Nine generators (Pickup, Laser, Explosion, Powerup, Hit, Jump, Blip, Select, Coin), Random and Mutate. Each
  generator click makes a fresh **draft**, so exploring never overwrites a kept sound.
- Live waveform of the current settings, Play, preview volume.
- Kept sounds autosave, have undo/redo (`useHistory`), duplicate, delete, links to other assets, pin, copy/paste.
- 8 hand-made examples (Jump, Coin pickup, Laser, Explosion, Hurt, Power-up, Menu select, Door open).
- Import: jsfxr/sfxr settings (with honest warnings for what's dropped) and our own Sound JSON.
- Export: WAV (16-bit mono 44.1 kHz) and Sound JSON.

**Weak spots found** (code: `src/lib/audio/sfx-synth.ts`)

1. **HP filter isn't a filter.** `sample -= sample * hpCutoff` only lowers the volume by up to 10%; it removes no
   low end.
2. **Noise isn't repeatable.** `synthesize()` uses `Math.random()`, so the waveform you see, the sound you hear and
   the WAV you export are three different explosions.
3. **Repeat Speed doesn't retrigger.** It resets the oscillator phase, which is nearly inaudible; in sfxr it restarts
   the pitch slide (the "power-up ladder" sound).
4. **Frequency slide is a straight line in Hz**, not a curve. Falling sounds stall at the bottom and rising ones
   race; the sfxr importer already has to approximate this.
5. **Missing sfxr basics:** sustain punch, delta slide, pitch jump (arpeggio), square duty + duty sweep, flanger,
   LP/HP filter sweeps. The importer warns these are "left out", so imported sfxr sounds change.
6. **Waveform view:** draws one sample per pixel, so square waves turn into a solid block; no time ruler, no length in
   ms, no playhead, no clipping warning.
7. **13 sliders in one flat list** with engineer names ("LP Filter Resonance", 0–1 values) and no hints.
8. **No finishing step at all:** no trim, fade, normalize, gain, pitch/speed, reverse, echo, reverb, EQ.
9. **One sound = one oscillator.** No layering (e.g. noise burst + low sine thump for a punchy explosion).
10. **Export is fixed:** one sound at a time, WAV 44.1 kHz 16-bit only. No 22 kHz/8-bit, no OGG, no "all sounds"
    zip, no variations.
11. **No keyboard play** (Space) and no locks on parameters, so Random/Mutate can't keep the part you like. Mutate
    only touches 6 of 13 parameters and never the wave type.
12. **WAV/MP3 can't be imported**, so a recording (a door slam you recorded on your phone) can't be cleaned up here.
13. The Music page has its own copy of the WAV writer (`music/page.tsx` ~line 537); SFX has another
    (`bufferToWav` in the SFX page).

## 2. Feature matrix

✔ = has it · ~ = partly · ✖ = no · ? = not confirmed

| Feature | **Ours** | sfxr | jsfxr (sfxr.me) | Bfxr2 | ChipTone | rFXGen | ZzFX |
|---|---|---|---|---|---|---|---|
| Waveforms | 5 (sq, saw, sine, tri, noise) | 4 | 4 | 12 (+pink/bit noise, voice, FM…) | several | 4 | 6 + noise amount |
| Envelope punch | ✖ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ (sustain vol) |
| Slide / delta slide | ~ linear / ✖ | ✔ / ✔ | ✔ / ✔ | ✔ / ✔ | ✔ (speed/accel/jerk) | ✔ / ✔ | ✔ / ✔ |
| Pitch jump (arpeggio) | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Square duty + sweep | ✖ | ✔ | ✔ | ✔ | ? | ✔ | ✔ (shape curve) |
| Retrigger / repeat | ~ broken | ✔ | ✔ | ✔ | ? | ✔ | ✔ |
| Flanger / phaser | ✖ | ✔ | ✔ | ✔ | ? | ✔ | ✖ |
| LP / HP filter with sweep | ~ LP only, no sweep | ✔ | ✔ | ✔ | ✔ (EQ) | ✔ | ~ (one filter) |
| Bitcrush / compression | ✖ | ✖ | ✖ | ✔ / ✔ | ~ / ✔ | ✖ | ✔ / ✖ |
| Echo / delay | ✖ | ✖ | ✖ | ✖ | ? | ✖ | ✔ |
| Effect chain on/off/reorder | ✖ | ✖ | ✖ | ✖ | ✔ (9 boxes) | ✖ | ✖ |
| Generators | 9 | 7 | 11 | 10 + 22 themed synths | 8, click again for variants | 7 | 8 |
| Randomize / Mutate | ✔ / ~ | ✔ / ✔ | ✔ / ✔ | ✔ / ✔ | ✔ / ✔ | ✔ / ✔ | ✔ / per-param |
| Lock parameters | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✔ |
| Undo / redo | ✔ | ✖ | ✖ | ? | ✔ | ✖ | ✖ |
| Sound list / slots | ✔ project list | ✖ | Pro only | ✔ collections | ✖ | 10 slots (keys 1–0) | ✔ (favourites, sort) |
| Layering / mixer | ✖ | ✖ | ✖ | 2-slot mixer + balance | ~ harmony/FM | ✖ | ✖ |
| Waveform view | ~ | ✖ | ✔ + clip warning | ✔ | ✔ | ✔ + ms | ✔ (click to play) |
| Trim / fade / normalize | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Space to play | ✖ | ✔ | ? | ✔ | ? | ✔ | ✔ |
| Play on change | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ (toggle) | ✖ |
| Export rate / depth choice | ✖ | ✔ | 8–44 kHz, 8/16-bit | ? | 2 × 2 | 22/44 kHz, 8/16/32-bit, stereo | ✖ |
| Other formats | JSON | params file | JSON, code | .bfxr, .bcol | setup file | QOA, RAW, C header | JS/Lua code |
| Export all as zip | ✖ | ✖ | Pro only | ✔ | ✖ | CLI batch | ✖ |
| Share link | ✖ (projects instead) | ✖ | ✔ | ✔ | ✖ | ✖ | ✔ |
| Import other tools' files | ✔ sfxr, own JSON | own | own | own | own | own | own + list |
| Import a recording to edit | ✖ | ✖ | ✖ | ✖ | ~ sampler | ✖ | ✖ |
| Price / licence | free, OSS | MIT | Unlicense (Pro paid) | MIT | name-your-price, CC0 output | free web, MIT-like | MIT |

Sources: drpetter.se/project_sfxr.html, github.com/grimfang4/sfxr, sfxr.me + github.com/chr15m/jsfxr, bfxr.net +
github.com/increpare/bfxr2, sfbgames.itch.io/chiptone, github.com/raysan5/rfxgen, github.com/KilledByAPixel/ZzFX.
Unconfirmed: ChipTone's effect names, Bfxr2's export options and undo.

**What each does well for beginners**

- **sfxr / rFXGen:** one click gives a usable sound; Space plays. rFXGen's numbered slots make A/B comparing easy.
- **jsfxr:** nothing to install, waveform with a "clipped" warning, a link that reopens the sound.
- **Bfxr2:** locks + mutate let you "breed" a sound; themed synths (footsteps, birds, whooshes) go past blips; the
  2-slot mixer; Export All as a zip.
- **ChipTone:** big knobs, playful look, **undo**, an effect chain you switch on box by box; most loved by users
  (4.9/5 on itch.io).
- **ZzFX:** lock and mutate **per parameter**, auto-saved list with favourites, Loop toggle, sound as one line of
  code.

## 3. What people do in Audacity after generating

From itch.io threads and Audacity guides (gamineai.com/guides/audacity, engineered.at, Envato Tuts+ Bfxr tip,
manual.audacityteam.org/man/macros.html):

| Step | Why | Frequency |
|---|---|---|
| Trim silence at start/end | Sound must fire on the frame it's triggered | Almost always |
| Normalize / gain | Every SFX at a consistent loudness; avoid clipping | Almost always |
| Fade in / fade out | Remove clicks at the cut points | Very often |
| Export mono WAV 44.1/48 kHz 16-bit, or OGG | Engine import, smaller builds | Always |
| Change pitch / speed | Make variants, fit a sound to an action | Often |
| Layer / mix sounds | Punchier hits and explosions (noise + saw + thump) | Often, because only Bfxr mixes and only 2 slots |
| Echo / reverb | Room or cave feel, "bigger" sounds | Sometimes (high-pass first) |
| EQ / low cut | Remove rumble and mud | Sometimes |
| Reverse | Rewind / suck-in / charge-up sounds | Sometimes |
| Loop | Engines, lasers held down, ambience | Sometimes |
| Batch (macros) | Same normalize/export over many files | Larger projects |

None of the generators trims, fades or normalizes. **That gap is why people leave for Audacity, and closing it is our
biggest chance to stand out.**

## 4. Gaps ranked (value for beginners vs effort)

Effort: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks. Value is for a beginner making a small game.

| # | Gap | Value | Effort | Notes |
|---|---|---|---|---|
| 1 | **Finish panel**: trim, fade in/out, normalize, gain, reverse | Very high | M | Kills the most common Audacity steps. Pure functions on `Float32Array`. |
| 2 | **Fix the synth**: real HP filter, curved slide, real retrigger, seeded noise | High | S–M | Bugs; seeded noise makes preview = export. Existing sounds change slightly: keep old behaviour behind a `version` field. |
| 3 | **Waveform upgrade**: peak drawing, ms ruler, playhead, drag trim handles, clip warning | High | S–M | The trim handles are the UI for #1. |
| 4 | **Export options**: 22.05/44.1/48 kHz, 8/16-bit, **variations** (N mutated copies), **all sounds as zip** | High | M | Needs a tiny store-only zip writer like `src/lib/gif.ts`. |
| 5 | **Explore better**: parameter locks, Mutate that respects locks and covers all params, recent-variants strip (last ~10 drafts, click to A/B), Space to play, play-on-change | High | S–M | Mostly UI. |
| 6 | **Pitch / speed + echo + low/high cut (EQ)** in the finish panel | Medium-high | M | Echo is a feedback delay; EQ is two biquads. |
| 7 | **sfxr parity params**: punch, delta slide, pitch jump, duty + sweep, flanger, filter sweeps | Medium-high | M | Makes sfxr import lossless; more sound variety. |
| 8 | **Layers**: up to 4 layers per sound (synth layers or another kept sound), with start offset, gain and per-layer finish | High | L | Biggest data-model change. |
| 9 | **Friendlier controls**: group sliders (Pitch, Shape, Envelope, Filter, Effects), plain labels + one-line hints, Basic / Advanced | Medium | S | Copy goes in `COPY.help` / `src/copy/` only if it differs per app (it doesn't, SFX is GameDev-only). |
| 10 | **Import WAV/MP3 to edit** (as a sample layer) | High for "do it all here", medium for beginners | L | Needs a storage decision: audio bytes in the asset JSON (cap ~5 s mono 22 kHz ≈ 220 KB base64) vs Supabase Storage. Owner call. |
| 11 | Reverb, bitcrush, compression | Medium | M | Reverb via a short generated impulse (not AI, just decaying noise) convolved offline. |
| 12 | Loop mode (preview loops; export one seamless cycle) | Medium | S–M | |
| 13 | More generators (Footstep, Whoosh, UI click, Engine loop, Bird) | Medium | S each | Hand-tuned parameter ranges, like today's presets. |
| 14 | OGG / MP3 export | Low-medium | M | Browsers can't encode OGG/MP3 offline without a library (e.g. lamejs) or `MediaRecorder` (webm/opus, real-time). Engines all take WAV. Later. |

## 5. Recommended v1 scope

**Goal:** "Make it, finish it, export it" without leaving the page. Items 1–5 and 9 above, plus pitch/speed from 6.
Layers (8) and WAV import (10) are v2 because they change the data model and storage.

### UI sketch (desktop; phone stacks the same panels)

```
[↶ ↷]  SFX Generator                     Saved ·  ?  Import ▾  Export ▾
┌─────────────────────────────────────────────────────────────────────┐
│ ▕▔▔▔ waveform (peaks) ▔▔▔▏  0ms ─── 120 ─── 240 ── 360ms            │
│ [⟦ trim handle]                         [trim handle ⟧]  ▲ clipped! │
│ [▶ Play (Space)] [Loop] [Random R] [Mutate M]  ☐ Play on change  🔊 │
│ Recent: ● ● ● ● ●  (last 10 drafts, click to hear/restore, A/B)     │
└─────────────────────────────────────────────────────────────────────┘
GENERATE  Pickup Laser Explosion Powerup Hit Jump Blip Select Coin
┌ SOUND ──────────────────────────┐ ┌ FINISH ───────────────────────────┐
│ Pitch    ▸ start, slide, curve 🔒│ │ Trim   start ◂▸ end  [Auto-trim]  │
│ Shape    ▸ wave, duty         🔒│ │ Fade   in ◂▸  out ◂▸             │
│ Envelope ▸ attack, hold, punch, │ │ Volume [Normalize to -1 dB] gain │
│            fade                 🔒│ │ Pitch/speed ◂▸   [Reverse]        │
│ Filter   ▸ low cut, high cut  🔒│ │ (v1.1: Echo, EQ, Reverb…)         │
│ Effects  ▸ vibrato, repeat    🔒│ │ Each row has an on/off switch     │
│ [Basic | Advanced]              │ └───────────────────────────────────┘
└─────────────────────────────────┘   Right column unchanged: this sound,
                                       links, your sounds, examples
```

- Each group has a lock (Random/Mutate leave locked groups alone). Lock per group, not per slider, keeps it simple.
- Finish settings are **non-destructive**: stored next to the synth params and applied on every render, so you can
  still change the synth after trimming.
- Export ▾: WAV (with a small rate/bit-depth choice), **Variations (zip of 5 mutated WAVs)**, **All sounds (zip)**,
  Sound JSON. Keep the "free, no watermark" footer.

### Data model

```ts
interface SfxParams { ...existing; version?: 2; dutyCycle?; punch?; deltaSlide?; pitchJump?; pitchJumpAt?; seed? }
interface SfxFinish { trimStart; trimEnd; fadeIn; fadeOut; normalize: boolean; gainDb; pitch; reverse }
interface SoundEffect { ...existing; finish?: SfxFinish }
```

Optional fields so old sounds, examples, the Supabase rows and the MCP's read-only view keep working. `merge.ts`
merges `finish` per field like other bodies. No migration needed (sounds are JSON bodies in `assets`).

### Code pieces to add or reuse

| Piece | Where |
|---|---|
| Shared WAV writer (rate, bit depth), used by SFX and Music | new `src/lib/audio/wav.ts`, replaces both copies |
| Store-only zip writer | new `src/lib/zip.ts`, same style as `src/lib/gif.ts` (pure, tested) |
| Finish chain: `trim`, `fade`, `normalize`, `gain`, `resample` (pitch/speed), `reverse` | new `src/lib/audio/sfx-finish.ts`, pure, vitest |
| Seeded RNG for noise and variations | inside `sfx-synth.ts` (small mulberry32) |
| Peak waveform + trim handles | new component in the SFX folder; reuse pointer helpers if one fits |
| Undo/redo | `useHistory` over `{ params, finish }` instead of `params` |
| Export / import UI | `ExportMenu`, `ImportMenu`, `useImport`, `downloadBlob` |
| Help text | `src/lib/help-content.ts` `sfx` entry (new steps: Finish, Space, locks) |
| Examples | update 1–2 examples to use the finish panel (e.g. Explosion fades out); hand-made, no AI |
| Preview player | `src/lib/audio/preview.ts` must apply `finish` too so the asset list plays the finished sound |

### Testing

- vitest: finish functions (trim keeps length right, normalize peaks at target, fades start/end at 0), seeded synth
  gives identical buffers, WAV header for each rate/depth, zip opens (check central directory), sfxr import still
  passes.
- Playwright desktop + phone per `CLAUDE.md`: generate, trim by dragging, normalize, export WAV and zip, undo.

## 6. Overlap with the Music backlog

`CLAUDE.md` "Next up" lists multi-pattern songs, envelopes and MIDI for the **Music** tool. Shared ground:

- `src/lib/audio/wav.ts` (one WAV writer for both) and the zip writer (export all tracks too).
- The finish chain (normalize, fade, echo) works on any rendered buffer, so Music export can reuse it.
- An ADSR envelope type could be shared if Music gets per-instrument envelopes.
- Later idea: use a kept sound as a drum/instrument in Music. Not part of this scope.

## 7. Not doing

- AI-generated sounds or "describe a sound" prompts (owner rule).
- A full multitrack editor; layers stay small (≤ 4) and live inside one sound.
- Share links: projects already cover this; read-only share links are on the general backlog.
