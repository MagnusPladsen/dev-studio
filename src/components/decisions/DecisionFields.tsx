"use client";

import { useLayoutEffect, useRef } from "react";
import type { Decision } from "@/types";
import { DECISION_FIELDS, type DecisionField } from "@/lib/decisions";
import { MarkdownPreview, type RenderCtx } from "@/components/MarkdownPreview";

export type FieldsMode = "write" | "read";

interface Props {
  decision: Decision;
  mode: FieldsMode;
  renderCtx(field: DecisionField): RenderCtx;
  onChange(field: DecisionField, value: string): void;
  onBlur(): void;
}

/** The four ADR sections, as Markdown text areas or rendered. */
export function DecisionFields({ decision, mode, renderCtx, onChange, onBlur }: Props): React.JSX.Element {
  return (
    <div className="space-y-5">
      {DECISION_FIELDS.map((field) => (
        <section key={field.key} aria-labelledby={`decision-field-${field.key}`}>
          <h2 id={`decision-field-${field.key}`} className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--accent)" }}>
            {field.label}
          </h2>
          {mode === "write" ? (
            <AutoTextarea
              value={decision[field.key]}
              placeholder={field.placeholder}
              label={field.label}
              onChange={(value) => onChange(field.key, value)}
              onBlur={onBlur}
            />
          ) : decision[field.key].trim() ? (
            <MarkdownPreview content={decision[field.key]} ctx={renderCtx(field.key)} />
          ) : (
            <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
              Nothing written yet.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function AutoTextarea({ value, placeholder, label, onChange, onBlur }: { value: string; placeholder: string; label: string; onChange(value: string): void; onBlur(): void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      aria-label={label}
      rows={3}
      spellCheck
      className="w-full resize-none rounded-lg px-3 py-2 text-sm font-mono leading-6 outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
    />
  );
}
