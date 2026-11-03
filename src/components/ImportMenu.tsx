"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import type { ImportController } from "@/hooks/useImport";
import type { Importer } from "@/lib/import";
import { ToolbarMenu } from "./ToolbarMenu";

/** The "Import ▾" button, placed right before a tool's `ExportMenu`: one item per file type the tool reads. */
export function ImportMenu({ imports, disabled }: { imports: ImportController; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = useRef<Importer<unknown> | null>(null);

  function pick(importer: Importer<unknown>) {
    const input = inputRef.current;
    if (!input) return;
    chosen.current = importer;
    input.accept = importer.pick === "folder" ? "" : importer.accept.join(",");
    input.multiple = importer.pick === "many" || importer.pick === "folder";
    input.webkitdirectory = importer.pick === "folder";
    input.value = "";
    input.click();
  }

  return (
    <>
      <ToolbarMenu
        icon={Upload}
        label="Import"
        title="Import a file into this tool"
        disabled={disabled || imports.isBusy}
        items={imports.importers.map((importer) => ({ label: importer.label, description: importer.description, onClick: () => pick(importer) }))}
        footer="You can also drop a file here."
      />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length && chosen.current) void imports.importFiles(files, chosen.current);
        }}
      />
    </>
  );
}
