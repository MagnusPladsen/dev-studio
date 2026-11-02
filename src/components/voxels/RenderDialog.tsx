"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { v4 as uuid } from "uuid";
import { Check, Film, ImageDown, Loader2, Save, X } from "lucide-react";
import type { Sprite } from "@/types";
import type { VoxelGrid } from "@/lib/voxels/grid";
import {
  DIRECTION_COUNTS,
  ELEVATIONS,
  FRAME_SIZES,
  TURNTABLE_FRAMES,
  directions,
  renderSpriteName,
  turntableYaws,
  type DirectionCount,
  type ElevationKey,
} from "@/lib/voxels/render";
import { exportFileBase } from "@/lib/voxels/export-name";
import { downloadBlob } from "@/lib/download";
import { encodeGif } from "@/lib/gif";
import { storage } from "@/lib/storage";
import { addLink } from "@/lib/links";
import { ASSET_KINDS, assetHref } from "@/lib/assets";
import { framesToSheet, imageToDataUrl, renderModelFrames } from "./render-2d";

interface Props {
  projectId: string;
  /** The open model's id, so the new sprite can link back to it. */
  modelId: string | null;
  doc: { name: string; grid: VoxelGrid; colors: string[] };
  onClose(): void;
}

const FPS = 8;
const TURNTABLE_SECONDS = 3;
/** Turntable GIFs are scaled up to roughly this size so they're easy to share. */
const GIF_TARGET_PX = 256;

const chip = (on: boolean): React.CSSProperties => ({
  background: on ? "var(--accent)" : "var(--bg-hover)",
  color: on ? "var(--on-accent, #fff)" : "var(--text-primary)",
  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
});
const secondary: React.CSSProperties = { color: "var(--text-primary)", border: "1px solid var(--border)", background: "var(--bg-card)" };

