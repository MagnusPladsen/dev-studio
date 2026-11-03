"use client";

import { useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useAutosave, type SaveState } from "@/hooks/useAutosave";
import { useHistory, type History } from "@/hooks/useHistory";
import { storage } from "@/lib/storage";
import { decodeVoxels, encodeVoxels } from "@/lib/voxels/codec";
import type { Vec3, VoxelGrid } from "@/lib/voxels/grid";
import { sanitizeColors, sanitizeSize } from "@/lib/voxels/stored-model";
import { renderThumbnail } from "@/lib/voxels/thumbnail";
import type { VoxelModel } from "@/types";

export const DEFAULT_MODEL_NAME = "Untitled model";

export interface VoxelDoc {
  name: string;
  grid: VoxelGrid;
  colors: string[];
  paletteId?: string;
}

interface HistorySnapshot {
  voxels: string;
  size: Vec3;
  colors: string[];
  paletteId?: string;
}

export interface VoxelDocument {
  activeModelId: string | null;
  doc: VoxelDoc | null;
  history: History;
  saveState: SaveState;
  flush(): void;
  openModel(model: VoxelModel): void;
  /** Shows no model, e.g. after undoing the import of the only one. */
  closeModel(): void;
  createModel(doc: VoxelDoc): VoxelModel;
  deleteModel(id: string): void;
  updateDoc(patch: Partial<VoxelDoc>): void;
}

function gridLength(size: Vec3): number {
  return size[0] * size[1] * size[2];
}

function modelToDoc(model: VoxelModel): VoxelDoc {
  const size = sanitizeSize(model.size);
  const grid = { size, data: decodeVoxels(model.voxels, gridLength(size)) };
  return { name: model.name, grid, colors: sanitizeColors(model.colors), paletteId: model.paletteId };
}

function docFields(doc: VoxelDoc): Pick<VoxelModel, "name" | "size" | "voxels" | "colors" | "paletteId" | "thumbnail"> {
  return {
    name: doc.name.trim() || DEFAULT_MODEL_NAME,
    size: [...doc.grid.size],
    voxels: encodeVoxels(doc.grid.data),
    colors: doc.colors,
    paletteId: doc.paletteId,
    thumbnail: renderThumbnail(doc.grid, doc.colors) || undefined,
  };
}

/** The open model: loading, creating, deleting, undo history and autosave. */
export function useVoxelDocument(projectId: string): VoxelDocument {
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [doc, setDoc] = useState<VoxelDoc | null>(null);
  const deletedRef = useRef(new Set<string>());

  const grid = doc?.grid;
  const colors = doc?.colors;
  const paletteId = doc?.paletteId;
  const snapshot = useMemo<HistorySnapshot | null>(
    () => (grid && colors ? { voxels: encodeVoxels(grid.data), size: grid.size, colors, paletteId } : null),
    [grid, colors, paletteId]
  );
  const history = useHistory(
    snapshot,
    (previous) => {
      if (!previous) return;
      const restored = { size: previous.size, data: decodeVoxels(previous.voxels, gridLength(previous.size)) };
      setDoc((current) => current && { ...current, grid: restored, colors: previous.colors, paletteId: previous.paletteId });
    },
    activeModelId,
    { burstMs: 0 }
  );

  const saved = useMemo(() => (doc && activeModelId ? { id: activeModelId, doc } : null), [doc, activeModelId]);
  function persist(value: { id: string; doc: VoxelDoc } | null): void {
    if (!value || deletedRef.current.has(value.id)) return;
    const existing = storage.getById("models", value.id, projectId);
    if (!existing) return;
    const model: VoxelModel = { ...existing, ...docFields(value.doc), updatedAt: new Date().toISOString() };
    // once you edit an example it becomes your own work, so "Remove examples" leaves it alone
    delete model.example;
    storage.save("models", model, projectId);
  }
  const { state: saveState, flush } = useAutosave(saved, persist, { resetKey: activeModelId, enabled: !!doc });

  function openModel(model: VoxelModel): void {
    setActiveModelId(model.id);
    setDoc(modelToDoc(model));
  }

  function closeModel(): void {
    setActiveModelId(null);
    setDoc(null);
  }

  function createModel(initial: VoxelDoc): VoxelModel {
    const now = new Date().toISOString();
    const model: VoxelModel = { id: uuid(), projectId, ...docFields(initial), tags: [], createdAt: now, updatedAt: now };
    storage.save("models", model, projectId);
    openModel(model);
    return model;
  }

  function deleteModel(id: string): void {
    deletedRef.current.add(id);
    storage.delete("models", id, projectId);
    if (activeModelId === id) closeModel();
  }

  function updateDoc(patch: Partial<VoxelDoc>): void {
    setDoc((current) => current && { ...current, ...patch });
  }

  return { activeModelId, doc, history, saveState, flush, openModel, closeModel, createModel, deleteModel, updateDoc };
}
