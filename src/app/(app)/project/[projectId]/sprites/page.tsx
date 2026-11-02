"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Package, Check, Images, Link2, X } from "lucide-react";
import { storage } from "@/lib/storage";
import { loadImage, spriteFrameSrc } from "@/lib/pixels";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { useHistory } from "@/hooks/useHistory";
import { useAutosave } from "@/hooks/useAutosave";
import { ExportMenu } from "@/components/ExportMenu";
import { scalePixels, type ScaleFactor, type ScaleMethod } from "@/lib/pixel-scale";
import { HelpButton } from "@/components/HelpButton";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import type { Sprite, SpriteSheet } from "@/types";
import { v4 as uuid } from "uuid";

interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  width: number;
  height: number;
  frames: { key: string; src: string; rect: AtlasFrame }[];
}

function safeName(name: string): string {
  return name.trim().replace(/[^\w-]+/g, "_") || "sprite";
}

/** One row per sprite, its frames left to right. */
function computeLayout(sprites: Sprite[], padding: number): Layout {
  const frames: Layout["frames"] = [];
  const usedKeys = new Set<string>();
  let y = padding;
  let width = 0;
  for (const sprite of sprites) {
    let base = safeName(sprite.name);
    if (usedKeys.has(base)) base = `${base}_${sprite.id.slice(0, 4)}`;
    usedKeys.add(base);
    let x = padding;
    sprite.frames.forEach((frame, i) => {
      if (!frame.pixels) return;
      frames.push({ key: `${base}_${i}`, src: frame.pixels, rect: { x, y, w: sprite.width, h: sprite.height } });
      x += sprite.width + padding;
    });
    width = Math.max(width, x);
    y += sprite.height + padding;
  }
  return { width: Math.max(width, 1), height: Math.max(y, 1), frames };
}

const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };
const secondaryBtn = { color: "var(--text-primary)", border: "1px solid var(--border)" };

interface Selection {
  id: string | null;
  spriteIds: string[];
  padding: number;
}

