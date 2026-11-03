"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import type { ImportController } from "@/hooks/useImport";
import type { Importer } from "@/lib/import";
import { ToolbarMenu } from "./ToolbarMenu";
import { ImportMissingFiles } from "./ImportMissingFiles";

/**
 * The "Import ▾" button, placed right before a tool's `ExportMenu`: one item per file type the tool reads.
 * `note` goes in the menu's help line, e.g. to say which files can't be imported.
 */
export function ImportMenu({ imports, disabled, note }: { imports: ImportController; disabled?: boolean; note?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = useRef<Importer<unknown> | null>(null);

  function pick(importer: Importer<unknown>) {
    const input = inputRef.current;
    if (!input) return;
    chosen.current = importer;
    input.accept = importer.pick === "folder" ? "" : [...importer.accept, ...(importer.companions ?? [])].join(",");
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
        footer={note ? `${note} You can also drop a file here.` : "You can also drop a file here."}
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
      {imports.missing && <ImportMissingFiles missing={imports.missing} />}
    </>
  );
}
