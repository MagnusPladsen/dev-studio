"use client";

import { Box, Image as ImageIcon, Plus } from "lucide-react";
import { BlenderCard } from "./BlenderCard";

interface Props {
  hasModels: boolean;
  onNew(): void;
  onFromSprite(): void;
}

/** Shown when no model is open: start a model, or turn a sprite into one. */
export function VoxelEmptyState({ hasModels, onNew, onFromSprite }: Props): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-6 max-md:p-4">
      <div className="max-w-md w-full text-center">
        <Box className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--accent)" }} />
        <p style={{ color: "var(--text-secondary)" }}>Pixel art with depth: stack coloured cubes into 3D props and characters.</p>
        <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
          {hasModels ? "Pick a model from your list, or start a new one." : "Start an empty 16×16×16 model, or stand one of your sprites up in 3D."}
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
          >
            <Plus className="w-4 h-4" />
            New model
          </button>
          <button
            onClick={onFromSprite}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            <ImageIcon className="w-4 h-4" />
            From sprite
          </button>
        </div>
        <BlenderCard />
      </div>
    </div>
  );
}
