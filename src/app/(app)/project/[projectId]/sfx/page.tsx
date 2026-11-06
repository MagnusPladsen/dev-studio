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
import { isTextField, useHistory } from "@/hooks/useHistory";
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
import { keepLocked, mutateParams, type SfxGroupId } from "@/lib/audio/sfx-explore";
import { DEFAULT_WAV_FORMAT, describeWavFormat, safeFileName, soundToWav, soundsToZip, type WavFormat } from "@/lib/audio/sfx-export";
import { SfxWaveform } from "@/components/sfx/SfxWaveform";
import { SfxFinishPanel } from "@/components/sfx/SfxFinishPanel";
import { SfxParameterGroups } from "@/components/sfx/SfxParameterGroups";
import { MAX_DRAFTS, SfxDraftsStrip, type SfxDraft } from "@/components/sfx/SfxDraftsStrip";
import { SfxWavFormatPicker } from "@/components/sfx/SfxWavFormatPicker";
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

const VARIATION_COUNT = 5;
/** Play on change waits until a slider rests this long, so dragging doesn't restart the sound on every step. */
const PLAY_ON_CHANGE_DELAY_MS = 150;

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

/** Space activates these natively, so it only plays the sound when focus is elsewhere. */
function isSpaceTarget(target: EventTarget | null): boolean {
  if (isTextField(target)) return true;
  return target instanceof Element && !!target.closest("button, a, select, summary, input[type=checkbox], input[type=radio], [role=button], [role=menuitem]");
}

const zipBlob = (zip: Uint8Array<ArrayBuffer>) => new Blob([zip], { type: "application/zip" });

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
  const [locked, setLocked] = useState<ReadonlySet<SfxGroupId>>(new Set());
  const [drafts, setDrafts] = useState<SfxDraft[]>([]);
  const [wavFormat, setWavFormat] = useState<WavFormat>(DEFAULT_WAV_FORMAT);
  const [isPlayOnChange, setIsPlayOnChange] = useState(true);
  // set by a settings change, so the effect below plays the result once it's rendered
  const playAfterChange = useRef(false);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isSpaceTarget(e.target)) return;
      e.preventDefault();
      playBuffer(finished);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished]);

  useEffect(() => {
    if (!playAfterChange.current) return;
    playAfterChange.current = false;
    const timer = setTimeout(() => playBuffer(finished), PLAY_ON_CHANGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  function playSound() {
    playBuffer(finished);
  }

  function markChanged() {
    if (!isPlayOnChange) return;
    // creating the audio context inside the input event lets the delayed play start on every browser
    getAudioContext();
    playAfterChange.current = true;
  }

  function updateFinish(next: SfxFinish | undefined) {
    markChanged();
    setSfxParams((p) => ({ ...p, finish: next }));
  }

  function updateParam<K extends keyof SfxParams>(key: K, value: SfxParams[K]) {
    markChanged();
    setSfxParams((p) => ({ ...p, [key]: value }));
  }

  function toggleLock(id: SfxGroupId) {
    setLocked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function rememberDraft(label: string, p: SfxParams) {
    setDrafts((current) => [{ id: uuid(), label, params: p }, ...current].slice(0, MAX_DRAFTS));
  }

  /** Each explore step is its own undo step, however fast the clicks come. */
  function exploreTo(label: string, p: SfxParams) {
    history.checkpoint();
    setSfxParams(p);
    rememberDraft(label, p);
    playBuffer(renderSound(p));
  }

  /** Generators always start a fresh draft, so exploring never overwrites a saved sound. */
  function applyPreset(presetName: string, p: SfxParams = { ...PRESETS[presetName](), seed: randomSeed() }) {
    setActiveId(null);
    setName(presetName);
    exploreTo(presetName, p);
  }

  function randomize() {
    const presetName = pick(Object.keys(PRESETS));
    applyPreset(presetName, keepLocked({ ...PRESETS[presetName](), seed: randomSeed() }, sfxParams, locked));
  }

  function mutate() {
    exploreTo("Mutate", mutateParams(sfxParams, locked));
  }

  function restoreDraft(draft: SfxDraft) {
    history.checkpoint();
    setSfxParams(draft.params);
    playBuffer(renderSound(draft.params));
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
    downloadBlob(`${safeFileName(name.trim())}.wav`, new Blob([soundToWav(sfxParams, wavFormat)], { type: "audio/wav" }));
  }

  function exportVariations() {
    const base = safeFileName(name.trim());
    const variations = Array.from({ length: VARIATION_COUNT }, (_, i) => ({
      name: `${base} variation ${i + 1}`,
      params: mutateParams(sfxParams, locked),
    }));
    downloadBlob(`${base} variations.zip`, zipBlob(soundsToZip(variations, wavFormat)));
  }

  function exportAllSounds() {
    const projectName = storage.getById("projects", projectId)?.name ?? "";
    downloadBlob(`${safeFileName(projectName, "project")} sounds.zip`, zipBlob(soundsToZip(savedSounds, wavFormat)));
  }

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
            options={<SfxWavFormatPicker format={wavFormat} onChange={setWavFormat} />}
            items={[
              { label: "WAV", description: describeWavFormat(wavFormat), onClick: exportWav },
              {
                label: `${VARIATION_COUNT} variations (zip)`,
                description: "Mutated copies of this sound; locked groups stay the same",
                onClick: exportVariations,
              },
              {
                label: "All sounds (zip)",
                description: savedSounds.length ? `The ${savedSounds.length} sounds in this project, one WAV each` : "Keep a sound first",
                onClick: exportAllSounds,
                disabled: savedSounds.length === 0,
              },
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
                <kbd className="text-[10px] opacity-75 font-normal max-md:hidden">Space</kbd>
              </button>
              <button onClick={randomize} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={btnSecondary} title="Generate a random sound of any kind; locked groups stay the same">
                <Shuffle className="w-4 h-4" />
                Random
              </button>
              <button onClick={mutate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={btnSecondary} title="Nudge every unlocked setting a little">
                <Dices className="w-4 h-4" />
                Mutate
              </button>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={isPlayOnChange} onChange={(e) => setIsPlayOnChange(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                Play on change
              </label>
              <div className="ml-auto">
                <VolumeControl />
              </div>
            </div>
            <SfxDraftsStrip drafts={drafts} current={sfxParams} onRestore={restoreDraft} />
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

          <SfxParameterGroups params={sfxParams} locked={locked} onToggleLock={toggleLock} onChange={updateParam} />
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
