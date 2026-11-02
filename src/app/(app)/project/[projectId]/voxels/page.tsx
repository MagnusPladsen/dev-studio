"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, PanelTopOpen } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { HelpButton } from "@/components/HelpButton";
import { SaveIndicator } from "@/components/SaveIndicator";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { BlenderCard } from "@/components/voxels/BlenderCard";
import { BoxHeightBar } from "@/components/voxels/BoxHeightBar";
import { ColorStrip } from "@/components/voxels/ColorStrip";
import { ModelList } from "@/components/voxels/ModelList";
import { SpriteImportDialog, type SpriteVoxels } from "@/components/voxels/SpriteImportDialog";
import type { ViewPreset, VoxelTool } from "@/components/voxels/types";
import { useVoxelDocument, DEFAULT_MODEL_NAME, type VoxelDoc } from "@/components/voxels/useVoxelDocument";
import { useVoxelExports } from "@/components/voxels/useVoxelExports";
import { useVoxelStrokes } from "@/components/voxels/useVoxelStrokes";
import { VoxelEmptyState } from "@/components/voxels/VoxelEmptyState";
import { TOOL_META, VoxelToolbar } from "@/components/voxels/VoxelToolbar";
import type { VoxelViewportApi } from "@/components/voxels/VoxelViewport";
import { isTextField } from "@/hooks/useHistory";
import { useConsumedParam, useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { addLink } from "@/lib/links";
import { storage } from "@/lib/storage";
import { addColor, FALLBACK_COLORS, hexToRgb, MAX_COLORS, remapToPalette } from "@/lib/voxels/colors";
import type { Symmetry } from "@/lib/voxels/edit";
import { createGrid, DEFAULT_GRID_SIZE, resizeGrid, type VoxelGrid } from "@/lib/voxels/grid";
import type { Palette, VoxelModel } from "@/types";

const VoxelViewport = dynamic(() => import("@/components/voxels/VoxelViewport"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  ),
});

const TOOL_BY_KEY = Object.fromEntries(
  (Object.keys(TOOL_META) as VoxelTool[]).map((tool) => [TOOL_META[tool].key.toLowerCase(), tool])
) as Record<string, VoxelTool>;
const NO_SYMMETRY: Symmetry = { x: false, y: false, z: false };
const EXPORT_ERROR_MS = 6000;
const PLACEHOLDER_GRID: VoxelGrid = createGrid([DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE]);

function getNextModelName(models: VoxelModel[]): string {
  const names = new Set(models.map((model) => model.name));
  if (!names.has(DEFAULT_MODEL_NAME)) return DEFAULT_MODEL_NAME;
  let number = 2;
  while (names.has(`${DEFAULT_MODEL_NAME} ${number}`)) number++;
  return `${DEFAULT_MODEL_NAME} ${number}`;
}

/** The first colour light enough to see on the dark viewport, as a 1-based value. */
function getStartColorValue(colors: string[]): number {
  const index = colors.findIndex((color) => hexToRgb(color).reduce((sum, channel) => sum + channel, 0) > 180);
  return index + 1 || 1;
}

function getStartPalette(palettes: Palette[], preferredId: string | null): Palette | undefined {
  const usable = palettes.filter((palette) => palette.colors.length > 0);
  return usable.find((palette) => palette.id === preferredId) ?? usable[0];
}

