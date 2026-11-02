"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import { HELP, type HelpTopic } from "@/lib/help-content";

/** The tool tint lives on the workspace wrapper, so the portalled dialog copies it to keep the tool's colours. */
const THEME_VARS = ["--tool-color", "--accent", "--accent-glow", "--on-accent", "--bg-primary", "--bg-secondary", "--bg-card", "--bg-hover", "--border", "--border-hover"];

function readThemeVars(element: HTMLElement): React.CSSProperties {
  const computed = getComputedStyle(element);
  const theme: Record<string, string> = {};
  for (const name of THEME_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) theme[name] = value;
  }
  return theme as React.CSSProperties;
}

/** `?` button for a tool's toolbar; opens a short "what this page can do" dialog. */
export function HelpButton({ topic, className = "" }: { topic: HelpTopic; className?: string }) {
  const [theme, setTheme] = useState<React.CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setTheme(null);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => setTheme(readThemeVars(event.currentTarget))}
        className={`p-1.5 rounded-md shrink-0 ${className}`}
        style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
        title="Help"
        aria-label="Help: what this page can do"
        aria-haspopup="dialog"
        aria-expanded={theme !== null}
      >
        <CircleHelp className="w-4 h-4" />
      </button>
      {theme && createPortal(<HelpDialog topic={topic} theme={theme} onClose={close} />, document.body)}
    </>
  );
}

/** Esc closes; every other key stays inside the dialog so tool shortcuts behind it don't fire. */
function useDialogKeys(onClose: () => void, closeButtonRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, closeButtonRef]);
}

function HelpDialog({ topic, theme, onClose }: { topic: HelpTopic; theme: React.CSSProperties; onClose: () => void }) {
  const help = HELP[topic];
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogKeys(onClose, closeButtonRef);
  useEffect(() => panelRef.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={theme} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 max-md:p-4 shadow-2xl outline-none break-words"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id={titleId} className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {help.title}
          </h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="p-1 -m-1 rounded-md shrink-0" style={{ color: "var(--text-muted)" }} title="Close" aria-label="Close help">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {help.summary}
        </p>
        <HelpSection title="What you can do" items={help.canDo.map((feature) => feature.text)} />
        <HelpSection title="Quick start" items={help.steps} isNumbered />
        <HelpSection title="Tips" items={help.tips} />
      </div>
    </div>
  );
}

function HelpSection({ title, items, isNumbered = false }: { title: string; items: string[]; isNumbered?: boolean }) {
  const List = isNumbered ? "ol" : "ul";
  return (
    <section className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <List className="space-y-1.5">
        {items.map((item, index) => (
          <li key={item} className="flex gap-2 text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
            {isNumbered ? (
              <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: "var(--accent-glow, var(--bg-hover))", color: "var(--accent)" }}>
                {index + 1}
              </span>
            ) : (
              <span className="w-1.5 h-1.5 mt-[7px] shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
            )}
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </List>
    </section>
  );
}