export default function SpriteSheetPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const version = useStorageVersion();

  const [current, setCurrent] = useState<SpriteSheet | null>(null);
  const [selectedSpriteIds, setSelectedSpriteIds] = useState<string[]>([]);
  const [padding, setPadding] = useState(1);
  // export size: "1" or "<factor>-<sharp|smooth>"
  const [exportScale, setExportScale] = useState("1");
  // id travels with the selection so a save that lands after switching sheets goes to the right one
  const selection = useMemo<Selection>(
    () => ({ id: current?.id ?? null, spriteIds: selectedSpriteIds, padding }),
    [current?.id, selectedSpriteIds, padding]
  );
  const history = useHistory(
    selection,
    (v) => {
      setSelectedSpriteIds(v.spriteIds);
      setPadding(v.padding);
    },
    current?.id
  );
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [rendering, setRendering] = useState(false);
  // phones only: which side panel is open (desktop always shows both)
  const [mobilePanel, setMobilePanel] = useState<"sheets" | "links" | null>("sheets");

  const sprites = useMemo(
    () => storage.getAll("sprites", projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, version]
  );
  const sheets = useMemo(
    () => storage.getAll("spritesheets", projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, version]
  );

  const sheetSprites = useMemo(
    () => selectedSpriteIds.map((id) => sprites.find((s) => s.id === id)).filter((s): s is Sprite => !!s),
    [selectedSpriteIds, sprites]
  );
  const layout = useMemo(() => computeLayout(sheetSprites, padding), [sheetSprites, padding]);

  useOpenParam((id) => {
    const sheet = storage.getById("spritesheets", id, projectId);
    if (sheet) selectSheet(sheet);
  });
  useTrackOpenAsset(current?.id ? { type: "spritesheet", id: current?.id } : null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !current) return;
    let cancelled = false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    (async () => {
      setRendering(true);
      const images = await Promise.all(layout.frames.map((f) => loadImage(f.src).catch(() => null)));
      if (cancelled) return;
      canvas.width = layout.width;
      canvas.height = layout.height;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      layout.frames.forEach((f, i) => {
        const img = images[i];
        if (img) ctx.drawImage(img, f.rect.x, f.rect.y, f.rect.w, f.rect.h);
      });
      setRendering(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [current, layout]);

  const saveSelection = useCallback(
    (v: Selection) => {
      if (!v.id) return;
      const stored = storage.getById("spritesheets", v.id, projectId);
      if (!stored) return; // deleted while a save was pending
      storage.save(
        "spritesheets",
        { ...stored, spriteIds: v.spriteIds, padding: v.padding, updatedAt: new Date().toISOString() } as SpriteSheet,
        projectId
      );
    },
    [projectId]
  );
  const autosave = useAutosave(selection, saveSelection, { resetKey: current?.id, enabled: !!current });
  const flushSave = autosave.flush;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

  function selectSheet(sheet: SpriteSheet) {
    setCurrent(sheet);
    setSelectedSpriteIds(sheet.spriteIds);
    setPadding(sheet.padding);
  }

  const defaultName = () => `Sheet ${sheets.length + 1}`;

  function openNewForm() {
    setNewName(defaultName());
    setShowNew(true);
    setMobilePanel("sheets");
  }

  function createSheet(name = newName) {
    const sheet: SpriteSheet = {
      id: uuid(),
      projectId,
      name: name.trim() || defaultName(),
      spriteIds: selectedSpriteIds,
      padding,
      powerOfTwo: false,
      createdAt: new Date().toISOString(),
    };
    storage.save("spritesheets", sheet, projectId);
    selectSheet(sheet);
    setShowNew(false);
    setNewName("");
  }

  function toggleSprite(id: string) {
    setSelectedSpriteIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  function deleteSheet(id: string) {
    if (!confirm("Delete this sprite sheet?")) return;
    storage.delete("spritesheets", id, projectId);
    if (current?.id === id) setCurrent(null);
  }

  function download(href: string, filename: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
  }

  function scaleOf(): { factor: 1 | ScaleFactor; method: ScaleMethod } {
    const [f, m] = exportScale.split("-");
    return { factor: Number(f) as 1 | ScaleFactor, method: (m as ScaleMethod) || "sharp" };
  }

  function exportPNG() {
    const canvas = canvasRef.current;
    if (!canvas || rendering) return;
    const { factor, method } = scaleOf();
    const suffix = factor === 1 ? "" : `@${factor}x`;
    let href = canvas.toDataURL("image/png");
    if (factor !== 1) {
      const src = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      const out = scalePixels(src, factor, method);
      const big = document.createElement("canvas");
      big.width = out.width;
      big.height = out.height;
      big.getContext("2d")!.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
      href = big.toDataURL("image/png");
    }
    download(href, `${safeName(current?.name || "spritesheet")}${suffix}.png`);
  }

  function exportAtlas() {
    const { factor } = scaleOf();
    const name = safeName(current?.name || "spritesheet") + (factor === 1 ? "" : `@${factor}x`);
    const scaleRect = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v * factor]));
    const atlas = {
      frames: Object.fromEntries(layout.frames.map((f) => [f.key, scaleRect(f.rect as unknown as Record<string, number>)])),
      meta: { image: `${name}.png`, size: { w: layout.width * factor, h: layout.height * factor }, scale: factor },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(atlas, null, 2)], { type: "application/json" }));
    download(url, `${name}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const mobileToggle = (panel: "sheets" | "links", label: string, Icon: typeof Images) => (
    <button
      onClick={() => setMobilePanel((p) => (p === panel ? null : panel))}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
      style={{ ...secondaryBtn, background: mobilePanel === panel ? "var(--bg-hover)" : "transparent" }}
      aria-expanded={mobilePanel === panel}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div className="flex max-md:flex-col h-full max-md:h-auto max-md:min-h-full" style={{ background: "var(--bg-primary)" }}>
      {/* Phones: toggles for the side panels */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
        {mobileToggle("sheets", "Sheets & sprites", Images)}
        {current && mobileToggle("links", "Links", Link2)}
      </div>

      {/* Left: sheet list + sprite selector */}
      <div
        className={`w-60 max-md:w-full shrink-0 border-r max-md:border-r-0 max-md:border-b flex-col overflow-y-auto max-md:max-h-[55vh] ${
          mobilePanel === "sheets" ? "flex" : "max-md:hidden flex"
        }`}
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Sprite Sheets</span>
            <div className="flex items-center gap-1">
              <PasteButton type="spritesheet" />
              <button onClick={openNewForm} className="p-1 rounded" style={{ color: "var(--accent)" }} title="New sprite sheet" aria-label="New sprite sheet">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {showNew && (
            <div className="mb-2 space-y-1.5">
              <input
                placeholder="Sheet name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSheet()}
                className="w-full px-2 py-1 rounded text-xs outline-none"
                style={inputStyle}
                aria-label="Sprite sheet name"
                autoFocus
              />
              <div className="flex gap-1">
                <button onClick={() => createSheet()} className="flex-1 px-2 py-1 rounded text-xs font-medium" style={{ background: "var(--accent)", color: "white" }}>Create</button>
                <button onClick={() => setShowNew(false)} className="px-2 py-1 rounded text-xs" style={secondaryBtn}>Cancel</button>
              </div>
            </div>
          )}
          <div {...pasteTriggerProps("spritesheet")} className="space-y-0.5">
            {sheets.map((s) => (
              <div
                key={s.id}
                {...assetTriggerProps({ type: "spritesheet", id: s.id })}
                {...rowButtonProps(() => assetTriggerProps({ type: "spritesheet", id: s.id }))}
                className="group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer"
                style={{ background: current?.id === s.id ? "var(--bg-hover)" : "transparent", color: "var(--text-primary)" }}
                onClick={() => {
                  selectSheet(s);
                  setMobilePanel(null);
                }}
              >
                <span className="truncate">{s.name}</span>
                <div className="flex items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSheet(s.id); }}
                    className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                    style={{ color: "var(--red)" }}
                    title={`Delete ${s.name}`}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <AssetPinButton asset={{ type: "spritesheet", id: s.id }} label={s.name} />
                  <AssetMenuButton asset={{ type: "spritesheet", id: s.id }} label={s.name} />
                </div>
              </div>
            ))}
          </div>
          <ExamplesBar projectId={projectId} collections={["spritesheets"]} className="mt-3" />
        </div>

        <div className="p-3 flex-1 overflow-y-auto">
          <span className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
            Sprites ({sprites.length})
          </span>
          {sprites.length === 0 ? (
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              No sprites yet. Draw some in{" "}
              <Link href={`/project/${projectId}/pixel-art`} className="underline" style={{ color: "var(--accent)" }}>Pixel Art</Link>.
            </p>
          ) : (
            <div className="space-y-0.5">
              {sprites.map((s) => {
                const selected = selectedSpriteIds.includes(s.id);
                const src = spriteFrameSrc(s, 0);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSprite(s.id)}
                    aria-pressed={selected}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left"
                    style={{ background: selected ? "var(--accent-glow)" : "transparent", color: "var(--text-primary)" }}
                  >
                    {selected ? (
                      <Check className="w-3 h-3 shrink-0" style={{ color: "var(--accent)" }} />
                    ) : (
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ border: "1px solid var(--border)" }} />
                    )}
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="w-5 h-5 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                    ) : (
                      <span className="w-5 h-5 shrink-0" />
                    )}
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto shrink-0" style={{ color: "var(--text-muted)" }}>
                      {s.width}×{s.height}
                      {s.frames.length > 1 ? ` ·${s.frames.length}f` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden max-md:min-h-[60vh]">
        <div className="h-10 flex items-center gap-3 px-3 border-b shrink-0 md:max-xl:h-auto md:max-xl:min-h-10 md:max-xl:py-1.5 md:max-xl:flex-wrap md:max-xl:gap-y-1.5" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3 min-w-0 max-md:overflow-x-auto md:max-xl:flex-wrap md:max-xl:gap-y-1.5 [&>*]:shrink-0">
            <UndoRedoButtons history={history} />
            <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />
            <label className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: current ? "var(--text-secondary)" : "var(--text-muted)" }}>
              Padding
              <input
                type="number"
                min={0}
                max={16}
                value={padding}
                onChange={(e) => setPadding(Math.max(0, Math.min(16, +e.target.value || 0)))}
                disabled={!current}
                className="w-12 px-1 py-0.5 rounded text-xs outline-none disabled:opacity-40"
                style={inputStyle}
              />
              px
            </label>
            <label className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: current ? "var(--text-secondary)" : "var(--text-muted)" }} title="Export the sheet bigger: sharp keeps square pixels, smooth rounds diagonal edges">
              Export size
              <select
                value={exportScale}
                onChange={(e) => setExportScale(e.target.value)}
                disabled={!current}
                className="px-1 py-0.5 rounded text-xs outline-none disabled:opacity-40"
                style={inputStyle}
              >
                <option value="1">1× (original)</option>
                <option value="2-sharp">2× sharp</option>
                <option value="3-sharp">3× sharp</option>
                <option value="4-sharp">4× sharp</option>
                <option value="2-smooth">2× smooth</option>
                <option value="3-smooth">3× smooth</option>
                <option value="4-smooth">4× smooth</option>
              </select>
            </label>
          </div>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {current && (
              <>
                <span className="text-xs max-xl:hidden" style={{ color: "var(--text-muted)" }}>
                  {layout.frames.length} frames · {layout.width}×{layout.height}px
                </span>
                <SaveIndicator state={autosave.state} />
                <button
                  onClick={() => setMobilePanel((p) => (p === "links" ? null : "links"))}
                  className="hidden md:max-xl:flex p-1.5 rounded-md"
                  style={{ ...secondaryBtn, background: mobilePanel === "links" ? "var(--bg-hover)" : "transparent" }}
                  title="Links"
                  aria-label="Links"
                  aria-expanded={mobilePanel === "links"}
                >
                  <Link2 className="w-4 h-4" />
                </button>
              </>
            )}
            <HelpButton topic="sprites" />
            <ExportMenu
              disabled={!current || layout.frames.length === 0}
              items={[
                { label: "PNG", description: exportScale === "1" ? "The packed sheet image" : `The packed sheet at ${exportScale.replace("-", " ")}`, onClick: exportPNG, disabled: rendering },
                { label: "Atlas JSON", description: exportScale === "1" ? "Frame positions for your engine" : "Frame positions matching the scaled PNG", onClick: exportAtlas },
              ]}
            />
          </div>
        </div>

        <div className="relative flex-1 overflow-auto flex max-md:flex-col">
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            {current ? (
              layout.frames.length === 0 ? (
                <div className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Pick sprites on the left to add them to this sheet.
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  className="border"
                  style={{
                    borderColor: "var(--border)",
                    imageRendering: "pixelated",
                    width: Math.min(layout.width * 4, 1024),
                    maxWidth: "100%",
                    background: "repeating-conic-gradient(#1a1a2e 0% 25%, #222238 0% 50%) 0 0 / 16px 16px",
                  }}
                />
              )
            ) : (
              <div className="text-center max-w-xs" style={{ color: "var(--text-muted)" }}>
                <Package className="w-12 h-12 mx-auto mb-3" />
                <p style={{ color: "var(--text-secondary)" }}>Pack sprites into one image for your game engine.</p>
                <p className="text-xs mt-1 mb-4">Each sprite gets its own row, with its animation frames left to right.</p>
                <button
                  onClick={() => createSheet(defaultName())}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  <Plus className="w-4 h-4" />
                  New sprite sheet
                </button>
                {selectedSpriteIds.length > 0 && (
                  <p className="text-[11px] mt-2">Starts with the {selectedSpriteIds.length} sprite{selectedSpriteIds.length === 1 ? "" : "s"} you picked.</p>
                )}
              </div>
            )}
          </div>
          {current && (
            <div
              className={`w-56 max-md:w-full shrink-0 border-l max-md:border-l-0 max-md:border-t p-3 overflow-y-auto max-xl:shadow-2xl max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[60dvh] max-md:z-30 md:max-xl:absolute md:max-xl:inset-y-0 md:max-xl:right-0 md:max-xl:z-20 ${
                mobilePanel === "links" ? "" : "max-xl:hidden"
              }`}
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="xl:hidden flex justify-end -mt-1 -mr-1">
                <button
                  onClick={() => setMobilePanel(null)}
                  className="p-1 rounded"
                  style={{ color: "var(--text-primary)" }}
                  title="Close links"
                  aria-label="Close links"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <LinkedAssets projectId={projectId} type="spritesheet" id={current.id} layout="panel" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
