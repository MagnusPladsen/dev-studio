# Changelog

All notable changes to GameDev Studio. Versions follow [semantic versioning](https://semver.org);
while in beta (0.x), minor versions may change how projects are stored. Export your projects before upgrading
a self-hosted copy.

## [Unreleased]

### Tools
- **Pixel Art:** scale sprites up ×2/×3/×4 (sharp or smooth, in place or as a copy); Sprite Sheets export at
  1×–4×
- **3D Pixel Art** (voxel art, first called Voxels): 3D model editor with add, erase, paint, eyedropper, fill and box tools, X/Y/Z mirror, grid sizes
  8 to 64, undo/redo and autosave
- Sprite to 3D from Pixel Art: pick a frame, 1–8 cubes deep, flat or puffy, optional darker back; big sprites
  shrink to fit
- Slice view: draw one flat layer at a time with Pixel Art-style tools next to a live 3D preview
- Select, move, copy, cut, paste, duplicate, rotate and flip cubes
- Render for 2D: 1/4/8 directions from side, isometric or top-down as a linked sprite, a sprite sheet PNG or a
  turntable GIF
- Exports: .glb, .obj + .mtl, MagicaVoxel .vox and .png, at 1 voxel = 0.1 m, Y-up; free, no watermark
- Pip's Quest example voxel models
- **Diagrams:** now a Milanote-style board for moodboards, story flow, level planning and reference collections.
  New cards: notes that wrap and grow, to-do lists, images (upload, paste or drop), links with previews
  (YouTube, Spotify, Vimeo and SoundCloud play on the board), studio asset cards and groups with "Stack as
  column". Any card takes a colour; drag the dot on a card to connect it. Old diagrams open unchanged
- New example boards: "Pip's Quest Moodboard" and "Mossbrook Meadow Level Plan"
- **Help:** a `?` button on every tool page explains what it does, with quick-start steps and tips

### Database
- New Supabase migration `supabase/migrations/20261031090000_add_models_collection.sql` adds the `models`
  collection; run it before using 3D Pixel Art while signed in

## [0.1.0-beta] - 2026-10-30

First public beta.

### Tools
- **Pixel Art:** layers, animation frames, onion skinning, undo/redo, PNG and sprite sheet export
- **Music:** piano roll with melody, harmony, bass and drum channels; WAV export
- **SFX:** retro sound effect generator with presets, sliders, randomize/mutate; WAV export
- **Tilemap:** paint levels with your own sprites on multiple layers; fill tool; PNG export
- **Diagrams:** flow charts and state machines; nodes can point at any asset
- **Story:** wiki-style `[[links]]` with hover summaries, autocomplete, backlinks, graph view, templates
- **Dialogue:** branching conversations with choices, conditions and a play-through preview; JSON export
- **Palettes:** shared palettes with PICO-8, Game Boy, NES, Endesga 16 and Sweetie 16 presets
- **Sprite sheets:** pack sprites and frames into a PNG plus a JSON atlas
- **Notebook:** ideas, to-dos, design docs and bug lists with clickable checklists, folders and pins
- **Task Board:** Jira-style sprints and backlog with editable columns; finished issues are archived off the board
  but stay searchable; issue notes live in the Notebook
- **Animated GIF export** from Pixel Art

### Everything else
- Projects keep each game's assets separate; export/import a whole project as one JSON file
- Any asset can link to any other, and the project page lists everything with its links
- Saves in the browser by default; optional sign-in (GitHub or email link) syncs to the cloud and moves
  browser projects into the account
- Optional saving to a folder on your computer (Chrome/Edge) for self-hosting
- Hand-made example assets in every tool to start from
- Undo/redo in every tool (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y) with toolbar buttons
- Listening volume for Music and SFX (exports are unaffected); zoom in the music piano roll
- Autosave in every tool; "Pip's Quest" example assets that can be added or removed per tool
- Each tool has its own colour; phone layouts for every tool

[0.1.0-beta]: https://github.com/MagnusPladsen/dev-studio/releases/tag/v0.1.0-beta
