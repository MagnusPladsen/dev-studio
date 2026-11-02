"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HELP, type HelpTopic } from "@/lib/help-content";
import { storage } from "@/lib/storage";
import {
  areTutorialsOn,
  getSeenTutorials,
  markTutorialSeen,
  setProjectTutorials,
  shouldShowTutorial,
  tutorialTopicForPath,
} from "@/lib/tutorials";

const TUTORIAL_ATTRIBUTE = "data-tool-tutorial";
const OTHER_DIALOG_SELECTOR = `[aria-modal="true"]:not([${TUTORIAL_ATTRIBUTE}])`;
/** Gives first-visit dialogs that open on load (like the sign-in welcome) time to appear first. */
const SETTLE_DELAY_MS = 400;

/** True while any other modal dialog is on screen, and until the page has settled after loading. */
function useIsOtherDialogOpen(): boolean {
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => {
    const check = () => setIsOpen(document.querySelector(OTHER_DIALOG_SELECTOR) !== null);
    const observer = new MutationObserver(check);
    const timer = window.setTimeout(() => {
      check();
      observer.observe(document.body, { childList: true, subtree: true });
    }, SETTLE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  return isOpen;
}

/** Shows a tool's short tutorial the first time it's opened in a project that has tutorials turned on. */
export function ToolTutorial({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const isOtherDialogOpen = useIsOtherDialogOpen();
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const topic = tutorialTopicForPath(pathname, projectId);
  const isVisible = shouldShowTutorial({
    isEnabled: areTutorialsOn(storage.getById("projects", projectId)),
    topic,
    seen: getSeenTutorials(projectId),
    isOtherDialogOpen,
  });
  if (!isVisible || !topic) return null;

  function dismiss() {
    markTutorialSeen(projectId, topic!);
    rerender();
  }

  function turnOff() {
    markTutorialSeen(projectId, topic!);
    setProjectTutorials(projectId, false);
  }

  return <TutorialDialog key={topic} topic={topic} onDismiss={dismiss} onTurnOff={turnOff} />;
}

/** Esc dismisses and Tab cycles inside the panel; other keys stop here so tool shortcuts behind it don't fire. */
function useTutorialKeys(panelRef: React.RefObject<HTMLDivElement | null>, onDismiss: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") onDismiss();
      if (event.key === "Tab") trapTab(event, panelRef.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelRef, onDismiss]);
}

function trapTab(event: KeyboardEvent, panel: HTMLElement | null) {
  const buttons = Array.from(panel?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  if (buttons.length === 0) return;
  event.preventDefault();
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const step = event.shiftKey ? -1 : 1;
  buttons[(index + step + buttons.length) % buttons.length].focus();
}

/** Puts focus on the main button while open and hands it back to where it was on close. */
function useFocusOnOpen(buttonRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.();
  }, [buttonRef]);
}

function TutorialDialog({ topic, onDismiss, onTurnOff }: { topic: HelpTopic; onDismiss(): void; onTurnOff(): void }) {
  const help = HELP[topic];
  const titleId = useId();
  const summaryId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const gotItRef = useRef<HTMLButtonElement>(null);
  useTutorialKeys(panelRef, onDismiss);
  useFocusOnOpen(gotItRef);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        data-tool-tutorial=""
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 max-md:p-4 shadow-2xl break-words"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--accent)" }}>
          Quick tour
        </p>
        <h2 id={titleId} className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {help.title}
        </h2>
        <p id={summaryId} className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          {help.summary}
        </p>
        <FeatureList features={help.canDo} />
        <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
          See this again any time with the ? Help button.
        </p>
        <div className="flex justify-end gap-2 mt-4 max-md:flex-col-reverse">
          <button type="button" onClick={onTurnOff} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Turn off tutorials
          </button>
          <button ref={gotItRef} type="button" onClick={onDismiss} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)" }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureList({ features }: { features: (typeof HELP)[HelpTopic]["canDo"] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {features.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-3 text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
          <span className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-glow, var(--bg-hover))", color: "var(--accent)" }} aria-hidden>
            <Icon className="w-4 h-4" />
          </span>
          <span className="min-w-0 pt-1">{text}</span>
        </li>
      ))}
    </ul>
  );
}
