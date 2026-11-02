"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Copy, Palette as PaletteIcon, Check, Paintbrush, Library } from "lucide-react";
import { storage } from "@/lib/storage";
import type { Palette } from "@/types";
import { v4 as uuid } from "uuid";
import { LinkedAssets } from "@/components/LinkedAssets";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { useHistory } from "@/hooks/useHistory";
import { useAutosave } from "@/hooks/useAutosave";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { ExportMenu } from "@/components/ExportMenu";
import { HelpButton } from "@/components/HelpButton";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";

const PRESET_PALETTES: { name: string; colors: string[] }[] = [
  {
    name: "Pico-8",
    colors: ["#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8", "#FF004D", "#FFA300", "#FFEC27", "#00E436", "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA"],
  },
  {
    name: "Game Boy",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  },
  {
    name: "NES",
    colors: ["#000000", "#fcfcfc", "#f8f8f8", "#bcbcbc", "#7c7c7c", "#a4e4fc", "#3cbcfc", "#0078f8", "#0000fc", "#b8b8f8", "#6888fc", "#0058f8", "#0000bc", "#d8b8f8", "#9878f8", "#6844fc"],
  },
  {
    name: "Endesga 16",
    colors: ["#e4a672", "#b86f50", "#743f39", "#3f2832", "#9e2835", "#e53b44", "#fb922b", "#ffe762", "#63c64d", "#327345", "#193d3f", "#4f6781", "#afbfd2", "#ffffff", "#2ce8f4", "#0484d1"],
  },
  {
    name: "Sweetie 16",
    colors: ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179", "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57"],
  },
];

const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };
const secondaryBtn = { color: "var(--text-primary)", border: "1px solid var(--border)" };

function safeName(name: string): string {
  return name.trim().replace(/[^\w-]+/g, "_") || "palette";
}

function download(text: string, filename: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="flex shrink-0">
      {colors.slice(0, 4).map((c, i) => (
        <div
          key={i}
          className="w-3 h-3 rounded-sm"
          style={{ background: c, marginLeft: i ? -2 : 0, boxShadow: "0 0 0 1px var(--border)" }}
        />
      ))}
    </div>
  );
}

