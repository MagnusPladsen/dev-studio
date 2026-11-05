"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { Play, Trash2, Shuffle, Dices, Volume2, Plus, Copy, Wand2 } from "lucide-react";
import { v4 as uuid } from "uuid";
import { storage } from "@/lib/storage";
import { useOpenParam, useTrackOpenAsset, useStorageVersion } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { VolumeControl } from "@/components/VolumeControl";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { useHistory } from "@/hooks/useHistory";
import { previewGain, usePreviewVolume } from "@/hooks/usePreviewVolume";
import { useAutosave } from "@/hooks/useAutosave";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu } from "@/components/ExportMenu";
import { ImportMenu } from "@/components/ImportMenu";
import { ImportDropZone } from "@/components/ImportDropZone";
import { useImport } from "@/hooks/useImport";
import { importAsNewAssets } from "@/lib/import";
import { SFX_IMPORTERS } from "@/lib/import/sfx";
import { downloadBlob } from "@/lib/download";
import { HelpButton } from "@/components/HelpButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { getAudioContext } from "@/lib/audio/context";
import { SAMPLE_RATE, SFX_VERSION, randomSeed, synthesize } from "@/lib/audio/sfx-synth";
import { NO_FINISH, finishUntrimmed, peakOf, readFinish, renderSound, untrimmed } from "@/lib/audio/sfx-finish";
import { encodeWav } from "@/lib/audio/wav";
import { SfxWaveform } from "@/components/sfx/SfxWaveform";
import { SfxFinishPanel } from "@/components/sfx/SfxFinishPanel";
import type { SoundEffect, SfxFinish, SfxParams } from "@/types";

const DEFAULT_PARAMS: SfxParams = {
  waveType: "square",
  frequency: 440,
  frequencySlide: 0,
  repeatSpeed: 0,
  sustainTime: 0.15,
  decayTime: 0.3,
  attackTime: 0.01,
  hpFilterCutoff: 0,
  lpFilterCutoff: 1,
  lpFilterResonance: 0,
  volume: 0.7,
  vibratoDepth: 0,
  vibratoSpeed: 0,
  version: SFX_VERSION,
};

const WAVE_TYPES: SfxParams["waveType"][] = ["square", "sawtooth", "sine", "triangle", "noise"];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PRESETS: Record<string, () => SfxParams> = {
  Pickup: () => ({
    ...DEFAULT_PARAMS,
    waveType: pick(["sine", "square"]),
    frequency: rand(500, 1200),
    frequencySlide: rand(0.1, 0.4),
    attackTime: 0,
    sustainTime: rand(0.05, 0.12),
    decayTime: rand(0.1, 0.3),
    volume: 0.6,
  }),
  Laser: () => ({
    ...DEFAULT_PARAMS,
    waveType: pick(["square", "sawtooth"]),
    frequency: rand(600, 1500),
    frequencySlide: rand(-0.5, -0.15),
    attackTime: 0,
    sustainTime: rand(0.05, 0.15),
    decayTime: rand(0.1, 0.25),
    volume: 0.5,
  }),
  Explosion: () => ({
    ...DEFAULT_PARAMS,
    waveType: "noise",
    frequency: rand(50, 200),
    frequencySlide: rand(-0.1, 0),
    attackTime: 0,
    sustainTime: rand(0.15, 0.35),
    decayTime: rand(0.3, 0.8),
    lpFilterCutoff: rand(0.2, 0.6),
    lpFilterResonance: rand(0, 0.3),
    volume: 0.8,
  }),
  Powerup: () => ({
    ...DEFAULT_PARAMS,
    waveType: pick(["square", "sawtooth"]),
    frequency: rand(300, 600),
    frequencySlide: rand(0.15, 0.5),
    attackTime: 0,
    sustainTime: rand(0.1, 0.2),
    decayTime: rand(0.2, 0.5),
    vibratoDepth: rand(0, 0.05),
    vibratoSpeed: rand(5, 15),
    repeatSpeed: rand(0.3, 0.6),
    volume: 0.6,
  }),
  Hit: () => ({
    ...DEFAULT_PARAMS,
    waveType: pick(["noise", "sawtooth"]),
    frequency: rand(100, 400),
    frequencySlide: rand(-0.3, -0.05),
    attackTime: 0,
    sustainTime: rand(0.02, 0.08),
    decayTime: rand(0.1, 0.3),
    hpFilterCutoff: rand(0, 0.2),
    volume: 0.7,
  }),
  Jump: () => ({
    ...DEFAULT_PARAMS,
    waveType: pick(["square", "sine"]),
    frequency: rand(200, 500),
    frequencySlide: rand(0.1, 0.35),
    attackTime: 0,
    sustainTime: rand(0.05, 0.15),
    decayTime: rand(0.1, 0.25),
    volume: 0.5,
  }),
  Blip: () => ({
    ...DEFAULT_PARAMS,
    waveType: pick(["sine", "square"]),
    frequency: rand(600, 1200),
    frequencySlide: 0,
    attackTime: 0,
    sustainTime: rand(0.03, 0.08),
    decayTime: rand(0.05, 0.12),
    volume: 0.4,
  }),
  Select: () => ({
    ...DEFAULT_PARAMS,
    waveType: "sine",
    frequency: rand(400, 800),
    frequencySlide: rand(0, 0.1),
    attackTime: 0,
    sustainTime: rand(0.04, 0.08),
    decayTime: rand(0.08, 0.15),
    volume: 0.35,
  }),
  Coin: () => ({
    ...DEFAULT_PARAMS,
    waveType: "square",
    frequency: rand(800, 1400),
    frequencySlide: rand(0.05, 0.2),
    attackTime: 0,
    sustainTime: rand(0.03, 0.07),
    decayTime: rand(0.1, 0.2),
    volume: 0.4,
  }),
};

