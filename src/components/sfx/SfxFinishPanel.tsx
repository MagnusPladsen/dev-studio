"use client";

import { RotateCcw, Scissors } from "lucide-react";
import { MIN_KEPT } from "@/lib/audio/sfx-finish";
import type { SfxFinish } from "@/types";

const labelStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "0.75rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "2px",
};
const sliderStyle: React.CSSProperties = { width: "100%", accentColor: "var(--accent)", cursor: "pointer" };

const ms = (seconds: number) => `${Math.round(seconds * 1000)} ms`;
const signed = (value: number, unit: string) => `${value > 0 ? "+" : ""}${value}${unit}`;

function FinishSlider({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div style={labelStyle}>
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={sliderStyle} aria-label={label} />
    </div>
  );
}

function Toggle({ label, title, on, onChange }: { label: string; title: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={title}
      className="flex-1 py-1.5 rounded-md text-xs font-medium"
      style={{
        background: on ? "var(--accent)" : "var(--bg-hover)",
        color: on ? "var(--on-accent, white)" : "var(--text-primary)",
        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {label}
    </button>
  );
}

/**
 * Editing after the synth: trim, fades, level, pitch and reverse, so a sound doesn't need an audio editor.
 * `lengthSeconds` is the sound before trimming, to show the trims in milliseconds.
 */
export function SfxFinishPanel({ finish, lengthSeconds, isClipping, isEdited, onChange, onReset }: {
  finish: SfxFinish;
  lengthSeconds: number;
  isClipping: boolean;
  isEdited: boolean;
  onChange: (finish: SfxFinish) => void;
  onReset: () => void;
}) {
  const set = <K extends keyof SfxFinish>(key: K, value: SfxFinish[K]) => onChange({ ...finish, [key]: value });
  const maxTrim = (other: number) => Math.max(0, 1 - MIN_KEPT - other);

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          <Scissors className="w-3.5 h-3.5" /> FINISH
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Trim, fade and level the sound here. Drag the handles on the waveform to trim.
        </span>
        {isEdited && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            title="Remove all finishing"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <FinishSlider label="Trim start" value={finish.trimStart} min={0} max={maxTrim(finish.trimEnd)} step={0.001} format={(v) => ms(v * lengthSeconds)} onChange={(v) => set("trimStart", v)} />
        <FinishSlider label="Trim end" value={finish.trimEnd} min={0} max={maxTrim(finish.trimStart)} step={0.001} format={(v) => ms(v * lengthSeconds)} onChange={(v) => set("trimEnd", v)} />
        <FinishSlider label="Fade in" value={finish.fadeIn} min={0} max={1} step={0.005} format={ms} onChange={(v) => set("fadeIn", v)} />
        <FinishSlider label="Fade out" value={finish.fadeOut} min={0} max={1} step={0.005} format={ms} onChange={(v) => set("fadeOut", v)} />
        <FinishSlider label="Pitch & speed" value={finish.pitch} min={-12} max={12} step={1} format={(v) => signed(v, " semitones")} onChange={(v) => set("pitch", v)} />
        <FinishSlider label="Gain" value={finish.gainDb} min={-24} max={12} step={0.5} format={(v) => signed(v, " dB")} onChange={(v) => set("gainDb", v)} />
      </div>
      <div className="flex gap-2">
        <Toggle label="Normalize" title="Make the loudest point -1 dB, so every sound is equally loud" on={finish.normalize} onChange={(v) => set("normalize", v)} />
        <Toggle label="Reverse" title="Play the sound backwards" on={finish.reverse} onChange={(v) => set("reverse", v)} />
      </div>
      {isClipping && (
        <p className="text-xs" role="status" style={{ color: "var(--red)" }}>
          Too loud: the peaks will clip. Lower the gain or turn on Normalize.
        </p>
      )}
    </div>
  );
}
