"use client";

import { Lock, LockOpen } from "lucide-react";
import { SFX_GROUPS, WAVE_TYPES, type SfxGroup, type SfxGroupId, type SfxNumberKey } from "@/lib/audio/sfx-explore";
import type { SfxParams } from "@/types";

const labelStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "0.75rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "2px",
};
const sliderStyle: React.CSSProperties = { width: "100%", accentColor: "var(--accent)", cursor: "pointer" };

interface Props {
  params: SfxParams;
  locked: ReadonlySet<SfxGroupId>;
  onToggleLock: (id: SfxGroupId) => void;
  onChange: <K extends keyof SfxParams>(key: K, value: SfxParams[K]) => void;
}

function LockButton({ group, isLocked, onToggle }: { group: SfxGroup; isLocked: boolean; onToggle: () => void }) {
  const label = isLocked ? `Unlock ${group.label}` : `Lock ${group.label}`;
  const Icon = isLocked ? Lock : LockOpen;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isLocked}
      aria-label={label}
      title={isLocked ? `${group.label} is locked: Random and Mutate leave it as it is` : `Lock ${group.label} so Random and Mutate leave it as it is`}
      className="p-1 rounded"
      style={{ color: isLocked ? "var(--accent)" : "var(--text-muted)", border: `1px solid ${isLocked ? "var(--accent)" : "transparent"}` }}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function WaveButtons({ params, onChange }: Pick<Props, "params" | "onChange">) {
  return (
    <div>
      <div style={labelStyle}>
        <span>Wave Type</span>
        <span style={{ color: "var(--accent)" }}>{params.waveType}</span>
      </div>
      <div className="flex gap-1">
        {WAVE_TYPES.map((wave) => (
          <button
            key={wave}
            onClick={() => onChange("waveType", wave)}
            className="flex-1 min-w-0 py-1.5 rounded-md text-xs font-medium truncate"
            style={{
              background: params.waveType === wave ? "var(--accent)" : "var(--bg-hover)",
              color: params.waveType === wave ? "white" : "var(--text-primary)",
              border: `1px solid ${params.waveType === wave ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {wave}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The synth settings in groups, each with a lock that Random and Mutate respect. */
export function SfxParameterGroups({ params, locked, onToggleLock, onChange }: Props) {
  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          PARAMETERS
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Lock a group to keep it when you press Random or Mutate.
        </span>
      </div>
      {SFX_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3" aria-label={group.label}>
          <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {group.label}
            </span>
            <LockButton group={group} isLocked={locked.has(group.id)} onToggle={() => onToggleLock(group.id)} />
          </div>
          {group.id === "wave" && <WaveButtons params={params} onChange={onChange} />}
          {group.sliders.map((slider) => (
            <div key={slider.key}>
              <div style={labelStyle}>
                <span>{slider.label}</span>
                <span style={{ color: "var(--text-muted)" }}>{slider.format(params[slider.key])}</span>
              </div>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={params[slider.key]}
                onChange={(e) => onChange<SfxNumberKey>(slider.key, Number(e.target.value))}
                style={sliderStyle}
                aria-label={slider.label}
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
