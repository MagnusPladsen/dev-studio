"use client";

import { SlidersHorizontal, X } from "lucide-react";
import {
  applyPreset,
  channelPreset,
  CLASSIC_PRESET,
  CUSTOM_PRESET,
  editSound,
  editWave,
  INSTRUMENT_PRESETS,
  STARTING_ENVELOPE,
  STARTING_VIBRATO,
  WAVES,
} from "@/lib/audio/music-instruments";
import type { MusicChannel, MusicEnvelope, MusicVibrato } from "@/types";

const GROUPS = ["Tones", "Drums"] as const;

const ms = (seconds: number) => (seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(2)} s`);
const percent = (level: number) => `${Math.round(level * 100)}%`;

/** The preset list, grouped, with Custom shown once the sound was edited by hand. */
export function PresetSelect({ channel, onChange, className, style }: {
  channel: MusicChannel;
  onChange: (next: MusicChannel) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const current = channelPreset(channel);
  return (
    <select
      value={current}
      onChange={(e) => onChange(applyPreset(channel, e.target.value))}
      onClick={(e) => e.stopPropagation()}
      className={className}
      style={style}
      aria-label={`${channel.name} instrument`}
      title="Instrument preset"
    >
      {current === CUSTOM_PRESET && <option value={CUSTOM_PRESET}>Custom</option>}
      {GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {INSTRUMENT_PRESETS.filter((p) => p.group === group).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function SoundSlider({ label, value, min, max, step, format, onStart, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onStart: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>
      <span className="flex justify-between mb-0.5">
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--accent)" }}
      />
    </label>
  );
}

/**
 * The open channel's sound: preset, wave, ADSR envelope and vibrato. `onStartEdit` runs before each pick
 * and slider drag, so each is one undo step.
 */
export function InstrumentPanel({ channel, color, onChange, onStartEdit, onClose }: {
  channel: MusicChannel;
  color: string;
  onChange: (next: MusicChannel) => void;
  onStartEdit: () => void;
  onClose: () => void;
}) {
  const envelope = channel.envelope ?? STARTING_ENVELOPE;
  const vibrato = channel.vibrato ?? STARTING_VIBRATO;
  const isNoise = channel.instrument === "noise";
  const setEnvelope = <K extends keyof MusicEnvelope>(key: K, value: number) => onChange(editSound(channel, { envelope: { ...envelope, [key]: value } }));
  const setVibrato = <K extends keyof MusicVibrato>(key: K, value: number) => onChange(editSound(channel, { vibrato: { ...vibrato, [key]: value } }));
  const selectStyle = { color: "var(--text-primary)", border: "1px solid var(--border)", background: "var(--bg-primary)" };

  return (
    <div className="px-4 max-md:px-2 py-2 border-b shrink-0 space-y-2" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          <SlidersHorizontal className="w-3.5 h-3.5" style={{ color }} /> {channel.name.toUpperCase()} INSTRUMENT
        </span>
        <PresetSelect channel={channel} onChange={(next) => { onStartEdit(); onChange(next); }} className="text-xs rounded px-1 py-0.5 outline-none" style={selectStyle} />
        <select
          value={channel.instrument}
          onChange={(e) => { onStartEdit(); onChange(editWave(channel, e.target.value)); }}
          className="text-xs rounded px-1 py-0.5 outline-none"
          style={selectStyle}
          aria-label="Wave"
          title="Wave"
        >
          {WAVES.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-1 rounded"
          style={{ color: "var(--text-primary)" }}
          title="Close instrument editor"
          aria-label="Close instrument editor"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {channelPreset(channel) === CLASSIC_PRESET && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Classic starts every note at full volume and fades it out over its length. Pick a preset or move a slider to shape it yourself.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
        <SoundSlider label="Attack" value={envelope.attack} min={0} max={1} step={0.005} format={ms} onStart={onStartEdit} onChange={(v) => setEnvelope("attack", v)} />
        <SoundSlider label="Decay" value={envelope.decay} min={0} max={2} step={0.01} format={ms} onStart={onStartEdit} onChange={(v) => setEnvelope("decay", v)} />
        <SoundSlider label="Sustain" value={envelope.sustain} min={0} max={1} step={0.05} format={percent} onStart={onStartEdit} onChange={(v) => setEnvelope("sustain", v)} />
        <SoundSlider label="Release" value={envelope.release} min={0} max={2} step={0.01} format={ms} onStart={onStartEdit} onChange={(v) => setEnvelope("release", v)} />
      </div>
      {!isNoise && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
          <SoundSlider label="Vibrato" value={vibrato.depth} min={0} max={100} step={1} format={(v) => (v === 0 ? "Off" : `${v} cents`)} onStart={onStartEdit} onChange={(v) => setVibrato("depth", v)} />
          <SoundSlider label="Vibrato speed" value={vibrato.rate} min={1} max={12} step={0.5} format={(v) => `${v} Hz`} onStart={onStartEdit} onChange={(v) => setVibrato("rate", v)} />
          <SoundSlider label="Vibrato delay" value={vibrato.delay} min={0} max={1} step={0.05} format={ms} onStart={onStartEdit} onChange={(v) => setVibrato("delay", v)} />
        </div>
      )}
    </div>
  );
}
