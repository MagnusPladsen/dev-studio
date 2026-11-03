import type { DecisionStatus } from "@/types";
import { statusMeta } from "@/lib/decisions";

/** Coloured pill for a decision's status. */
export function StatusBadge({ status, className = "" }: { status: DecisionStatus; className?: string }): React.JSX.Element {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium shrink-0 ${className}`}
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
        textDecoration: status === "superseded" || status === "rejected" ? "line-through" : undefined,
      }}
      title={meta.hint}
    >
      {meta.label}
    </span>
  );
}