let masterGain: GainNode | null = null;
let currentSource: AudioBufferSourceNode | null = null;

// Called from click handlers, so the context is created/resumed inside a user gesture.
function playBuffer(buffer: Float32Array) {
  if (buffer.length === 0) return;
  const audioCtx = getAudioContext();
  if (!masterGain) {
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
  }
  masterGain.gain.value = previewGain();
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // already stopped
    }
  }
  const audioBuffer = audioCtx.createBuffer(1, buffer.length, SAMPLE_RATE);
  audioBuffer.getChannelData(0).set(buffer);
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(masterGain);
  source.start();
  currentSource = source;
  source.onended = () => {
    if (currentSource === source) currentSource = null;
  };
}

const btnSecondary: React.CSSProperties = { background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" };

export default function SfxPage() {
  const volume = usePreviewVolume();
  useEffect(() => {
    if (masterGain) masterGain.gain.setTargetAtTime(previewGain(volume), masterGain.context.currentTime, 0.02);
  }, [volume]);
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const rootRef = useRef<HTMLDivElement>(null);
  const storeVersion = useStorageVersion();
  const [sfxParams, setSfxParams] = useState<SfxParams>({ ...DEFAULT_PARAMS });
  const [name, setName] = useState("New sound");
  // null = a draft that isn't in the project yet
  const [activeId, setActiveId] = useState<string | null>(null);
  // bumps when a different sound is opened, so undo history starts fresh
  const [historyKey, setHistoryKey] = useState(0);
  const history = useHistory(sfxParams, (p) => setSfxParams(p), historyKey);
  const imports = useImport<SoundEffect>({
    importers: SFX_IMPORTERS,
    noun: ["sound", "sounds"],
    history,
    openId: activeId,
    apply: ({ items }) => {
      autosave.flush();
      const draft = { name, params: sfxParams };
      return importAsNewAssets("sounds", projectId, items, {
        previousId: activeId,
        open: (sound) => loadSaved(sound, false),
        back: (previous) => (previous ? loadSaved(previous, false) : showDraft(draft.name, draft.params)),
      });
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const savedSounds = useMemo(() => storage.getAll("sounds", projectId), [projectId, storeVersion]);

  useOpenParam((id) => {
    const sound = storage.getById("sounds", id, projectId);
    if (sound) loadSaved(sound, false);
  });
  useTrackOpenAsset(activeId ? { type: "sound", id: activeId } : null);

  // the waveform always shows the current settings, not only after pressing Play
  const finish = useMemo(() => readFinish(sfxParams.finish), [sfxParams.finish]);
  const uncut = useMemo(() => untrimmed(synthesize(sfxParams), finish), [sfxParams, finish]);
  const finished = useMemo(() => finishUntrimmed(uncut, finish), [uncut, finish]);

  const draftValue = useMemo(
    () => (activeId ? { id: activeId, name, params: sfxParams } : null),
    [activeId, name, sfxParams]
  );
  const autosave = useAutosave(
    draftValue,
    (v) => {
      if (!v) return;
      const existing = storage.getById("sounds", v.id, projectId);
      if (!existing) return;
      storage.save(
        "sounds",
        { ...existing, name: v.name.trim() || "Untitled sound", params: { ...v.params }, updatedAt: new Date().toISOString() },
        projectId
      );
    },
    { resetKey: activeId ?? "draft", enabled: !!activeId }
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autosave.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave]);

  function playSound() {
    playBuffer(finished);
  }

  function updateFinish(next: SfxFinish | undefined) {
    setSfxParams((p) => ({ ...p, finish: next }));
  }

  function updateParam<K extends keyof SfxParams>(key: K, value: SfxParams[K]) {
    setSfxParams((p) => ({ ...p, [key]: value }));
  }

  /** Generators always start a fresh draft, so exploring never overwrites a saved sound. */
  function applyPreset(presetName: string) {
    const gen = PRESETS[presetName];
    if (!gen) return;
    const p = { ...gen(), seed: randomSeed() };
    setActiveId(null);
    setName(presetName);
    setSfxParams(p);
    playBuffer(renderSound(p));
  }

  function randomize() {
    applyPreset(pick(Object.keys(PRESETS)));
  }

  function mutate() {
    const p = { ...sfxParams };
    p.frequency = Math.max(20, p.frequency + rand(-100, 100));
    p.frequencySlide = Math.max(-1, Math.min(1, p.frequencySlide + rand(-0.1, 0.1)));
    p.sustainTime = Math.max(0.01, p.sustainTime + rand(-0.05, 0.05));
    p.decayTime = Math.max(0.01, p.decayTime + rand(-0.1, 0.1));
    p.lpFilterCutoff = Math.max(0, Math.min(1, p.lpFilterCutoff + rand(-0.1, 0.1)));
    p.vibratoDepth = Math.max(0, Math.min(1, p.vibratoDepth + rand(-0.02, 0.02)));
    setSfxParams(p);
    playBuffer(renderSound(p));
  }

  function createSound(soundName: string, p: SfxParams): SoundEffect {
    const now = new Date().toISOString();
    const sound: SoundEffect = { id: uuid(), projectId, name: soundName, params: { ...p }, tags: [], createdAt: now, updatedAt: now };
    storage.save("sounds", sound, projectId);
    return sound;
  }

  function keepDraft() {
    const sound = createSound(name.trim() || "Untitled sound", sfxParams);
    setActiveId(sound.id);
    setName(sound.name);
  }

  function newSound() {
    autosave.flush();
    const sound = createSound(`Untitled sound ${savedSounds.length + 1}`, DEFAULT_PARAMS);
    loadSaved(sound, false);
  }

  function duplicateSound() {
    autosave.flush();
    const sound = createSound(`${name.trim() || "Untitled sound"} copy`, sfxParams);
    loadSaved(sound, false);
  }

  function deleteSound(sound: SoundEffect) {
    if (!confirm(`Delete "${sound.name}"?`)) return;
    storage.delete("sounds", sound.id, projectId);
    if (activeId === sound.id) {
      setActiveId(null);
      setName("New sound");
    }
  }

  function loadSaved(sound: SoundEffect, play = true) {
    setActiveId(sound.id);
    setName(sound.name);
    setSfxParams({ ...sound.params });
    if (play) playBuffer(renderSound(sound.params));
    setHistoryKey((k) => k + 1);
  }

  function showDraft(draftName: string, draftParams: SfxParams) {
    setActiveId(null);
    setName(draftName);
    setSfxParams({ ...draftParams });
    setHistoryKey((k) => k + 1);
  }

  function exportJson() {
    const saved = activeId ? storage.getById("sounds", activeId, projectId) : undefined;
    const sound = { ...saved, name: name.trim() || "Untitled sound", params: sfxParams };
    downloadBlob(`${sound.name}.json`, new Blob([JSON.stringify(sound, null, 2)], { type: "application/json" }));
  }

  function exportWav() {
    downloadBlob(`${name.trim() || "sound"}.wav`, new Blob([encodeWav(finished, SAMPLE_RATE)], { type: "audio/wav" }));
  }

  const sliderStyle: React.CSSProperties = { width: "100%", accentColor: "var(--accent)", cursor: "pointer" };
  const labelStyle: React.CSSProperties = {
    color: "var(--text-secondary)",
    fontSize: "0.75rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2px",
  };

  const slider = (key: keyof SfxParams, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <div key={key}>
      <div style={labelStyle}>
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>{fmt(sfxParams[key] as number)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sfxParams[key] as number}
        onChange={(e) => updateParam(key, Number(e.target.value) as never)}
        style={sliderStyle}
        aria-label={label}
      />
    </div>
  );

  return (
    <div ref={rootRef} className="p-4 md:p-6 h-full overflow-auto" style={{ background: "var(--bg-primary)" }}>
      <ImportDropZone imports={imports} target={rootRef} />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <UndoRedoButtons history={imports.history} />
        <h1 className="text-xl font-bold max-md:hidden" style={{ color: "var(--text-primary)" }}>
          SFX Generator
        </h1>
        <div className="ml-auto flex items-center gap-3">
          {activeId ? (
            <SaveIndicator state={autosave.state} />
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Draft, not in your project yet
            </span>
          )}
          <HelpButton topic="sfx" />
          <ImportMenu imports={imports} note="WAV and MP3 can't be imported: a recording has no settings to edit." />
          <ExportMenu
            items={[
              { label: "WAV", description: "16-bit mono, 44.1 kHz", onClick: exportWav },
              { label: "Sound JSON", description: "The settings, to import again later", onClick: exportJson },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: sound + controls */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <SfxWaveform
              untrimmed={uncut}
              finished={finished}
              finish={finish}
              onTrim={(trimStart, trimEnd) => updateFinish({ ...finish, trimStart, trimEnd })}
              onTrimDone={history.checkpoint}
            />
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={playSound}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                <Play className="w-4 h-4" />
                Play
              </button>
              <button onClick={randomize} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={btnSecondary} title="Generate a random sound of any kind">
                <Shuffle className="w-4 h-4" />
                Random
              </button>
              <button onClick={mutate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={btnSecondary} title="Nudge the current sound a little">
                <Dices className="w-4 h-4" />
                Mutate
              </button>
              <div className="ml-auto">
                <VolumeControl />
              </div>
            </div>
          </div>

          {/* Generators */}
          <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-baseline gap-2 flex-wrap mb-2">
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                <Wand2 className="w-3.5 h-3.5" /> GENERATE
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Each click makes a new random variant. Keep the one you like.
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(PRESETS).map((presetName) => (
                <button
                  key={presetName}
                  onClick={() => applyPreset(presetName)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium"
                  style={btnSecondary}
                >
                  {presetName}
                </button>
              ))}
            </div>
          </div>

          <SfxFinishPanel
            finish={finish}
            lengthSeconds={uncut.length / SAMPLE_RATE}
            isClipping={peakOf(finished) > 1}
            isEdited={!!sfxParams.finish && JSON.stringify(finish) !== JSON.stringify(NO_FINISH)}
            onChange={updateFinish}
            onReset={() => updateFinish(undefined)}
          />

          {/* Parameters */}
          <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
              PARAMETERS
            </div>
            <div>
              <div style={labelStyle}>
                <span>Wave Type</span>
                <span style={{ color: "var(--accent)" }}>{sfxParams.waveType}</span>
              </div>
              <div className="flex gap-1">
                {WAVE_TYPES.map((wt) => (
                  <button
                    key={wt}
                    onClick={() => updateParam("waveType", wt)}
                    className="flex-1 min-w-0 py-1.5 rounded-md text-xs font-medium truncate"
                    style={{
                      background: sfxParams.waveType === wt ? "var(--accent)" : "var(--bg-hover)",
                      color: sfxParams.waveType === wt ? "white" : "var(--text-primary)",
                      border: `1px solid ${sfxParams.waveType === wt ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {wt}
                  </button>
                ))}
              </div>
            </div>
            {slider("frequency", "Frequency", 20, 2400, 1, (v) => `${v.toFixed(0)} Hz`)}
            {slider("frequencySlide", "Frequency Slide", -1, 1, 0.01, (v) => v.toFixed(2))}
            {slider("attackTime", "Attack Time", 0, 1, 0.001, (v) => `${v.toFixed(3)}s`)}
            {slider("sustainTime", "Sustain Time", 0.01, 1, 0.001, (v) => `${v.toFixed(3)}s`)}
            {slider("decayTime", "Decay Time", 0.01, 2, 0.001, (v) => `${v.toFixed(3)}s`)}
            {slider("vibratoDepth", "Vibrato Depth", 0, 1, 0.001, (v) => v.toFixed(3))}
            {slider("vibratoSpeed", "Vibrato Speed", 0, 50, 0.1, (v) => v.toFixed(1))}
            {slider("lpFilterCutoff", "LP Filter Cutoff", 0, 1, 0.01, (v) => v.toFixed(2))}
            {slider("lpFilterResonance", "LP Filter Resonance", 0, 1, 0.01, (v) => v.toFixed(2))}
            {slider("hpFilterCutoff", "HP Filter Cutoff", 0, 1, 0.01, (v) => v.toFixed(2))}
            {slider("volume", "Volume", 0, 1, 0.01, (v) => v.toFixed(2))}
            {slider("repeatSpeed", "Repeat Speed", 0, 1, 0.01, (v) => v.toFixed(2))}
          </div>
        </div>

        {/* Right: this sound + your sounds */}
        <div className="w-full lg:w-72 space-y-4">
          <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              <span>{activeId ? "THIS SOUND" : "DRAFT"}</span>
              <button
                onClick={newSound}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                title="Start a new sound in your project"
              >
                <Plus className="w-3 h-3" />
                New sound
              </button>
            </div>
            <label htmlFor="sfx-name" className="sr-only">
              Sound name
            </label>
            <input
              id="sfx-name"
              type="text"
              placeholder="Sound name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm mb-2 outline-none"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              onKeyDown={(e) => e.key === "Enter" && !activeId && keepDraft()}
            />
            {activeId ? (
              <button onClick={duplicateSound} className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded-lg text-xs" style={btnSecondary}>
                <Copy className="w-3.5 h-3.5" />
                Duplicate as a new sound
              </button>
            ) : (
              <>
                <button
                  onClick={keepDraft}
                  className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  <Plus className="w-4 h-4" />
                  Keep this sound
                </button>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                  Adds it to your project. After that every change saves by itself.
                </p>
              </>
            )}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <LinkedAssets projectId={projectId} type="sound" id={activeId} layout="panel" />
            </div>
          </div>

          <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                YOUR SOUNDS ({savedSounds.length})
              </span>
              <PasteButton type="sound" />
            </div>
            <ExamplesBar projectId={projectId} collections={["sounds"]} className="mb-2" />
            {savedSounds.length === 0 ? (
              <p {...pasteTriggerProps("sound")} className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                Generate a sound and press Keep, or add the examples.
              </p>
            ) : (
              <div {...pasteTriggerProps("sound")} className="space-y-1 max-h-96 overflow-y-auto">
                {savedSounds.map((sound) => (
                  <div
                    key={sound.id}
                    {...assetTriggerProps({ type: "sound", id: sound.id })}
                    {...rowButtonProps(() => assetTriggerProps({ type: "sound", id: sound.id }))}
                    className="group flex items-center justify-between p-2 rounded-lg cursor-pointer"
                    style={{ background: activeId === sound.id ? "var(--bg-hover)" : "transparent" }}
                    onClick={() => loadSaved(sound)}
                  >
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <Volume2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--tool-color, var(--yellow))" }} />
                      <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                        {sound.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playBuffer(renderSound(sound.params));
                        }}
                        className="p-1 rounded"
                        style={{ color: "var(--green)" }}
                        title={`Play ${sound.name}`}
                        aria-label={`Play ${sound.name}`}
                      >
                        <Play className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSound(sound);
                        }}
                        className="p-1 rounded"
                        style={{ color: "var(--red)" }}
                        title={`Delete ${sound.name}`}
                        aria-label={`Delete ${sound.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <AssetMenuButton asset={{ type: "sound", id: sound.id }} label={sound.name} />
                    </div>
                    <AssetPinButton asset={{ type: "sound", id: sound.id }} label={sound.name} className="ml-1" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
