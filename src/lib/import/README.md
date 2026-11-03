# Import

Every tool reads files through the same pieces: an `Importer` per file format, one array of importers per tool,
`useImport` to run them, and `<ImportMenu>` + `<ImportDropZone>` for the UI.

## The contract (`types.ts`)

```ts
interface Importer<T> {
  id: string;                                   // "canvas-json"
  label: string;                                // menu label: "Canvas JSON (.json)"
  description?: string;                         // second line in the menu
  accept: string[];                             // [".json", "application/json"]: picker filter + drop matching
  detect?(file: File, text: string): boolean;   // only for drops, when several importers share an extension
  parse(file: File): Promise<ImportResult<T>>;  // throw new ImportError("Plain words for the user")
  pick?: "one" | "many" | "folder";             // picker: one file (default), a multi-select, or a whole folder
  parseFiles?(files: File[]): Promise<ImportResult<T>>; // several files as one import, when they refer to each other
}
interface ImportResult<T> { items: T[]; warnings: string[] }
```

- `items` are the tool's own type (`Diagram`, `Issue`, `Sprite`…) with **fresh ids**. Use `reidentify(items)` when
  copying data that already has ids.
- `warnings` are short sentences about what was skipped or changed. They are listed in the toast.
- Cap the file size first with `assertFileSize(file, maxBytes)` (`file-size.ts`), so a huge file is refused with a
  clear message before it is read.
- Throw `ImportError` for files you understand but can't use. Any other error (a `SyntaxError` from `JSON.parse`, a
  bug) becomes a generic "Couldn't read …" message, so never put raw error text in front of the user.
- `pick: "many"` / `"folder"` imports every chosen (or dropped) file as one import: one toast, one undo step.
  `runImporterOnFiles` skips files the importer doesn't accept (with a warning) and hidden folders like
  `.obsidian/` (quietly). Without `parseFiles` each file is parsed on its own; a file that fails becomes a warning.
- An importer is pure: it reads the file and returns items. It never touches `storage` or React state.

## Adding an importer to a tool

1. Write `src/lib/import/<tool>/<format>.ts` exporting the importer, plus `<format>.test.ts` (use `textFile()` from
   `test-helpers.ts`; for binary formats build a `File` from bytes).
2. Add it to the tool's array in `src/lib/import/<tool>/index.ts` (e.g. `CANVAS_IMPORTERS`). Menu order = array order.

That's all when the tool is already wired. The first importer for a tool also needs the wiring below.

## Formats that refer to other files

Some files point at others: a Tiled map at its tilesets, a tileset at its image. Give such an importer `pick: "many"`
and a `parseFiles`, and list the extensions of the files it refers to in `companions`. Companions are offered in the
picker and passed along with a drop, but never imported on their own. Inside `parseFiles`, find one with
`findCompanion(files, pathInsideTheFile)` (matched by file name, since a browser never knows folders).

When a referenced file isn't there, throw `new MissingFilesError(["tiles.tsx", "tiles.png"])`. `ImportMenu` then asks
the person to add the files or their folder (and runs `parseFiles` again with them), or to import without them, in
which case `parseFiles(files, { skipMissing: true })` runs: leave those parts out and say so in `warnings`.

## Wiring a tool (once per tool)

```tsx
const rootRef = useRef<HTMLDivElement>(null);
const imports = useImport<Diagram>({
  importers: CANVAS_IMPORTERS,
  noun: ["canvas", "canvases"],          // "Imported 2 canvases"
  history,                                // the tool's useHistory, if it has one
  openId: current?.id ?? null,            // what is open now (null = the tool's list)
  apply: ({ items }) => importAsNewAssets("diagrams", projectId, items, {
    previousId: current?.id ?? null,
    open: (diagram) => loadDiagram(diagram),               // open/select the first imported item
    back: (previous) => (previous ? loadDiagram(previous) : showList()),
  }),
});

<UndoRedoButtons history={imports.history} />   // the wrapped history knows about the import step
<ImportMenu imports={imports} />                // right before the tool's <ExportMenu>; `note` adds to its help line
<ExportMenu items={…} />
<ImportDropZone imports={imports} target={rootRef} />   // anywhere; drops inside rootRef import
```

