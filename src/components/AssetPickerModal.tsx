"use client";

import { Plus } from "lucide-react";
import type { AssetRef, AssetType } from "@/types";
import { AssetPickerList } from "./AssetPickerList";

interface AssetPickerModalProps {
  projectId: string;
  title: string;
  /** Only these kinds are offered; every kind when left out. */
  types?: AssetType[];
  exclude: AssetRef[];
  /** Assets left out altogether, their elements included. */
  hiddenIds?: string[];
  /** Picking a canvas offers the whole canvas or one of its elements. */
  allowElements?: boolean;
  createLabel?: string;
  onCreate?(): void;
  onPick(ref: AssetRef): void;
  onClose(): void;
}

/** Searchable asset list in a modal, grouped by kind like the LinkedAssets picker. */
export function AssetPickerModal({
  projectId,
  title,
  types,
  exclude,
  hiddenIds,
  allowElements,
  createLabel,
  onCreate,
  onPick,
  onClose,
}: AssetPickerModalProps): React.JSX.Element {
  const createButton = onCreate && createLabel && (
    <button
      type="button"
      onClick={onCreate}
      className="w-full flex items-center gap-2 px-2 py-1 mb-1 rounded text-xs text-left hover:bg-[var(--bg-hover)] max-md:py-2"
      style={{ color: "var(--text-primary)" }}
    >
      <Plus className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
      {createLabel}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-black/50 px-4 pt-[15vh]"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onClose();
        }}
        className="w-80 max-w-full max-h-[70vh] flex flex-col rounded-lg shadow-xl p-2"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs font-medium px-2 pt-1 pb-2" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
        <AssetPickerList
          projectId={projectId}
          types={types}
          exclude={exclude}
          hiddenIds={hiddenIds}
          allowElements={allowElements}
          header={createButton}
          onPick={onPick}
        />
      </div>
    </div>
  );
}
