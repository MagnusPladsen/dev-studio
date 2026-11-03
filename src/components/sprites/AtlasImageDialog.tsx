"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { readAtlas } from "@/lib/import/sprites";

interface Props {
  atlasFile: File;
  onPick(image: File): void;
  onCancel(): void;
}

/** An atlas JSON only says where the frames are; this asks for the PNG they are in. */
export function AtlasImageDialog({ atlasFile, onPick, onCancel }: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    atlasFile
      .text()
      .then((text) => isCurrent && setImageName(readAtlas(JSON.parse(text)).image ?? null))
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [atlasFile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Pick the atlas image">
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>Now the atlas image</h2>
          <button onClick={onCancel} className="p-1 rounded shrink-0" style={{ color: "var(--text-primary)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          {atlasFile.name} says where each frame is. Pick the PNG it goes with{imageName ? ` (${imageName})` : ""}, or drop both files together next time.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
            autoFocus
          >
            <ImageUp className="w-3.5 h-3.5" />
            Pick the PNG
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".png,image/png,.webp,image/webp"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPick(file);
            }}
          />
        </div>
      </div>
    </div>
  );
}
