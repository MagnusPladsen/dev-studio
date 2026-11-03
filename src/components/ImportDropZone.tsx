"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Upload } from "lucide-react";
import type { ImportController } from "@/hooks/useImport";
import { acceptsDragType, acceptsFile } from "@/lib/import";

const HIDE_AFTER_MS = 120;

function draggedTypes(transfer: DataTransfer | null): string[] | null {
  if (!transfer || !transfer.types.includes("Files")) return null;
  return [...transfer.items].filter((item) => item.kind === "file").map((item) => item.type);
}

/**
 * Lets files be dropped on a tool's workspace (`target`) to import them, with a hint over it while dragging.
 * Files no importer accepts fall through to the workspace's own drop handling (e.g. images on the Canvas).
 */
export function ImportDropZone({ imports, target }: { imports: ImportController; target: RefObject<HTMLElement | null> }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importsRef = useRef(imports);
  useEffect(() => {
    importsRef.current = imports;
  });

  useEffect(() => {
    const workspaceOf = (e: DragEvent) => {
      const element = target.current;
      return element && e.target instanceof Node && element.contains(e.target) ? element : null;
    };
    const hide = () => setRect(null);
    const onDragOver = (e: DragEvent) => {
      const element = workspaceOf(e);
      if (!element) return;
      const types = draggedTypes(e.dataTransfer);
      if (!types?.length || !types.some((type) => acceptsDragType(importsRef.current.importers, type))) return;
      e.preventDefault();
      setRect(element.getBoundingClientRect());
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, HIDE_AFTER_MS);
    };
    const onDrop = (e: DragEvent) => {
      hide();
      if (!workspaceOf(e)) return;
      const { importers, importFile } = importsRef.current;
      const files = [...(e.dataTransfer?.files ?? [])].filter((file) => importers.some((importer) => acceptsFile(importer.accept, file)));
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        for (const file of files) await importFile(file);
      })();
    };
    document.addEventListener("dragover", onDragOver, { capture: true });
    document.addEventListener("drop", onDrop, { capture: true });
    return () => {
      document.removeEventListener("dragover", onDragOver, { capture: true });
      document.removeEventListener("drop", onDrop, { capture: true });
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [target]);

  if (!rect) return null;
  return (
    <div
      className="fixed z-[150] pointer-events-none flex items-center justify-center rounded-lg border-2 border-dashed"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderColor: "var(--accent)", background: "color-mix(in srgb, var(--bg-primary) 70%, transparent)" }}
    >
      <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
        <Upload className="w-4 h-4" style={{ color: "var(--accent)" }} />
        Drop to import: {imports.importers.map((importer) => importer.label).join(", ")}
      </div>
    </div>
  );
}
