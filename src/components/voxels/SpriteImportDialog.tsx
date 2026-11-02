"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { loadImage, spriteFrameSrc } from "@/lib/pixels";
import { MAX_GRID_SIZE, type VoxelGrid } from "@/lib/voxels/grid";
import {
  MAX_DEPTH,
  MIN_DEPTH,
  shrinkToFit,
  spriteToVoxels,
  type PixelImage,
  type SpriteBack,
  type SpriteDepthOptions,
  type SpriteShape,
} from "@/lib/voxels/sprite";
import { renderThumbnail } from "@/lib/voxels/thumbnail";
import type { Sprite } from "@/types";

export interface SpriteVoxels {
  sprite: Sprite;
  grid: VoxelGrid;
  colors: string[];
  /** The options the model was built with (depth, shape, back side) and the frame used. */
  options?: SpriteDepthOptions & { frame: number; shrunk: boolean };
}

interface Props {
  projectId: string;
  sprites: Sprite[];
  autoConvertSpriteId?: string;
  onCreate(result: SpriteVoxels): void;
  onClose(): void;
}

const FAILURE_MESSAGES = {
  "too-large": `That sprite is bigger than ${MAX_GRID_SIZE}×${MAX_GRID_SIZE}. Turn on "Shrink to fit" to use it.`,
  empty: "That frame has no visible pixels yet.",
  unreadable: "That sprite's image could not be read.",
};

const DEFAULT_DEPTH = 2;

async function readFrame(sprite: Sprite, frame: number): Promise<PixelImage | null> {
  const src = spriteFrameSrc(sprite, frame);
  if (!src) return null;
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, sprite.width, sprite.height);
}