`apply` decides where the items go:

- **New assets** (a canvas, dialogues, decisions): return `importAsNewAssets(...)`. It saves through `storage`
  (setting `projectId`, timestamps, dropping the `example` flag), opens the first item and returns an `ImportStep`.
  Undo deletes the imported assets and goes back to what was open; redo brings them back.
- **Into the open document** (issues onto the board, a layer into a tilemap, frames into a sprite): update the
  document's state as one change and return nothing. `useHistory` records it as one undo step. Select the first
  imported item.

## A step before applying

`useImport({ review })` runs between reading and applying: resolve with the (changed) result, or `null` to cancel
quietly. The Task Board uses it for its CSV column-matching dialog and to add the merge's own warnings.

## Undo

`useImport` returns `history`: the tool's own history plus the import step. Pass it to `UndoRedoButtons`. Ctrl/⌘+Z
undoes the import once the tool's own history has nothing left to undo, and only while the imported item is open.

## Re-importing a tool's own JSON export

`jsonReimporter({ id, label, read, refKeys?, finish? })` builds the importer:

- `read(data)` pulls the items out of the parsed JSON (use `oneOrMany` for "one item or an array") and throws an
  `ImportError` when the file isn't the right kind.
- Every object with an `id` gets a new one. References are rewritten when they sit under `id`, a key ending in
  `Id`/`Ids`, or a key in `refKeys` (Canvas: `from`, `to`, `fromRow`, `toRow`). Text fields are never touched.
- `{ type, id, elementId? }` objects are asset references: they keep pointing at the project's assets, unless they
  point inside the file, in which case they follow the new ids.
- `finish(items, { isImported })` cleans up after re-identifying, e.g. dropping links whose other end wasn't in the
  file (`isImported(id)` is false), and returns the warnings.

Round-trip test: export with the tool's own code, import, and compare with `differenceIgnoringIds`.

## Who has what

| Tool | Importers |
| --- | --- |
| Canvas | Canvas JSON, Excalidraw, SQL schema (`CREATE TABLE`) |
| Dialogue | Dialogue JSON, Yarn Spinner 2 (`.yarn`) |
| Music | MIDI (format 0/1), Song JSON |
| Sound effects | sfxr / jsfxr (JSON, b58 code, sfxr.me link), Sound JSON |
| Decision log | Decision log JSON, ADR Markdown (adr-tools / MADR, files or folder) |
| Task Board | Issues CSV (Jira, Linear, GitHub Projects, Trello presets), Board JSON (merged into the board) |
| Wiki / Story | Markdown files or folder (Obsidian vault) |
| Notebook | Markdown files or folder (sub-folders become note folders) |
| Pixel Art | PNG / JPG / WebP, animated GIF (a dialog first asks: new sprite or layer, shrink, snap to palette) |
| Sprite Sheets | Sheet image cut on a grid (dialog with live preview), atlas JSON + its PNG |
| Palettes | GIMP `.gpl`, `.hex` / `.txt` lists (Lospec, Paint.NET), JASC `.pal`, Adobe `.ase`, Lospec JSON (also fetched by name) |
| 3D Pixel Art | MagicaVoxel `.vox` |
| Tilemap | Tiled maps (`.tmj` / `.json`, `.tmx`) with embedded or external (`.tsj` / `.tsx`) tilesets and their images; also re-imports its own JSON export |

### Images and options

- `image/`: `ImageCodec` (decode a file to pixels, encode pixels as a PNG data URL; tests pass `fakeCodec` from
  `image/test-images.ts`), size caps in `image/limits.ts`, `readGif` and pixel helpers (crop, fit, palette snap).
- Importers that need choices first are factories (`pixelArtImporters(options)`, `sheetSliceImporter(grid)`,
  `atlasImporter(image)`). The tool's array holds default instances for the menu and drops; the page wraps
  `importFile` to show its dialog, then calls the real `importFile` with the configured importer, so undo and toasts
  still come from `useImport`.
