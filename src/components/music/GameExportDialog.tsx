"use client";

import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogKeys, useFocusOnOpen } from "@/hooks/useDialogFocus";
import { downloadBlob } from "@/lib/download";
import {
  buildGameExport,
  hasIntro,
  introSeconds,
  readGameExportOptions,
  type ExportFile,
  type GameExportMode,
  type GameExportOptions,
} from "@/lib/audio/music-game-export";
import type { MusicTrack } from "@/types";

const OPTIONS_KEY = "music.gameExport";
const LOOP_COUNTS = [1, 2, 3, 4] as const;
const FADE_LENGTHS = [2, 5, 10] as const;
const MIME_TYPES: Record<string, string> = { ogg: "audio/ogg", wav: "audio/wav", zip: "application/zip" };

const MODE_LABELS: Record<GameExportMode, string> = {
  loop: "Looping game music",
  "intro-and-loop": "Intro and loop as two files",
  "fade-out": "Song with fade-out",
};

const rowLabel = "w-20 shrink-0 text-xs font-medium max-md:w-full";

function readSavedOptions(): GameExportOptions {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OPTIONS_KEY);
  } catch {
    // Storage blocked: start from the defaults.
  }
  return readGameExportOptions(raw);
}

/** Two files need an intro: without one, the remembered choice is shown and exported as looping music but kept for other songs. */
function effectiveOptions(requested: GameExportOptions, track: MusicTrack): GameExportOptions {
  return requested.mode === "intro-and-loop" && !hasIntro(track) ? { ...requested, mode: "loop" } : requested;
}

function saveOptions(options: GameExportOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Storage blocked: the choices are forgotten next time.
  }
}

function modeExplainer(mode: GameExportMode, track: MusicTrack): string {
  if (mode === "intro-and-loop") return "For Unity and Phaser: play the intro once, then loop the second file.";
  if (mode === "fade-out") return "For credits, trailers and videos.";
  if (!hasIntro(track)) return "Loops from the start.";
  return `Set the loop start to ${introSeconds(track).toFixed(2)} s in your engine. Godot reads it from the WAV by itself.`;
}

function downloadExport(file: ExportFile) {
  const extension = file.name.slice(file.name.lastIndexOf(".") + 1);
  downloadBlob(file.name, new Blob([file.bytes.slice()], { type: MIME_TYPES[extension] }));
}

function Choice({ checked, onChange, type = "radio", name, disabled, children }: { checked: boolean; onChange(checked: boolean): void; type?: "checkbox" | "radio"; name?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex items-start gap-2 text-xs py-1 ${disabled ? "opacity-50" : "cursor-pointer"}`} style={{ color: "var(--text-primary)" }}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" style={{ accentColor: "var(--accent)" }} />
      <span>{children}</span>
    </label>
  );
}

function NumberSelect<T extends number>({ label, value, values, unit, disabled, onChange }: { label: string; value: T; values: readonly T[]; unit?: string; disabled: boolean; onChange(value: T): void }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? "opacity-50" : ""}`} style={{ color: "var(--text-primary)" }}>
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) as T)}
        className="px-2 py-1 rounded-md text-xs"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {unit ? `${option} ${unit}` : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModeChoices({ track, options, update }: { track: MusicTrack; options: GameExportOptions; update(change: Partial<GameExportOptions>): void }) {
  const canSplit = hasIntro(track);
  return (
    <div className="flex gap-4 max-md:flex-col max-md:gap-1">
      <span className={rowLabel} style={{ color: "var(--text-muted)" }}>What for?</span>
      <div className="min-w-0">
        {(Object.keys(MODE_LABELS) as GameExportMode[]).map((mode) => {
          const isDisabled = mode === "intro-and-loop" && !canSplit;
          return (
            <Choice key={mode} name="game-export-mode" checked={options.mode === mode} disabled={isDisabled} onChange={() => update({ mode })}>
              {MODE_LABELS[mode]}
              {isDisabled && <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>This song has no intro.</span>}
            </Choice>
          );
        })}
        <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }} aria-live="polite">
          {modeExplainer(options.mode, track)}
        </p>
      </div>
    </div>
  );
}

