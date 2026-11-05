"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export interface ToolbarMenuItem {
  label: string;
  description?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

interface ToolbarMenuProps {
  icon: LucideIcon;
  label: string;
  title: string;
  items: ToolbarMenuItem[];
  disabled?: boolean;
  /** Small print under the items. */
  footer?: string;
  /** Settings above the items, e.g. a format choice that applies to them. */
  header?: React.ReactNode;
}

/** A "Label ▾" toolbar button with a drop-down list of actions; the look shared by `ExportMenu` and `ImportMenu`. */
export function ToolbarMenu({ icon: Icon, label, title, items, disabled, footer, header }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.maxHeight = `${Math.max(120, window.innerHeight - menu.getBoundingClientRect().top - 8)}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
        style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-56 rounded-lg p-1 shadow-xl overflow-y-auto"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          {header}
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={async () => {
                setOpen(false);
                await it.onClick();
              }}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              <span className="block text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                {it.label}
              </span>
              {it.description && (
                <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {it.description}
                </span>
              )}
            </button>
          ))}
          {footer && (
            <p className="px-3 pt-1.5 pb-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {footer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
