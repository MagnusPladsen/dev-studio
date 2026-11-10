"use client";

import { useSyncExternalStore, type ReactNode } from "react";

export interface PolicyLanguageTab {
  id: string;
  label: string;
  lang: string;
  content: ReactNode;
}

const LANGUAGE_CHANGE_EVENT = "policy-language-change";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  };
}

function prefersNorwegian() {
  return /^(nb|nn|no)\b/i.test(navigator.language);
}

/** Shows one language at a time: the `#id` in the URL wins, else the browser's language, else the first tab. */
export function PolicyLanguageTabs({ tabs }: { tabs: PolicyLanguageTab[] }) {
  const fallbackId = tabs[0].id;
  const activeId = useSyncExternalStore(
    subscribe,
    () => {
      const hashId = window.location.hash.slice(1);
      if (tabs.some((tab) => tab.id === hashId)) return hashId;
      return prefersNorwegian() && tabs.some((tab) => tab.id === "no") ? "no" : fallbackId;
    },
    () => fallbackId
  );

  const selectTab = (id: string) => {
    history.replaceState(null, "", `#${id}`);
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  };

  return (
    <>
      <div role="tablist" aria-label="Language · Språk" className="flex w-fit rounded-lg p-0.5 mb-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)" }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              lang={tab.lang}
              aria-selected={isActive}
              aria-controls={tab.id}
              onClick={() => selectTab(tab.id)}
              className="px-4 py-1.5 rounded-md font-medium"
              style={isActive ? { background: "var(--accent)", color: "var(--on-accent, white)" } : { color: "var(--text-primary)" }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={tab.id} role="tabpanel" aria-labelledby={`tab-${tab.id}`} lang={tab.lang} hidden={tab.id !== activeId}>
          {tab.content}
        </div>
      ))}
    </>
  );
}
