"use client";

import { useEffect } from "react";
import { GitBranch, LayoutDashboard, Plus, Server, X, type LucideIcon } from "lucide-react";
import { CANVAS_TEMPLATES, type CanvasTemplate, type TemplateId } from "@/lib/canvas-shapes/templates";

const ICONS: Record<TemplateId, LucideIcon> = {
  blank: Plus,
  "flow-chart": GitBranch,
  architecture: Server,
  moodboard: LayoutDashboard,
};

interface TemplatePickerProps {
  onPick(template: CanvasTemplate): void;
  onClose(): void;
}

/** Shown on "New canvas": start blank or from a ready-made layout that people then edit. */
export function TemplatePicker({ onPick, onClose }: TemplatePickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start a new canvas"
        onClick={(e) => e.stopPropagation()}
        className="w-[30rem] max-w-full rounded-xl border shadow-xl p-4"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Start a new canvas</h2>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-secondary)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
          {CANVAS_TEMPLATES.map((template, index) => {
            const Icon = ICONS[template.id];
            return (
              <button
                key={template.id}
                autoFocus={index === 0}
                onClick={() => onPick(template)}
                className="flex items-start gap-3 p-3 rounded-lg border text-left hover:bg-[var(--bg-hover)]"
                style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
              >
                <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>{template.name}</span>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{template.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>Templates are just starting cards: change or delete anything.</p>
      </div>
    </div>
  );
}
