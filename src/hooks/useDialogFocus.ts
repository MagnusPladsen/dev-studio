import { useEffect } from "react";

/** Esc dismisses and Tab cycles inside the panel; other keys stop here so tool shortcuts behind it don't fire. */
export function useDialogKeys(panelRef: React.RefObject<HTMLDivElement | null>, onDismiss: () => void) {
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
  const controls = Array.from(panel?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled):not([type=radio]), input[type=radio]:checked:not(:disabled)") ?? []);
  if (controls.length === 0) return;
  event.preventDefault();
  const index = controls.indexOf(document.activeElement as HTMLElement);
  const step = event.shiftKey ? -1 : 1;
  controls[(index + step + controls.length) % controls.length].focus();
}

/** Puts focus on the main button while open and hands it back to where it was on close. */
export function useFocusOnOpen(buttonRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.();
  }, [buttonRef]);
}
