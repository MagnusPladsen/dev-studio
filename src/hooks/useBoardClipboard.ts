import { useEffect, useRef } from "react";
import { isTextField } from "@/hooks/useHistory";
import { parseCards, type CopiedCards } from "@/lib/diagrams/clipboard";
import { imageFilesFrom } from "@/lib/diagrams/image-file";

export interface BoardClipboardHandlers {
  /** The selection as clipboard text, or null when nothing is selected. */
  copySelection(): string | null;
  deleteSelection(): void;
  pasteCards(cards: CopiedCards): void;
  pasteImages(files: File[]): void;
  pasteText(text: string): void;
}

/**
 * Copy and cut put the selected cards on the system clipboard as marked JSON, so they paste into any board;
 * paste adds those cards, or an image, a link or text, straight onto the open board.
 */
export function useBoardClipboard(isActive: boolean, handlers: BoardClipboardHandlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!isActive) return;
    const onCopy = (e: ClipboardEvent) => {
      if (isTextField(document.activeElement)) return;
      if (!(window.getSelection()?.isCollapsed ?? true)) return;
      const text = latest.current.copySelection();
      if (text === null) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", text);
      if (e.type === "cut") latest.current.deleteSelection();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTextField(e.target) || isTextField(document.activeElement)) return;
      const files = imageFilesFrom(e.clipboardData);
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const cards = parseCards(text);
      if (cards) {
        e.preventDefault();
        return latest.current.pasteCards(cards);
      }
      if (!files.length && !text.trim()) return;
      e.preventDefault();
      if (files.length) latest.current.pasteImages(files);
      else latest.current.pasteText(text);
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, [isActive]);
}
