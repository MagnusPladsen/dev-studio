"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { isTextField, type History } from "@/hooks/useHistory";
import { findImporter, runImporterOnFiles, type ImportResult, type ImportStep, type Importer } from "@/lib/import";

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
  /**
   * An optional step between reading and applying, e.g. a dialog to match CSV columns. Resolve with the items to
   * import (changed or not), or null when the person cancels: nothing is imported and no message is shown.
   */
  review?(result: ImportResult<T>, importer: Importer<T>): Promise<ImportResult<T> | null>;
}

export interface ImportController {
  importers: Importer<unknown>[];
  isBusy: boolean;
  /** Imports with this importer, or the matching one for a dropped file. */
  importFile(file: File, importer?: Importer<unknown>): Promise<void>;
  /** Imports several files with one importer as one import (a multi-select, a folder, a drop). */
  importFiles(files: File[], importer: Importer<unknown>): Promise<void>;
}

const NO_HISTORY: History = { undo() {}, redo() {}, canUndo: false, canRedo: false, checkpoint() {} };

interface PendingStep {
  step: ImportStep;
  previousOpenId: string | null;
  isUndone: boolean;
}

/** Runs a tool's importers, reports the outcome in a toast, and makes the import one undo step. */
export function useImport<T>({ importers, noun, apply, review, history = NO_HISTORY, openId = null }: UseImportOptions<T>): ImportController & { history: History } {
  const { showToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<PendingStep | null>(null);

  const importFiles = useCallback(
    async (files: File[], chosen: Importer<unknown>) => {
      const importer = chosen as Importer<T>;
      setIsBusy(true);
      const outcome = await runImporterOnFiles(importer, files);
      setIsBusy(false);
      if (!outcome.ok) return showToast({ message: outcome.message, tone: "error" });
      const result = review ? await review(outcome.result, importer) : outcome.result;
      if (!result) return;
      history.checkpoint();
      const step = apply(result, importer);
      history.checkpoint();
      setPending(step ? { step, previousOpenId: openId, isUndone: false } : null);
      const count = result.items.length;
      showToast({ message: `Imported ${count} ${count === 1 ? noun[0] : noun[1]}`, details: result.warnings });
    },
    [noun, apply, review, history, openId, showToast]
  );

  const importFile = useCallback(
    async (file: File, chosen?: Importer<unknown>) => {
      const importer = chosen ?? ((await findImporter(importers, file)) as Importer<unknown> | null);
      if (!importer) return showToast({ message: `This tool can't import "${file.name}".`, tone: "error" });
      await importFiles([file], importer);
    },
    [importers, importFiles, showToast]
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
    importFiles,
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
