"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ImportResult } from "@/lib/import";
import {
  CSV_FIELDS,
  CSV_FIELD_LABELS,
  CSV_PRESETS,
  detectPreset,
  draftsFromCsv,
  mappingFor,
  presetById,
  type CsvMapping,
  type CsvPresetId,
  type CsvSource,
  type IssueDraft,
} from "@/lib/import/board";
import { CATEGORY_LABEL, fieldStyle, secondaryBtn } from "./meta";

const PREVIEW_ROWS = 4;

/**
 * The column-matching step of a CSV import: pick the tool the file came from (guessed from its headers), adjust
 * which column fills which field, and see the first issues before importing.
 */
export function CsvImportDialog({ source, onDone }: { source: CsvSource; onDone(result: ImportResult<IssueDraft> | null): void }) {
  const [presetId, setPresetId] = useState<CsvPresetId>(() => detectPreset(source.headers).id);
  const [mapping, setMapping] = useState<CsvMapping>(() => mappingFor(detectPreset(source.headers), source.headers));
  const result = useMemo(() => draftsFromCsv(source, mapping), [source, mapping]);
  const headers = useMemo(() => [...new Set(source.headers.filter(Boolean))], [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  function choosePreset(id: CsvPresetId) {
    setPresetId(id);
    setMapping(mappingFor(presetById(id), source.headers));
  }

  const count = result.items.length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => onDone(null)} role="dialog" aria-modal="true" aria-label="Match CSV columns">
      <div className="w-full max-w-lg rounded-2xl p-5 shadow-2xl max-h-full overflow-y-auto" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Match CSV columns
          </h2>
          <button onClick={() => onDone(null)} className="p-1 rounded-md" style={{ color: "var(--text-secondary)" }} title="Cancel import" aria-label="Cancel import">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
          Statuses go to the column with the same name, or the first column of their kind. Sprints are matched by name and added when missing.
        </p>

        <label className="flex flex-col gap-1 text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          Exported from
          <select value={presetId} onChange={(e) => choosePreset(e.target.value as CsvPresetId)} className="px-2 py-1.5 rounded-md text-sm outline-none" style={fieldStyle}>
            {CSV_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 mb-4">
          {CSV_FIELDS.map((field) => (
            <label key={field} className="flex flex-col gap-1 text-xs min-w-0" style={{ color: "var(--text-secondary)" }}>
              {CSV_FIELD_LABELS[field]}
              <select
                value={mapping.fields[field]}
                onChange={(e) => setMapping({ ...mapping, fields: { ...mapping.fields, [field]: e.target.value } })}
                className="px-2 py-1.5 rounded-md text-sm outline-none min-w-0"
                style={fieldStyle}
              >
                <option value="">{field === "title" ? "Choose a column" : "Not imported"}</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="rounded-lg mb-4 text-xs overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {result.items.slice(0, PREVIEW_ROWS).map((draft, index) => (
            <div key={index} className="flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
              <span className="truncate flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>
                {draft.title}
              </span>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                {draft.status.name} · {CATEGORY_LABEL[draft.status.category]}
              </span>
            </div>
          ))}
          {count === 0 && (
            <p className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
              No rows have a title in this column.
            </p>
          )}
          {count > PREVIEW_ROWS && (
            <p className="px-3 py-1.5 border-t" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              and {count - PREVIEW_ROWS} more
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => onDone(null)} className="px-3 py-1.5 rounded-md text-xs" style={secondaryBtn}>
            Cancel
          </button>
          <button onClick={() => onDone(result)} disabled={count === 0} className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
            Import {count} {count === 1 ? "issue" : "issues"}
          </button>
        </div>
      </div>
    </div>
  );
}
