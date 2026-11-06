"use client";

import { useState } from "react";
import type { DialogueValue, DialogueVariable } from "@/types";
import { coerceValue } from "@/lib/dialogue/logic";

export const FIELD_STYLE: React.CSSProperties = {
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export const FIELD_CLASS = "px-2 py-1 rounded text-xs outline-none min-w-0";

/** One value of a variable's type: true/false, a number or text. */
export function ValueInput({
  type,
  value,
  onChange,
  label,
  className = "",
}: {
  type: DialogueVariable["type"];
  value: DialogueValue | undefined;
  onChange(value: DialogueValue): void;
  label: string;
  className?: string;
}) {
  const current = coerceValue(value, type);
  if (type === "bool") {
    return (
      <select className={`${FIELD_CLASS} ${className}`} style={FIELD_STYLE} value={String(current)} onChange={(e) => onChange(e.target.value === "true")} aria-label={label}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (type === "number") return <NumberInput value={current as number} onChange={onChange} label={label} className={className} />;
  return <input className={`${FIELD_CLASS} ${className}`} style={FIELD_STYLE} value={String(current)} onChange={(e) => onChange(e.target.value)} aria-label={label} />;
}

/** Keeps what is typed ("-", "1.") while it isn't a number yet; the value changes once it is one. */
function NumberInput({ value, onChange, label, className }: { value: number; onChange(value: number): void; label: string; className: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`${FIELD_CLASS} ${className}`}
      style={FIELD_STYLE}
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const number = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(number)) onChange(number);
      }}
      onBlur={() => setDraft(null)}
      aria-label={label}
    />
  );
}