export function RenderDialog({ projectId, modelId, doc, onClose }: Props) {
  const [count, setCount] = useState<DirectionCount>(8);
  const [elevation, setElevation] = useState<ElevationKey>("iso");
  const [size, setSize] = useState(32);
  const [outline, setOutline] = useState(true);
  const [turnFrames, setTurnFrames] = useState<number>(24);
  const [preview, setPreview] = useState<{ src: string; label: string }[]>([]);
  const [busy, setBusy] = useState<null | "sprite" | "sheet" | "gif">(null);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirs = useMemo(() => directions(count), [count]);
  const options = useMemo(() => ({ size, elevation: ELEVATIONS[elevation].degrees, outline }), [size, elevation, outline]);
  const base = exportFileBase(doc.name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // re-render the preview shortly after the options settle
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const frames = renderModelFrames(doc.grid, doc.colors, dirs.map((d) => d.yaw), options);
        setPreview(frames.map((f, i) => ({ src: imageToDataUrl(f), label: dirs[i].label })));
        setError(frames.length ? null : "Add some cubes first.");
      } catch {
        setPreview([]);
        setError("Couldn't render the model. Your browser may not support 3D graphics.");
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [doc.grid, doc.colors, dirs, options]);

  async function run(kind: "sprite" | "sheet" | "gif", task: () => Promise<void> | void) {
    setBusy(kind);
    setError(null);
    // let the button show its busy state before the (synchronous) render starts
    await new Promise((r) => setTimeout(r, 30));
    try {
      await task();
    } catch {
      setError("Something went wrong while rendering. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function saveSprite() {
    return run("sprite", () => {
      const frames = renderModelFrames(doc.grid, doc.colors, dirs.map((d) => d.yaw), options);
      if (!frames.length) return;
      const now = new Date().toISOString();
      const sprite: Sprite = {
        id: uuid(),
        projectId,
        name: renderSpriteName(doc.name, count),
        width: size,
        height: size,
        fps: FPS,
        frames: frames.map((f) => {
          const pixels = imageToDataUrl(f);
          return { id: uuid(), pixels, duration: Math.round(1000 / FPS), layers: [{ id: uuid(), name: "Layer 1", visible: true, pixels }] };
        }),
        tags: ["render"],
        createdAt: now,
        updatedAt: now,
      };
      storage.save("sprites", sprite, projectId);
      if (modelId) addLink(projectId, { type: "sprite", id: sprite.id }, { type: "model", id: modelId });
      setSaved({ id: sprite.id, name: sprite.name });
    });
  }

  function downloadSheet() {
    return run("sheet", async () => {
      const frames = renderModelFrames(doc.grid, doc.colors, dirs.map((d) => d.yaw), options);
      if (!frames.length) return;
      downloadBlob(`${base}-${count}dir-${size}px.png`, await framesToSheet(frames));
    });
  }

  function downloadGif() {
    return run("gif", () => {
      const frames = renderModelFrames(doc.grid, doc.colors, turntableYaws(turnFrames), options);
      if (!frames.length) return;
      const delay = (TURNTABLE_SECONDS * 1000) / turnFrames;
      const blob = encodeGif(frames.map((image) => ({ image, delay })), { scale: Math.max(1, Math.floor(GIF_TARGET_PX / size)) });
      downloadBlob(`${base}-turntable.gif`, blob);
    });
  }

  const empty = !!error && preview.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      // portalled outside <main>, so carry the tool's colour in explicitly
      style={
        {
          "--accent": ASSET_KINDS.model.color,
          "--accent-glow": `color-mix(in srgb, ${ASSET_KINDS.model.color} 16%, transparent)`,
          "--on-accent": "#0b0b10",
          "--tool-color": ASSET_KINDS.model.color,
        } as React.CSSProperties
      }
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="render2d-title"
    >
      <div
        className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-2xl p-5 sm:p-6 shadow-2xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id="render2d-title" className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Render for 2D
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} aria-label="Close" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Turn your 3D model into pixel sprites for a 2D game: one frame per direction the character faces, or a turning
          animation. Free to use, no watermark.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <fieldset>
            <legend className="text-xs font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Directions</legend>
            <div className="flex gap-1">
              {DIRECTION_COUNTS.map((n) => (
                <button key={n} onClick={() => setCount(n)} className="flex-1 py-1.5 rounded text-xs" style={chip(count === n)} aria-pressed={count === n}>
                  {n === 1 ? "1 (front)" : `${n}`}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Camera angle</legend>
            <div className="flex gap-1">
              {(Object.keys(ELEVATIONS) as ElevationKey[]).map((k) => (
                <button key={k} onClick={() => setElevation(k)} className="flex-1 py-1.5 rounded text-xs" style={chip(elevation === k)} aria-pressed={elevation === k} title={`${ELEVATIONS[k].degrees}° above the model`}>
                  {ELEVATIONS[k].label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
            Frame size
            <select
              id="render2d-size"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="px-2 py-1 rounded outline-none"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {FRAME_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}×{s} px
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
            <input id="render2d-outline" type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} className="accent-[var(--accent)]" />
            Dark 1-pixel outline
          </label>
        </div>

        <div
          className="rounded-lg p-3 mb-4 min-h-28 flex flex-wrap gap-2 items-start"
          style={{ background: "repeating-conic-gradient(#1a1a2a 0% 25%, #222238 0% 50%) 0 0 / 12px 12px", border: "1px solid var(--border)" }}
          aria-label="Preview of the frames"
        >
          {preview.map((p, i) => (
            <figure key={i} className="m-0 flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.label} className="w-16 h-16 sm:w-20 sm:h-20" style={{ imageRendering: "pixelated" }} />
              <figcaption className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{p.label}</figcaption>
            </figure>
          ))}
          {preview.length === 0 && !error && (
            <p className="text-xs m-auto flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering…
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs mb-3" style={{ color: "var(--red)" }} role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={saveSprite}
            disabled={!!busy || empty}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
            title="Adds the frames as a new sprite in Pixel Art, linked to this model"
          >
            {busy === "sprite" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save as sprite
          </button>
          <button onClick={downloadSheet} disabled={!!busy || empty} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs disabled:opacity-50" style={secondary}>
            {busy === "sheet" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
            Sprite sheet PNG
          </button>
          <div className="flex items-center gap-1.5">
            <button onClick={downloadGif} disabled={!!busy || empty} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs disabled:opacity-50" style={secondary} title={`A ${TURNTABLE_SECONDS}-second turn, looping`}>
              {busy === "gif" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
              Turntable GIF
            </button>
            <select
              id="render2d-turn-frames"
              value={turnFrames}
              onChange={(e) => setTurnFrames(Number(e.target.value))}
              className="px-1.5 py-1.5 rounded text-xs outline-none"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              aria-label="Turntable frames"
            >
              {TURNTABLE_FRAMES.map((n) => (
                <option key={n} value={n}>
                  {n} frames
                </option>
              ))}
            </select>
          </div>
        </div>

        {saved && (
          <p className="text-xs mt-3 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-secondary)" }} role="status">
            <Check className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />
            Saved “{saved.name}”.
            <Link href={assetHref(projectId, "sprite", saved.id)} className="underline" style={{ color: "var(--text-primary)" }}>
              Open in Pixel Art
            </Link>
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