export default function PalettesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();

  const version = useStorageVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palettes = useMemo(() => storage.getAll("palettes", projectId), [projectId, version]);
  const [selected, setSelected] = useState<Palette | null>(null);
  const [newColor, setNewColor] = useState("#7c5cfc");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  // phones only: the palette list is a panel you can open and close
  const [mobileList, setMobileList] = useState(true);

  const history = useHistory(
    selected,
    (p) => {
      if (!p || !storage.getById("palettes", p.id, projectId)) return;
      storage.save("palettes", p, projectId);
      setSelected(p);
    },
    selected?.id
  );

  const persist = useCallback(
    (p: Palette | null) => {
      if (!p || !storage.getById("palettes", p.id, projectId)) return; // deleted meanwhile
      storage.save("palettes", { ...p, updatedAt: new Date().toISOString() } as Palette, projectId);
    },
    [projectId]
  );
  const autosave = useAutosave(selected, persist, { resetKey: selected?.id, enabled: !!selected, delay: 400 });
  const flushSave = autosave.flush;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

  useOpenParam((id) => {
    const p = storage.getById("palettes", id, projectId);
    if (p) select(p);
  });
  useTrackOpenAsset(selected?.id ? { type: "palette", id: selected?.id } : null);

  function select(p: Palette) {
    setSelected(p);
    setMobileList(false);
  }

  const defaultName = () => `Palette ${palettes.length + 1}`;

  function openNewForm() {
    setNewName(defaultName());
    setShowNew(true);
    setMobileList(true);
  }

  function createPalette(name?: string, colors?: string[]) {
    const now = new Date().toISOString();
    const p: Palette = {
      id: uuid(),
      projectId,
      name: name || newName.trim() || defaultName(),
      colors: colors || ["#000000", "#ffffff"],
      createdAt: now,
    };
    storage.save("palettes", p, projectId);
    select(p);
    setShowNew(false);
    setNewName("");
  }

  function update(changes: Partial<Palette>) {
    if (!selected) return;
    setSelected({ ...selected, ...changes });
  }

  function addColor() {
    if (!selected) return;
    update({ colors: [...selected.colors, newColor] });
  }

  function removeColor(i: number) {
    if (!selected) return;
    update({ colors: selected.colors.filter((_, idx) => idx !== i) });
  }

  function deletePalette(p: Palette) {
    if (!confirm(`Delete the palette "${p.name}"?`)) return;
    storage.delete("palettes", p.id, projectId);
    if (selected?.id === p.id) setSelected(null);
  }

  function copyColor(hex: string) {
    navigator.clipboard?.writeText(hex).catch(() => {});
    setCopied(hex);
    setTimeout(() => setCopied(null), 1500);
  }

  function exportText() {
    if (!selected) return;
    download(selected.colors.join("\n") + "\n", `${safeName(selected.name)}.txt`);
  }

  function exportGpl() {
    if (!selected) return;
    const lines = [
      "GIMP Palette",
      `Name: ${selected.name}`,
      "Columns: 8",
      "#",
      ...selected.colors.map((c) => {
        const [r, g, b] = hexToRgb(c);
        return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${c.toUpperCase()}`;
      }),
    ];
    download(lines.join("\n") + "\n", `${safeName(selected.name)}.gpl`);
  }

  return (
    <div className="flex max-md:flex-col h-full max-md:h-auto max-md:min-h-full" style={{ background: "var(--bg-primary)" }}>
      {/* Phones: toggle for the palette list */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
        <button
          onClick={() => setMobileList((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
          style={{ ...secondaryBtn, background: mobileList ? "var(--bg-hover)" : "transparent" }}
          aria-expanded={mobileList}
        >
          <Library className="w-3.5 h-3.5" />
          Palettes & presets
        </button>
        <HelpButton topic="palettes" className="ml-auto" />
      </div>

      {/* Sidebar */}
      <div
        className={`w-60 max-md:w-full shrink-0 border-r max-md:border-r-0 max-md:border-b flex-col overflow-y-auto max-md:max-h-[55vh] ${
          mobileList ? "flex" : "max-md:hidden flex"
        }`}
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Palettes
            </span>
            <div className="flex items-center gap-1">
              <HelpButton topic="palettes" className="max-md:hidden" />
              <PasteButton type="palette" />
              <button onClick={openNewForm} className="p-1 rounded" style={{ color: "var(--accent)" }} title="New palette" aria-label="New palette">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {showNew && (
            <div className="mb-2 space-y-1.5">
              <input
                placeholder="Palette name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-2 py-1 rounded text-xs outline-none"
                style={inputStyle}
                aria-label="Palette name"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createPalette()}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => createPalette()}
                  className="flex-1 px-2 py-1 rounded text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Create
                </button>
                <button onClick={() => setShowNew(false)} className="px-2 py-1 rounded text-xs" style={secondaryBtn}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div {...pasteTriggerProps("palette")} className="space-y-0.5">
            {palettes.map((p) => (
              <div
                key={p.id}
                {...assetTriggerProps({ type: "palette", id: p.id })}
                {...rowButtonProps(() => assetTriggerProps({ type: "palette", id: p.id }))}
                className="group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer"
                style={{
                  background: selected?.id === p.id ? "var(--bg-hover)" : "transparent",
                  color: "var(--text-primary)",
                }}
                onClick={() => select(p)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Swatches colors={p.colors} />
                  <span className="truncate">{p.name}</span>
                </div>
                <div className="flex items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePalette(p); }}
                    className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                    style={{ color: "var(--red)" }}
                    title={`Delete ${p.name}`}
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <AssetPinButton asset={{ type: "palette", id: p.id }} label={p.name} />
                  <AssetMenuButton asset={{ type: "palette", id: p.id }} label={p.name} />
                </div>
              </div>
            ))}
          </div>
          <ExamplesBar projectId={projectId} collections={["palettes"]} className="mt-3" />
        </div>

        {/* Presets */}
        <div className="p-3">
          <span className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
            Preset Palettes
          </span>
          <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
            Click one to add a copy you can edit.
          </p>
          <div className="space-y-1">
            {PRESET_PALETTES.map((preset) => (
              <button
                key={preset.name}
                onClick={() => createPalette(preset.name, [...preset.colors])}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-primary)" }}
                title={`Add a copy of ${preset.name}`}
              >
                <Swatches colors={preset.colors} />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-auto p-6 max-md:p-4">
        {selected ? (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <UndoRedoButtons history={history} />
                <input
                  value={selected.name}
                  onChange={(e) => update({ name: e.target.value })}
                  onBlur={(e) => !e.target.value.trim() && update({ name: defaultName() })}
                  className="text-lg font-semibold bg-transparent outline-none min-w-0 rounded px-1 -ml-1 hover:bg-[var(--bg-hover)] focus:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-primary)" }}
                  aria-label="Palette name"
                  title="Rename palette"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SaveIndicator state={autosave.state} />
                <Link
                  href={`/project/${projectId}/pixel-art?palette=${encodeURIComponent(selected.id)}`}
                  onClick={() => flushSave()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                  title="Open Pixel Art with this palette"
                >
                  <Paintbrush className="w-3.5 h-3.5" />
                  Use in Pixel Art
                </Link>
                <ExportMenu
                  items={[
                    { label: "Text (.txt hex list)", description: "One hex colour per line", onClick: exportText },
                    { label: "GIMP palette (.gpl)", description: "Works in GIMP, Aseprite, Krita and Inkscape", onClick: exportGpl },
                  ]}
                />
              </div>
            </div>

            {/* Color grid */}
            <div className="grid grid-cols-4 sm:grid-cols-8 md:max-lg:grid-cols-4 gap-2 mb-6">
              {selected.colors.map((color, i) => (
                <div key={i} className="group relative">
                  <button
                    className="w-full aspect-square rounded-lg border-2 transition-all"
                    style={{
                      background: color,
                      borderColor: "var(--border)",
                    }}
                    onClick={() => copyColor(color)}
                    title={`Copy ${color}`}
                    aria-label={`Copy ${color}`}
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {copied === color ? (
                      <Check className="w-4 h-4 text-white drop-shadow-md" />
                    ) : (
                      <Copy className="w-4 h-4 text-white drop-shadow-md" />
                    )}
                  </div>
                  <button
                    onClick={() => removeColor(i)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"
                    style={{ background: "var(--red)", color: "white" }}
                    title={`Remove ${color}`}
                    aria-label={`Remove ${color}`}
                  >
                    &times;
                  </button>
                  <p className="text-center text-xs mt-1 font-mono truncate" style={{ color: "var(--text-muted)" }}>
                    {color}
                  </p>
                </div>
              ))}
            </div>

            {/* Add color */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-10 h-10 rounded border-none cursor-pointer"
                style={{ background: "transparent" }}
                aria-label="Pick a colour"
              />
              <input
                type="text"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addColor()}
                className="w-28 px-2 py-1.5 rounded text-sm font-mono outline-none"
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                aria-label="Colour hex code"
              />
              <button
                onClick={addColor}
                className="px-3 py-1.5 rounded text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Add Color
              </button>
            </div>

            <div className="mt-8 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <LinkedAssets projectId={projectId} type="palette" id={selected.id} layout="panel" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center max-md:py-12" style={{ color: "var(--text-muted)" }}>
            <PaletteIcon className="w-12 h-12 mb-3" />
            <p style={{ color: "var(--text-secondary)" }}>Keep your game&apos;s colours in one place.</p>
            <p className="text-xs mt-1 mb-4">Pick a palette on the left, start from a preset, or make your own.</p>
            <button
              onClick={() => createPalette(defaultName())}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <Plus className="w-4 h-4" />
              New palette
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