function useEditorKeys(onTool: (tool: VoxelTool) => void, onSave: () => void): void {
  const handlers = useRef({ onTool, onSave });
  useEffect(() => {
    handlers.current = { onTool, onSave };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handlers.current.onSave();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
      const tool = TOOL_BY_KEY[event.key.toLowerCase()];
      if (!tool) return;
      event.preventDefault();
      handlers.current.onTool(tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function UnsupportedNotice(): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-6 max-md:p-4">
      <div className="max-w-md w-full space-y-4">
        <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
          This browser can&apos;t show 3D here because WebGL 2 is off or missing. Try another browser, or use Blender.
        </p>
        <BlenderCard />
      </div>
    </div>
  );
}

export default function VoxelsPage(): React.JSX.Element {
  const projectId = useParams().projectId as string;
  const searchParams = useSearchParams();
  const paletteParam = searchParams.get("palette");
  const version = useStorageVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const models = useMemo(() => storage.getAll("models", projectId), [projectId, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palettes = useMemo(() => storage.getAll("palettes", projectId), [projectId, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sprites = useMemo(() => storage.getAll("sprites", projectId), [projectId, version]);

  const editor = useVoxelDocument(projectId);
  const { doc, activeModelId, updateDoc } = editor;
  const [tool, setTool] = useState<VoxelTool>("add");
  const [symmetry, setSymmetry] = useState<Symmetry>(NO_SYMMETRY);
  const [isBoxErase, setIsBoxErase] = useState(false);
  const [colorValue, setColorValue] = useState(1);
  const [oneFingerOrbit, setOneFingerOrbit] = useState(false);
  const [view, setView] = useState<{ preset: ViewPreset; nonce: number }>({ preset: "reset", nonce: 0 });
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [isSpriteDialogOpen, setIsSpriteDialogOpen] = useState(false);
  const [autoConvertSpriteId, setAutoConvertSpriteId] = useState<string | null>(null);
  const [isModelsPanelOpen, setIsModelsPanelOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const viewportApiRef = useRef<VoxelViewportApi | null>(null);

  useEffect(() => {
    if (!exportError) return;
    const timer = setTimeout(() => setExportError(null), EXPORT_ERROR_MS);
    return () => clearTimeout(timer);
  }, [exportError]);

  const exportItems = useVoxelExports(doc, viewportApiRef, setExportError);
  const grid = doc?.grid ?? PLACEHOLDER_GRID;
  const colors = doc?.colors ?? FALLBACK_COLORS;
  const activeColorValue = Math.max(1, Math.min(colorValue, colors.length));
  const strokes = useVoxelStrokes({
    grid,
    tool,
    symmetry,
    colorValue: activeColorValue,
    isBoxErase,
    onCommit: (next) => updateDoc({ grid: next }),
    onPick: (value) => value > 0 && setColorValue(value),
  });

  function selectTool(next: VoxelTool): void {
    strokes.reset();
    setTool(next);
  }
  useEditorKeys(selectTool, editor.flush);

  function openModel(model: VoxelModel): void {
    setIsModelsPanelOpen(false);
    if (model.id === activeModelId) return;
    strokes.reset();
    editor.openModel(model);
    setColorValue(getStartColorValue(model.colors));
  }
  useOpenParam((id) => {
    const model = storage.getById("models", id, projectId);
    if (model) openModel(model);
  });
  useTrackOpenAsset(activeModelId ? { type: "model", id: activeModelId } : null);

  function startModel(initial: VoxelDoc): VoxelModel {
    strokes.reset();
    setIsModelsPanelOpen(false);
    setColorValue(getStartColorValue(initial.colors));
    return editor.createModel(initial);
  }

  function createEmptyModel(): void {
    const palette = getStartPalette(palettes, paletteParam);
    startModel({
      name: getNextModelName(models),
      grid: createGrid([DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE]),
      colors: palette ? palette.colors.slice(0, MAX_COLORS) : FALLBACK_COLORS,
      paletteId: palette?.id,
    });
  }

  useConsumedParam("fromSprite", (spriteId) => {
    setAutoConvertSpriteId(spriteId);
    setIsSpriteDialogOpen(true);
  });

  function closeSpriteDialog(): void {
    setIsSpriteDialogOpen(false);
    setAutoConvertSpriteId(null);
  }

  function createFromSprite({ sprite, grid: spriteGrid, colors: spriteColors }: SpriteVoxels): void {
    closeSpriteDialog();
    const model = startModel({ name: `${sprite.name} 3D`, grid: spriteGrid, colors: spriteColors });
    addLink(projectId, { type: "model", id: model.id }, { type: "sprite", id: sprite.id });
  }

  function deleteModel(model: VoxelModel): void {
    if (!confirm(`Delete model "${model.name}"?`)) return;
    if (model.id === activeModelId) strokes.reset();
    editor.deleteModel(model.id);
  }

  function changeSize(side: number): void {
    if (!doc || side === doc.grid.size[0]) return;
    const resized = resizeGrid(doc.grid, [side, side, side]);
    const sizeLabel = `${side}×${side}×${side}`;
    const lostLabel = `${resized.lost} cube${resized.lost === 1 ? "" : "s"}`;
    if (resized.lost > 0 && !confirm(`Making the grid ${sizeLabel} removes ${lostLabel} that no longer fit. Continue?`)) return;
    strokes.reset();
    updateDoc({ grid: resized.grid });
  }

  function addModelColor(hex: string): void {
    if (!doc) return;
    const added = addColor(doc.colors, hex);
    if (added.colors !== doc.colors) updateDoc({ colors: added.colors });
    setColorValue(added.value);
  }

  function applyPalette(paletteId: string): void {
    const palette = storage.getById("palettes", paletteId, projectId);
    if (!doc || !palette?.colors.length) return;
    const remapped = remapToPalette(doc.grid, doc.colors, palette.colors);
    updateDoc({ grid: remapped.grid, colors: remapped.colors, paletteId });
    setColorValue(getStartColorValue(remapped.colors));
  }

  const modelList = (
    <ModelList
      projectId={projectId}
      models={models}
      activeModelId={activeModelId}
      onOpen={openModel}
      onDelete={deleteModel}
      onNew={createEmptyModel}
      onFromSprite={() => setIsSpriteDialogOpen(true)}
    />
  );

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <div
        className="flex items-center justify-between gap-2 px-4 h-12 shrink-0 border-b max-md:h-auto max-md:flex-wrap max-md:py-2 max-md:px-3"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {doc && (
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Name</span>
              <input
                type="text"
                value={doc.name}
                onChange={(event) => updateDoc({ name: event.target.value })}
                placeholder={DEFAULT_MODEL_NAME}
                className="bg-transparent text-sm font-medium outline-none w-40 max-md:w-32 px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </label>
          )}
          <button
            onClick={() => setIsModelsPanelOpen((isOpen) => !isOpen)}
            className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-md text-xs"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)", background: isModelsPanelOpen ? "var(--bg-hover)" : undefined }}
            aria-expanded={isModelsPanelOpen}
            title="Models, examples and links"
          >
            <PanelTopOpen className="w-3.5 h-3.5" />
            Models
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <UndoRedoButtons history={editor.history} />
          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />
          {doc && <SaveIndicator state={editor.saveState} />}
          <HelpButton topic="voxels" />
          <ExportMenu disabled={!doc} items={exportItems} />
        </div>
      </div>

      {exportError && (
        <p className="shrink-0 px-3 py-1.5 text-xs" role="alert" style={{ color: "var(--red)" }}>
          {exportError}
        </p>
      )}

      {isModelsPanelOpen && (
        <div className="md:hidden shrink-0 max-h-[50dvh] overflow-y-auto border-b" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          {modelList}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 shrink-0 border-r overflow-y-auto max-md:hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
          {modelList}
        </aside>
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {!doc ? (
            <VoxelEmptyState hasModels={models.length > 0} onNew={createEmptyModel} onFromSprite={() => setIsSpriteDialogOpen(true)} />
          ) : isUnsupported ? (
            <UnsupportedNotice />
          ) : (
            <>
              <VoxelToolbar
                tool={tool}
                onToolChange={selectTool}
                isBoxErase={isBoxErase}
                onBoxEraseChange={setIsBoxErase}
                symmetry={symmetry}
                onSymmetryChange={setSymmetry}
                onView={(preset) => setView((current) => ({ preset, nonce: current.nonce + 1 }))}
                size={doc.grid.size[0]}
                onSizeChange={changeSize}
                oneFingerOrbit={oneFingerOrbit}
                onOneFingerOrbitChange={setOneFingerOrbit}
              />
              <div className="relative flex-1 min-h-0">
                <VoxelViewport
                  grid={strokes.displayGrid}
                  colors={doc.colors}
                  tool={strokes.isErasePreview ? "erase" : tool}
                  preview={strokes.preview}
                  oneFingerOrbit={oneFingerOrbit}
                  view={view}
                  onStroke={strokes.handleStroke}
                  onHover={strokes.handleHover}
                  onReady={(api) => (viewportApiRef.current = api)}
                  onUnsupported={() => setIsUnsupported(true)}
                />
                {strokes.box?.stage === "height" && (
                  <BoxHeightBar
                    height={strokes.box.draft.height}
                    maxHeight={strokes.box.maxHeight}
                    isErase={strokes.box.draft.isErase}
                    onHeightChange={strokes.setBoxHeight}
                    onConfirm={strokes.confirmBox}
                    onCancel={strokes.cancelBox}
                  />
                )}
              </div>
              <ColorStrip
                key={activeModelId}
                projectId={projectId}
                colors={doc.colors}
                value={activeColorValue}
                onSelect={setColorValue}
                onAddColor={addModelColor}
                palettes={palettes}
                initialPaletteId={paletteParam ?? doc.paletteId}
                onUsePalette={applyPalette}
              />
            </>
          )}
        </div>
      </div>

      {isSpriteDialogOpen && (
        <SpriteImportDialog
          projectId={projectId}
          sprites={sprites}
          autoConvertSpriteId={autoConvertSpriteId ?? undefined}
          onCreate={createFromSprite}
          onClose={closeSpriteDialog}
        />
      )}
    </div>
  );
}