function FadeChoices({ options, update }: { options: GameExportOptions; update(change: Partial<GameExportOptions>): void }) {
  const isDisabled = options.mode !== "fade-out";
  return (
    <div className="flex gap-4 max-md:flex-col max-md:gap-1">
      <span className={rowLabel} style={{ color: "var(--text-muted)" }}>Fade-out</span>
      <div className="flex flex-wrap gap-4">
        <NumberSelect label="Loops" value={options.loops} values={LOOP_COUNTS} disabled={isDisabled} onChange={(loops) => update({ loops })} />
        <NumberSelect label="Fade" value={options.fadeSeconds} values={FADE_LENGTHS} unit="s" disabled={isDisabled} onChange={(fadeSeconds) => update({ fadeSeconds })} />
      </div>
    </div>
  );
}

function FormatChoices({ options, update }: { options: GameExportOptions; update(change: Partial<GameExportOptions>): void }) {
  return (
    <div className="flex gap-4 max-md:flex-col max-md:gap-1">
      <span className={rowLabel} style={{ color: "var(--text-muted)" }}>Format</span>
      <div className="min-w-0">
        <Choice name="game-export-format" checked={options.format === "ogg"} onChange={() => update({ format: "ogg" })}>OGG — small, Godot&apos;s default</Choice>
        <Choice name="game-export-format" checked={options.format === "wav"} onChange={() => update({ format: "wav" })}>WAV — biggest, exact</Choice>
      </div>
    </div>
  );
}

function useGameExport(track: MusicTrack, options: GameExportOptions, onDone: () => void) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runExport() {
    setIsExporting(true);
    setError(null);
    try {
      downloadExport(await buildGameExport(track, options));
      onDone();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "The export failed. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return { isExporting, error, runExport };
}

/** Music's "Export for game…": a file that loops cleanly in an engine, two files, or a fade-out version, in OGG or WAV. */
export function GameExportDialog({ track, onClose }: { track: MusicTrack; onClose(): void }): React.JSX.Element {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const [requested, setRequested] = useState(readSavedOptions);
  const options = effectiveOptions(requested, track);
  const { isExporting, error, runExport } = useGameExport(track, options, onClose);
  const dismiss = useCallback(() => {
    if (!isExporting) onClose();
  }, [isExporting, onClose]);
  useDialogKeys(panelRef, dismiss);
  useFocusOnOpen(exportRef);

  function update(change: Partial<GameExportOptions>) {
    const next = { ...requested, ...change };
    setRequested(next);
    saveOptions(next);
  }

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 max-md:p-0 max-md:items-end bg-black/60 backdrop-blur-sm" onClick={dismiss}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg max-h-[calc(100dvh-2rem)] max-md:max-w-none max-md:max-h-[100dvh] max-md:rounded-b-none flex flex-col rounded-2xl shadow-2xl break-words"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-6 pb-0 max-md:p-4 max-md:pb-0">
          <h2 id={titleId} className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Export for game
          </h2>
          <button type="button" onClick={onClose} disabled={isExporting} className="shrink-0 p-1 rounded disabled:opacity-50" style={{ color: "var(--text-muted)" }} title="Close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 max-md:px-4 py-4 space-y-4">
          <ModeChoices track={track} options={options} update={update} />
          <FadeChoices options={options} update={update} />
          <FormatChoices options={options} update={update} />
          <div>
            <Choice type="checkbox" checked={options.stems} onChange={(stems) => update({ stems })}>One file per channel (stems, as a ZIP)</Choice>
            <Choice type="checkbox" checked={options.normalise} onChange={(normalise) => update({ normalise })}>Make it as loud as it can be without clipping</Choice>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Every channel is included; mute and solo are ignored.</p>
          </div>
          {error && (
            <p className="text-xs" role="alert" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 p-6 pt-0 max-md:p-4 max-md:pt-0 max-md:flex-col max-md:items-stretch">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Free to use in any project, no watermark.</p>
          <div className="flex justify-end gap-2 shrink-0">
            <button type="button" onClick={onClose} disabled={isExporting} className="px-4 py-2 rounded-lg text-sm disabled:opacity-50 max-md:flex-1" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              Cancel
            </button>
            <button
              ref={exportRef}
              type="button"
              onClick={() => void runExport()}
              disabled={isExporting}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 max-md:flex-1"
              style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}
            >
              {isExporting ? "Exporting…" : "Export"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