function SpriteButton({ sprite, isBusy, onPick }: { sprite: Sprite; isBusy: boolean; onPick(): void }): React.JSX.Element {
  const src = spriteFrameSrc(sprite, 0);
  return (
    <button
      onClick={onPick}
      disabled={isBusy}
      className="flex flex-col items-center gap-1 p-2 rounded-lg text-xs hover:bg-[var(--bg-hover)] disabled:opacity-40"
      style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
      title={`${sprite.name}, ${sprite.width}×${sprite.height}`}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-12 h-12 object-contain" style={{ imageRendering: "pixelated" }} />
      )}
      <span className="w-full truncate">{sprite.name}</span>
    </button>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string, string])[];
  onChange(value: T): void;
}): React.JSX.Element {
  return (
    <div>
      <div className="text-xs font-medium mb-1" style={{ color: "var(--text-primary)" }}>{label}</div>
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={label}>
        {options.map(([optionValue, optionLabel, hint]) => {
          const on = optionValue === value;
          return (
            <button
              key={optionValue}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(optionValue)}
              className="text-left px-2 py-1.5 rounded"
              style={{ background: on ? "var(--accent-glow)" : "var(--bg-hover)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}` }}
              title={hint}
            >
              <span className="block text-xs font-medium" style={{ color: "var(--text-primary)" }}>{optionLabel}</span>
              <span className="block text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Pick a sprite, choose how thick and how round it should be, and it becomes a new 3D model. */
export function SpriteImportDialog({ projectId, sprites, autoConvertSpriteId, onCreate, onClose }: Props): React.JSX.Element {
  const [picked, setPicked] = useState<Sprite | null>(() => sprites.find((s) => s.id === autoConvertSpriteId) ?? null);
  const [frame, setFrame] = useState(0);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [shape, setShape] = useState<SpriteShape>("flat");
  const [back, setBack] = useState<SpriteBack>("mirror");
  const [shrink, setShrink] = useState(true);
  const [image, setImage] = useState<PixelImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // an auto-convert id can arrive after the sprite list loads
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || picked || !autoConvertSpriteId) return;
    const sprite = sprites.find((candidate) => candidate.id === autoConvertSpriteId);
    if (!sprite) return;
    preselected.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(sprite);
  }, [autoConvertSpriteId, sprites, picked]);

  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setMessage(null);
    readFrame(picked, frame)
      .then((read) => {
        if (cancelled) return;
        setImage(read);
        if (!read) setMessage(FAILURE_MESSAGES.unreadable);
      })
      .catch(() => !cancelled && setMessage(FAILURE_MESSAGES.unreadable))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [picked, frame]);

  const tooBig = !!image && (image.width > MAX_GRID_SIZE || image.height > MAX_GRID_SIZE);
  const source = image && tooBig && shrink ? shrinkToFit(image) : image;
  const options: SpriteDepthOptions = { depth, shape, back };

  const result = useMemo(() => (source ? spriteToVoxels(source, [], options) : null), [source, depth, shape, back]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (result?.ok ? renderThumbnail(result.grid, result.colors, 160) : ""), [result]);

  function create(): void {
    if (!picked || !result?.ok) return;
    onCreate({ sprite: picked, grid: result.grid, colors: result.colors, options: { ...options, frame, shrunk: tooBig && shrink } });
  }

  function pick(sprite: Sprite): void {
    setPicked(sprite);
    setFrame(0);
    setImage(null);
  }

  const error = message ?? (result && !result.ok ? FAILURE_MESSAGES[result.reason] : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Make a 3D model from a sprite">
      <div className="w-full max-w-lg rounded-2xl p-5 shadow-2xl max-h-full overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {picked && (
              <button onClick={() => setPicked(null)} className="p-1 rounded-md" style={{ color: "var(--text-secondary)" }} title="Pick another sprite" aria-label="Pick another sprite">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {picked ? `Make "${picked.name}" 3D` : "Make a 3D model from a sprite"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md shrink-0" style={{ color: "var(--text-secondary)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!picked ? (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Pick a sprite. Next you choose how thick and how round it gets. Your sprite stays as it is.
            </p>
            {sprites.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                No sprites yet. Draw one in{" "}
                <Link href={`/project/${projectId}/pixel-art`} className="underline" style={{ color: "var(--accent)" }}>Pixel Art</Link>{" "}
                first.
              </p>
            ) : (
              <div className="grid grid-cols-4 max-md:grid-cols-3 gap-2">
                {sprites.map((sprite) => (
                  <SpriteButton key={sprite.id} sprite={sprite} isBusy={false} onPick={() => pick(sprite)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-[1fr_168px] max-md:grid-cols-1 gap-4">
            <div className="space-y-3 min-w-0">
              {picked.frames.length > 1 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "var(--text-primary)" }}>Frame</div>
                  <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Frame">
                    {picked.frames.map((f, index) => {
                      const on = index === frame;
                      return (
                        <button
                          key={f.id ?? index}
                          role="radio"
                          aria-checked={on}
                          onClick={() => setFrame(index)}
                          className="w-10 h-10 rounded p-0.5 relative"
                          style={{ border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent-glow)" : "var(--bg-hover)" }}
                          title={`Frame ${index + 1}`}
                          aria-label={`Frame ${index + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.pixels} alt="" className="w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="sprite-depth" className="flex items-center justify-between text-xs font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Depth
                  <span className="tabular-nums font-normal" style={{ color: "var(--text-secondary)" }}>
                    {depth} cube{depth === 1 ? "" : "s"} thick
                  </span>
                </label>
                <input
                  id="sprite-depth"
                  type="range"
                  min={MIN_DEPTH}
                  max={MAX_DEPTH}
                  value={depth}
                  onChange={(event) => setDepth(Number(event.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              <Choice<SpriteShape>
                label="Shape"
                value={shape}
                onChange={setShape}
                options={[
                  ["flat", "Flat", "Same thickness everywhere, like a cookie."],
                  ["puffy", "Puffy", "Thinner at the edges, like a balloon."],
                ]}
              />
              <Choice<SpriteBack>
                label="Back side"
                value={back}
                onChange={setBack}
                options={[
                  ["mirror", "Same colours", "The back looks like the front."],
                  ["darker", "Darker back", "Shades the back so it reads as 3D."],
                ]}
              />

              {tooBig && image && (
                <label className="flex items-start gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={shrink} onChange={(event) => setShrink(event.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                  <span>
                    Shrink to fit. This sprite is {image.width}×{image.height}; models go up to {MAX_GRID_SIZE}×{MAX_GRID_SIZE}
                    {source && source !== image ? `, so it becomes ${source.width}×${source.height}` : ""}.
                  </span>
                </label>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div
                className="aspect-square w-full max-w-[168px] max-md:mx-auto rounded-lg flex items-center justify-center"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-muted)" }} />
                ) : preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Preview of the 3D model" className="w-[90%] h-[90%] object-contain" />
                ) : (
                  <span className="text-[11px] px-2 text-center" style={{ color: "var(--text-muted)" }}>No preview</span>
                )}
              </div>
              {error && <p className="text-xs" style={{ color: "var(--red)" }} role="alert">{error}</p>}
              <button
                onClick={create}
                disabled={!result?.ok || loading}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
              >
                Make 3D model
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
