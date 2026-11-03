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
- An importer is pure: it reads the file and returns items. It never touches `storage` or React state.

## Adding an importer to a tool

1. Write `src/lib/import/<tool>/<format>.ts` exporting the importer, plus `<format>.test.ts` (use `textFile()` from
   `test-helpers.ts`; for binary formats build a `File` from bytes).
2. Add it to the tool's array in `src/lib/import/<tool>/index.ts` (e.g. `CANVAS_IMPORTERS`). Menu order = array order.

That's all when the tool is already wired. The first importer for a tool also needs the wiring below.

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
| Canvas | Canvas JSON |
| Dialogue | Dialogue JSON, Yarn Spinner 2 (`.yarn`) |
| Music | MIDI (format 0/1), Song JSON |
| Sound effects | sfxr / jsfxr (JSON, b58 code, sfxr.me link), Sound JSON |
| Decision log | Decision log JSON |
