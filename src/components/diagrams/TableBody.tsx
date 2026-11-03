"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { v4 as uuid } from "uuid";
import { getShape } from "@/lib/canvas-shapes";
import { keyColor, keyLabel, moveColumn, nextKey, TABLE_HEADER, TABLE_ROW, tableColumns, tableHeight, type TableColumn } from "@/lib/diagrams/tables";
import { CONTROL, FIELD_STYLE, type BodyProps } from "./CardBodies";

const ICON_BUTTON = "p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 max-md:p-1.5";
/** Buttons keep focus in the editor, so pressing one never ends editing. */
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

function KeyMarker({ column }: { column: TableColumn }) {
  const label = keyLabel(column);
  return (
    <span className="w-8 shrink-0 text-[9px] font-bold tracking-wide" style={{ color: label ? keyColor(column) : undefined }}>
      {label}
    </span>
  );
}

function ColumnRow({ column, index, count, onChange, onMove, onRemove, onEnter, autoFocus }: {
  column: TableColumn;
  index: number;
  count: number;
  onChange(column: TableColumn): void;
  onMove(step: -1 | 1): void;
  onRemove(): void;
  onEnter(): void;
  autoFocus: boolean;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onEnter();
    }
  };
  const key = keyLabel(column);
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Column ${index + 1}`}>
      <button
        onMouseDown={keepFocus}
        onClick={() => onChange(nextKey(column))}
        className="w-11 shrink-0 py-1 rounded text-[10px] font-bold"
        style={{ ...FIELD_STYLE, color: key ? keyColor(column) : "var(--text-muted)" }}
        title="Primary key / foreign key: click to change"
        aria-label={`Key: ${key || "none"}. Click to change`}
      >
        {key || "key"}
      </button>
      <input
        autoFocus={autoFocus}
        value={column.name}
        onChange={(e) => onChange({ ...column, name: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder="column"
        aria-label="Column name"
        className="w-28 min-w-0 px-1.5 py-1 rounded text-xs outline-none select-text"
        style={FIELD_STYLE}
      />
      <input
        value={column.type}
        onChange={(e) => onChange({ ...column, type: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder="type"
        aria-label="Column type"
        className="w-20 min-w-0 px-1.5 py-1 rounded text-xs outline-none select-text"
        style={FIELD_STYLE}
      />
      <button onMouseDown={keepFocus} onClick={() => onMove(-1)} disabled={index === 0} className={ICON_BUTTON} style={{ color: "var(--text-primary)" }} title="Move up" aria-label="Move column up">
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button onMouseDown={keepFocus} onClick={() => onMove(1)} disabled={index === count - 1} className={ICON_BUTTON} style={{ color: "var(--text-primary)" }} title="Move down" aria-label="Move column down">
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      <button onMouseDown={keepFocus} onClick={onRemove} className={ICON_BUTTON} style={{ color: "var(--red)" }} title="Remove column" aria-label="Remove column">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Name and rows edit as one draft: it is saved, as one undo step, when focus leaves the editor. Esc throws it away. */
function TableEditor({ node, onCommit, onCancel }: BodyProps) {
  const [name, setName] = useState(node.label);
  const [columns, setColumns] = useState(tableColumns(node));
  const [focusId, setFocusId] = useState<string | null>(null);
  const isCancelled = useRef(false);

  const finish = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (isCancelled.current) return onCancel();
    const kept = columns.filter((column) => column.name.trim()).map((column) => ({ ...column, name: column.name.trim(), type: column.type.trim() }));
    onCommit({ label: name.trim() || getShape("table").defaultLabel, data: { ...node.data, columns: kept }, height: tableHeight(kept.length) });
  };
  const addColumnAt = (index: number) => {
    const column: TableColumn = { id: uuid(), name: "", type: "text" };
    setColumns((all) => [...all.slice(0, index), column, ...all.slice(index)]);
    setFocusId(column.id);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") isCancelled.current = true;
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  return (
    <div
      {...CONTROL}
      onBlur={finish}
      onKeyDown={onKeyDown}
      className="absolute left-0 top-0 z-10 w-max min-w-full p-2 rounded-lg border shadow-xl space-y-1.5"
      style={{ background: "var(--bg-card)", borderColor: "var(--accent)" }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !(e.metaKey || e.ctrlKey) && addColumnAt(columns.length)}
        placeholder="Table name"
        aria-label="Table name"
        className="w-full px-1.5 py-1 rounded text-sm font-semibold outline-none select-text"
        style={FIELD_STYLE}
      />
      {columns.map((column, index) => (
        <ColumnRow
          key={column.id}
          column={column}
          index={index}
          count={columns.length}
          autoFocus={column.id === focusId}
          onChange={(next) => setColumns((all) => all.map((c) => (c.id === column.id ? next : c)))}
          onMove={(step) => setColumns((all) => moveColumn(all, index, step))}
          onRemove={() => setColumns((all) => all.filter((c) => c.id !== column.id))}
          onEnter={() => addColumnAt(index + 1)}
        />
      ))}
      <button
        onMouseDown={keepFocus}
        onClick={() => addColumnAt(columns.length)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-primary)" }}
      >
        <Plus className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} /> Add column
      </button>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Enter adds a column · ⌘/Ctrl+Enter to finish · Esc to cancel</p>
    </div>
  );
}

/** A database table: one row per column with its PK/FK marker and type; lines attach to single rows. */
export function TableBody(props: BodyProps) {
  const { node, isEditing, hasHandles } = props;
  const color = node.color ?? getShape("table").color;
  const columns = tableColumns(node);
  return (
    <div className="relative w-full h-full rounded-lg shadow-sm" style={{ background: "var(--bg-card)", border: `1.5px solid ${color}` }}>
      <div
        className="px-3 flex items-center text-[13px] font-semibold rounded-t-[7px]"
        style={{ height: TABLE_HEADER - 1.5, background: `${color}2e`, color: "var(--text-primary)" }}
      >
        <span className="truncate">{node.label}</span>
      </div>
      {!columns.length && (
        <p className="px-3 text-xs flex items-center" style={{ height: TABLE_ROW, color: "var(--text-muted)" }}>Double-click to add columns</p>
      )}
      {columns.map((column) => (
        <div
          key={column.id}
          data-row-id={column.id}
          className="relative flex items-center gap-1 px-2.5 text-xs border-t"
          style={{ height: TABLE_ROW, borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <KeyMarker column={column} />
          <span className="flex-1 min-w-0 truncate" style={{ fontWeight: column.isPrimaryKey ? 600 : undefined }}>{column.name}</span>
          <span className="shrink-0 max-w-[45%] truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{column.type}</span>
          {hasHandles && !isEditing && (
            <span
              data-connect-handle=""
              data-row-id={column.id}
              className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-3 rounded-full border-2 pointer-events-auto max-md:w-4 max-md:h-4 max-md:-right-2.5"
              style={{ background: "var(--accent)", borderColor: "var(--bg-primary)", cursor: "crosshair" }}
              title={`Drag onto a row of another table to relate ${column.name}`}
            />
          )}
        </div>
      ))}
      {isEditing && <TableEditor {...props} />}
    </div>
  );
}
