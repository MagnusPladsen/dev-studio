"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { isTextField, type History } from "@/hooks/useHistory";
import { findImporter, runImporter, type ImportResult, type ImportStep, type Importer } from "@/lib/import";

export interface UseImportOptions<T> {
  importers: Importer<T>[];
  /** For the success message, e.g. ["canvas", "canvases"]. */
  noun: [singular: string, plural: string];
  /**
   * Puts the items into the tool and opens or selects the first one. Return an `ImportStep` when the items became
   * new assets; return nothing when they went into the open document, where `history` already records the change.
   */
  apply(result: ImportResult<T>, importer: Importer<T>): ImportStep | void;
  /** The tool's history. The returned `history` adds the import as one more undo step. */
  history?: History;
  /** What the tool has open now (an asset id, or null for its list). */
  openId?: string | null;
}

export interface ImportController {
  importers: Importer<unknown>[];
  isBusy: boolean;
  /** Imports with this importer, or the matching one for a dropped file. */
  importFile(file: File, importer?: Importer<unknown>): Promise<void>;
}

const NO_HISTORY: History = { undo() {}, redo() {}, canUndo: false, canRedo: false, checkpoint() {} };

interface PendingStep {
  step: ImportStep;
  previousOpenId: string | null;
  isUndone: boolean;
}

/** Runs a tool's importers, reports the outcome in a toast, and makes the import one undo step. */
export function useImport<T>({ importers, noun, apply, history = NO_HISTORY, openId = null }: UseImportOptions<T>): ImportController & { history: History } {
  const { showToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<PendingStep | null>(null);

  const importFile = useCallback(
    async (file: File, chosen?: Importer<unknown>) => {
      const importer = (chosen as Importer<T> | undefined) ?? (await findImporter(importers, file));
      if (!importer) return showToast({ message: `This tool can't import "${file.name}".`, tone: "error" });
      setIsBusy(true);
      const outcome = await runImporter(importer, file);
      setIsBusy(false);
      if (!outcome.ok) return showToast({ message: outcome.message, tone: "error" });
      history.checkpoint();
      const step = apply(outcome.result, importer);
      history.checkpoint();
      setPending(step ? { step, previousOpenId: openId, isUndone: false } : null);
      const count = outcome.result.items.length;
      showToast({ message: `Imported ${count} ${count === 1 ? noun[0] : noun[1]}`, details: outcome.result.warnings });
    },
    [importers, noun, apply, history, openId, showToast]
  );

  const canUndoImport = Boolean(pending && !pending.isUndone && openId === pending.step.openedId);
  const canRedoImport = Boolean(pending && pending.isUndone && openId === pending.previousOpenId);
  const undoImport = useCallback(() => {
    if (!pending) return;
    pending.step.undo();
    setPending({ ...pending, isUndone: true });
  }, [pending]);
  const redoImport = useCallback(() => {
    if (!pending) return;
    pending.step.redo();
    setPending({ ...pending, isUndone: false });
  }, [pending]);

  const undo = history.canUndo || !canUndoImport ? history.undo : undoImport;
  const redo = history.canRedo || !canRedoImport ? history.redo : redoImport;
  useImportShortcuts(!history.canUndo && canUndoImport ? undoImport : null, !history.canRedo && canRedoImport ? redoImport : null);

  return {
    importers: importers as Importer<unknown>[],
    isBusy,
    importFile,
    history: { ...history, undo, redo, canUndo: history.canUndo || canUndoImport, canRedo: history.canRedo || canRedoImport },
  };
}

/** Ctrl/⌘+Z for the import step, caught before `useHistory`'s own listener (which has nothing left to undo). */
function useImportShortcuts(undo: (() => void) | null, redo: (() => void) | null) {
  useEffect(() => {
    if (!undo && !redo) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      const action = key === "z" && !e.shiftKey ? undo : (key === "z" && e.shiftKey) || (key === "y" && !e.metaKey) ? redo : null;
      if (!action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      action();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [undo, redo]);
}
