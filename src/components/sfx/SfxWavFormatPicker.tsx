"use client";

import { WAV_BIT_DEPTHS, WAV_SAMPLE_RATES, type WavFormat } from "@/lib/audio/sfx-export";

const selectStyle: React.CSSProperties = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

/** Sample rate and bit depth for every WAV the export menu makes; sits at the top of that menu. */
export function SfxWavFormatPicker({ format, onChange }: { format: WavFormat; onChange: (format: WavFormat) => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-2 mb-1 border-b" style={{ borderColor: "var(--border)" }}>
      <span className="text-[11px] mr-auto whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
        WAV format
      </span>
      <select
        aria-label="WAV sample rate"
        value={format.sampleRate}
        onChange={(e) => onChange({ ...format, sampleRate: Number(e.target.value) as WavFormat["sampleRate"] })}
        className="text-xs rounded px-1 py-0.5"
        style={selectStyle}
      >
        {WAV_SAMPLE_RATES.map((rate) => (
          <option key={rate} value={rate}>
            {rate / 1000} kHz
          </option>
        ))}
      </select>
      <select
        aria-label="WAV bit depth"
        value={format.bitDepth}
        onChange={(e) => onChange({ ...format, bitDepth: Number(e.target.value) as WavFormat["bitDepth"] })}
        className="text-xs rounded px-1 py-0.5"
        style={selectStyle}
      >
        {WAV_BIT_DEPTHS.map((depth) => (
          <option key={depth} value={depth}>
            {depth}-bit
          </option>
        ))}
      </select>
    </div>
  );
}
