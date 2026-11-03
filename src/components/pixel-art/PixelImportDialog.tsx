"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { MAX_SPRITE_SIZE, type PixelImportOptions } from "@/lib/import/pixel-art";
import { probeImageSize } from "@/lib/import/image/codec";

interface Props {
  file: File;
  /** Still pictures can also go in as a layer; animations always become a new sprite. */
  canBeLayer: boolean;
  canvas: { width: number; height: number };
  palette: { name: string; colors: string[] };
  onImport(options: PixelImportOptions): void;
  onCancel(): void;
}

const sectionLabel = "text-[11px] font-medium uppercase tracking-wider mb-1.5";

function Choice({ checked, onChange, type = "checkbox", name, children }: { checked: boolean; onChange(checked: boolean): void; type?: "checkbox" | "radio"; name?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-xs py-1 cursor-pointer" style={{ color: "var(--text-primary)" }}>
      <input type={type} name={name} checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" style={{ accentColor: "var(--accent)" }} />
      <span>{children}</span>
    </label>
  );
}

function useImagePreview(file: File): { url: string | null; size: { width: number; height: number } | null; isUnreadable: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [isUnreadable, setIsUnreadable] = useState(false);
  useEffect(() => {
    let isCurrent = true;
    const reader = new FileReader();
    reader.onload = () => isCurrent && typeof reader.result === "string" && setUrl(reader.result);
    reader.readAsDataURL(file);
    probeImageSize(file).then(
      (probed) => isCurrent && setSize(probed),
      () => isCurrent && setIsUnreadable(true)
    );
    return () => {
      isCurrent = false;
      reader.abort();
    };
  }, [file]);
  return { url, size, isUnreadable };
}

/** Asks how a picture should come in before Pixel Art imports it: new sprite or layer, shrinking, palette snapping. */
export function PixelImportDialog({ file, canBeLayer, canvas, palette, onImport, onCancel }: Props): React.JSX.Element {
  const { url, size, isUnreadable } = useImagePreview(file);
  const [asLayer, setAsLayer] = useState(false);
  const [shrink, setShrink] = useState(true);
  const [snap, setSnap] = useState(false);
  const target = asLayer ? canvas : { width: MAX_SPRITE_SIZE, height: MAX_SPRITE_SIZE };
  const isTooBig = Boolean(size && (size.width > target.width || size.height > target.height));

  function confirm() {
    onImport({ shrink: isTooBig && shrink, palette: snap ? palette.colors : undefined, canvas: asLayer ? canvas : undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Import a picture">
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl max-h-full overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>Import {file.name}</h2>
          <button onClick={onCancel} className="p-1 rounded shrink-0" style={{ color: "var(--text-primary)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-20 h-20 shrink-0 rounded-md flex items-center justify-center overflow-hidden" style={{ background: "repeating-conic-gradient(var(--bg-card) 0% 25%, var(--bg-primary) 0% 50%) 0 0 / 12px 12px", border: "1px solid var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url && !isUnreadable && <img src={url} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />}
          </div>
          {isUnreadable ? (
            <p className="text-xs" role="alert" style={{ color: "var(--red)" }}>This file can&apos;t be opened as a picture. It may be damaged or in another format.</p>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{size ? `${size.width}×${size.height} pixels` : "Reading the picture…"}</p>
          )}
        </div>

        {canBeLayer && (
          <div className="mb-3">
            <div className={sectionLabel} style={{ color: "var(--text-muted)" }}>Add as</div>
            <Choice type="radio" name="pixel-import-target" checked={!asLayer} onChange={() => setAsLayer(false)}>A new sprite</Choice>
            <Choice type="radio" name="pixel-import-target" checked={asLayer} onChange={() => setAsLayer(true)}>
              A new layer in this sprite ({canvas.width}×{canvas.height})
            </Choice>
          </div>
        )}

        <div className="mb-4">
          <div className={sectionLabel} style={{ color: "var(--text-muted)" }}>Options</div>
          {isTooBig && (
            <Choice checked={shrink} onChange={setShrink}>
              Shrink to fit {target.width}×{target.height}
              <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                {asLayer ? "Otherwise the picture is cropped to the canvas." : `Sprites go up to ${MAX_SPRITE_SIZE}×${MAX_SPRITE_SIZE}; without shrinking it can't be imported.`}
              </span>
            </Choice>
          )}
          <Choice checked={snap} onChange={setSnap}>
            Snap colours to {palette.name} ({palette.colors.length} colours)
          </Choice>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button onClick={confirm} disabled={isUnreadable} className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }} autoFocus>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
