"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { MENU_MARGIN, nextEnabledIndex, positionMenu, positionSubmenu } from "@/lib/menu-position";
import type { MenuPlacement, Point, Size } from "@/lib/menu-position";

export type ContextMenuEntry =
  | {
      kind: "item";
      key: string;
      label: string;
      onSelect?: () => void;
      disabled?: boolean;
      hint?: string;
      /** The keyboard shortcut for the same action, shown at the right, e.g. "⌘D". */
      shortcut?: string;
      danger?: boolean;
      submenu?: ContextMenuEntry[];
    }
  | { kind: "separator"; key: string };

type MenuItem = Extract<ContextMenuEntry, { kind: "item" }>;

const BACK_KEY = "__back";
const DRILL_IN_QUERY = "(max-width: 767px)";

const noopSubscribe = (): (() => void) => () => {};

function subscribeToDrillIn(onChange: () => void): () => void {
  const query = window.matchMedia(DRILL_IN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usesDrillIn(): boolean {
  return window.matchMedia(DRILL_IN_QUERY).matches;
}

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

function applyPlacement(element: HTMLElement, placement: MenuPlacement): void {
  element.style.left = `${placement.left}px`;
  element.style.top = `${placement.top}px`;
  element.style.maxHeight = `${placement.maxHeight}px`;
}

interface MenuPanelProps {
  entries: ContextMenuEntry[];
  label: string;
  place: (size: Size) => MenuPlacement;
  isDrillIn: boolean;
  autoFocus: boolean;
  onCloseAll: () => void;
  onExit?: () => void;
}

function MenuPanel({ entries, label, place, isDrillIn, autoFocus, onCloseAll, onExit }: MenuPanelProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [isOpenedByKeyboard, setIsOpenedByKeyboard] = useState(false);
  const hasMounted = useRef(false);

  const drilled = drillKey ? entries.find((entry) => entry.key === drillKey) : undefined;
  const drilledItems = drilled?.kind === "item" ? (drilled.submenu ?? []) : [];
  const visible: ContextMenuEntry[] = drilled
    ? [{ kind: "item", key: BACK_KEY, label: "‹ Back" }, ...drilledItems]
    : entries;
  const disabledFlags = visible.map((entry) => entry.kind === "separator" || Boolean(entry.disabled));

  const focusIndex = useCallback((index: number): void => {
    if (index >= 0) itemRefs.current[index]?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    applyPlacement(panel, place({ width: panel.offsetWidth, height: panel.offsetHeight }));
  }, [place, visible.length]);

  useEffect(() => {
    const isFirstRun = !hasMounted.current;
    hasMounted.current = true;
    if (isFirstRun && !autoFocus) return;
    focusIndex(nextEnabledIndex(disabledFlags, -1, "ArrowDown"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only when the visible list changes
  }, [drillKey, focusIndex, autoFocus]);

  const activate = (entry: MenuItem, isKeyboard = false): void => {
    if (entry.disabled) return;
    if (entry.key === BACK_KEY) return setDrillKey(null);
    if (entry.submenu) {
      if (isDrillIn) return setDrillKey(entry.key);
      setIsOpenedByKeyboard(isKeyboard);
      return setOpenKey(entry.key);
    }
    onCloseAll();
    entry.onSelect?.();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault();
      return focusIndex(nextEnabledIndex(disabledFlags, current, key));
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      const entry = visible[current];
      return entry?.kind === "item" ? activate(entry, true) : undefined;
    }
    if (key === "ArrowRight") {
      const entry = visible[current];
      if (entry?.kind === "item" && entry.submenu) activate(entry, true);
      return;
    }
    if (key === "ArrowLeft" || key === "Escape") {
      event.preventDefault();
      if (drillKey) return setDrillKey(null);
      return onExit ? onExit() : key === "Escape" ? onCloseAll() : undefined;
    }
    if (key === "Tab") onCloseAll();
  };

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="fixed z-[200] min-w-48 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg p-1 shadow-xl"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      {visible.map((entry, index) =>
        entry.kind === "separator" ? (
          <div key={entry.key} role="separator" className="my-1 h-px" style={{ background: "var(--border)" }} />
        ) : (
          <div key={entry.key}>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              aria-disabled={entry.disabled || undefined}
              aria-haspopup={entry.submenu ? "menu" : undefined}
              aria-expanded={entry.submenu && !isDrillIn ? openKey === entry.key : undefined}
              onClick={() => activate(entry)}
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;
                focusIndex(index);
                setIsOpenedByKeyboard(false);
                setOpenKey(entry.submenu && !entry.disabled ? entry.key : null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] focus:bg-[var(--bg-hover)] focus-visible:outline-none max-md:py-2.5"
              style={{ color: entry.danger ? "var(--red)" : "var(--text-primary)", opacity: entry.disabled ? 0.5 : 1 }}
            >
              <span className="min-w-0 flex-1">
                <span className="block">{entry.label}</span>
                {entry.disabled && entry.hint && (
                  <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {entry.hint}
                  </span>
                )}
              </span>
              {entry.shortcut && (
                <kbd className="shrink-0 pl-4 font-sans text-[11px] max-md:hidden" style={{ color: "var(--text-muted)" }}>
                  {entry.shortcut}
                </kbd>
              )}
              {entry.submenu && <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
            </button>
            {!isDrillIn && entry.submenu && openKey === entry.key && (
              <SubmenuPanel
                entries={entry.submenu}
                label={entry.label}
                autoFocus={isOpenedByKeyboard}
                getAnchor={() => itemRefs.current[index] ?? null}
                onCloseAll={onCloseAll}
                onExit={() => {
                  setOpenKey(null);
                  focusIndex(index);
                }}
              />
            )}
          </div>
        ),
      )}
    </div>
  );
}

interface SubmenuPanelProps {
  entries: ContextMenuEntry[];
  label: string;
  getAnchor: () => HTMLElement | null;
  autoFocus: boolean;
  onCloseAll: () => void;
  onExit: () => void;
}

function SubmenuPanel({ entries, label, getAnchor, autoFocus, onCloseAll, onExit }: SubmenuPanelProps): ReactNode {
  const place = useCallback(
    (size: Size): MenuPlacement => {
      const rect = getAnchor()?.getBoundingClientRect() ?? { left: MENU_MARGIN, right: MENU_MARGIN, top: MENU_MARGIN };
      return positionSubmenu(rect, size, viewportSize());
    },
    [getAnchor],
  );
  return <MenuPanel entries={entries} label={label} place={place} isDrillIn={false} autoFocus={autoFocus} onCloseAll={onCloseAll} onExit={onExit} />;
}

interface ContextMenuProps {
  anchor: Point;
  entries: ContextMenuEntry[];
  label: string;
  onClose: () => void;
}

/** Right-click / long-press / keyboard menu, portalled to `document.body` so it sits above every tool tint. */
export function ContextMenu({ anchor, entries, label, onClose }: ContextMenuProps): React.JSX.Element | null {
  const isMounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isDrillIn = useSyncExternalStore(subscribeToDrillIn, usesDrillIn, () => false);
  const rootRef = useRef<HTMLDivElement>(null);
  const place = useCallback((size: Size): MenuPlacement => positionMenu(anchor, size, viewportSize()), [anchor]);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnScroll = (event: Event): void => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  if (!isMounted) return null;
  return createPortal(
    <div ref={rootRef} className="contents">
      <MenuPanel entries={entries} label={label} place={place} isDrillIn={isDrillIn} autoFocus onCloseAll={onClose} />
    </div>,
    document.body,
  );
}
