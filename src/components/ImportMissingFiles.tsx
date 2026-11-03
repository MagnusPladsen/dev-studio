"use client";

import { useEffect, useRef } from "react";
import { FileUp, FolderUp, X } from "lucide-react";
import type { MissingFiles } from "@/hooks/useImport";

const secondaryButton = { color: "var(--text-primary)", border: "1px solid var(--border)" };

/** Asks for the files an import refers to but didn't get (a map's tilesets, their images): pick them or a folder. */
export function ImportMissingFiles({ missing }: { missing: MissingFiles }) {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") missing.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [missing]);

  const onPicked = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length) missing.add(files);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={missing.cancel} role="dialog" aria-modal="true" aria-label="Add the missing files">
      <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl max-h-full overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-base font-semibold min-w-0 break-words" style={{ color: "var(--text-primary)" }}>
            This import needs more files
          </h2>
          <button onClick={missing.cancel} className="p-1 rounded-md shrink-0" style={{ color: "var(--text-secondary)" }} title="Cancel import" aria-label="Cancel import">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
          Add these files, or the folder they are in:
        </p>
        <ul className="text-xs mb-4 space-y-0.5 font-mono" style={{ color: "var(--text-primary)" }}>
          {missing.names.map((name) => (
            <li key={name} className="break-all">{name}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => filesRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--accent)", color: "var(--on-accent, white)" }}>
            <FileUp className="w-3.5 h-3.5" />
            Add files…
          </button>
          <button onClick={() => folderRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs" style={secondaryButton}>
            <FolderUp className="w-3.5 h-3.5" />
            Add folder…
          </button>
          <button onClick={missing.skip} className="px-3 py-1.5 rounded-md text-xs" style={secondaryButton}>
            Import without them
          </button>
        </div>
        <input ref={filesRef} type="file" multiple className="hidden" aria-hidden tabIndex={-1} onChange={(e) => onPicked(e.currentTarget)} />
        <input
          ref={(input) => {
            folderRef.current = input;
            if (input) input.webkitdirectory = true;
          }}
          type="file"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => onPicked(e.currentTarget)}
        />
      </div>
    </div>
  );
}
