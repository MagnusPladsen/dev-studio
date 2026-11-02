"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Play,
  Square,
  Repeat,
  ListMusic,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { useOpenParam, useTrackOpenAsset } from "@/hooks/useStorage";
import { LinkedAssets } from "@/components/LinkedAssets";
import { VolumeControl } from "@/components/VolumeControl";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { useHistory } from "@/hooks/useHistory";
import { previewGain, usePreviewVolume } from "@/hooks/usePreviewVolume";
import { useAutosave } from "@/hooks/useAutosave";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ExportMenu } from "@/components/ExportMenu";
import { HelpButton } from "@/components/HelpButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { getAudioContext } from "@/lib/audio/context";
import { midiToFreq, scheduleNote } from "@/lib/audio/music-synth";
import { beatAt, scheduleWindow, type LiveSong, type PlayCursor } from "@/lib/audio/music-scheduler";
import type { MusicTrack, MusicChannel, MusicNote } from "@/types";
import { v4 as uuid } from "uuid";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

// C3 (48) to C6 (84) – 37 notes
const MIN_MIDI = 48;
const MAX_MIDI = 84;
const PITCH_COUNT = MAX_MIDI - MIN_MIDI + 1;

const CHANNEL_COLORS = [
  "var(--accent)",  // melody
  "var(--green)",   // harmony
  "#60a5fa",        // bass
  "#fbbf24",        // drums
];

const INSTRUMENTS: { label: string; value: OscillatorType | "noise" }[] = [
  { label: "Square", value: "square" },
  { label: "Sawtooth", value: "sawtooth" },
  { label: "Sine", value: "sine" },
  { label: "Triangle", value: "triangle" },
  { label: "Noise", value: "noise" },
];

function defaultChannel(name: string, instrument: string, color: number): MusicChannel {
  return {
    id: uuid(),
    name,
    instrument,
    volume: 0.5,
    patterns: [{ id: uuid(), notes: [] }],
  };
}

function createEmptyTrack(projectId: string): MusicTrack {
  return {
    id: uuid(),
    projectId,
    name: "Untitled track",
    bpm: 120,
    channels: [
      defaultChannel("Melody", "square", 0),
      defaultChannel("Harmony", "triangle", 1),
      defaultChannel("Bass", "sawtooth", 2),
      defaultChannel("Drums", "noise", 3),
    ],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const BASE_BEAT_W = 40;
const BASE_ROW_H = 12;
const ZOOM_X = { min: 0.5, max: 4 };
const ZOOM_Y = { min: 0.75, max: 3 };
const ZOOM_KEY = "gds-music-zoom";
const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v));
const NOTE_LENGTHS = [
  { value: 0.25, label: "¼ beat" },
  { value: 0.5, label: "½ beat" },
  { value: 1, label: "1 beat" },
  { value: 2, label: "2 beats" },
  { value: 4, label: "4 beats" },
];
const PATTERN_LENGTHS = [8, 16, 32];
/** How far ahead notes are handed to the audio clock; edits land after at most this long. */
const LOOKAHEAD_SECONDS = 0.2;

/** Shortest loop length that shows every note in the track. */
function fitPatternLength(track: MusicTrack): number {
  const end = Math.max(0, ...track.channels.flatMap((c) => c.patterns[0]?.notes.map((n) => n.start + n.duration) ?? []));
  return PATTERN_LENGTHS.find((l) => l >= end - 1e-6) ?? 32;
}

export default function MusicPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();

  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<MusicTrack | null>(null);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);
  const [patternLen, setPatternLen] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [zoom, setZoom] = useState({ x: 1, y: 1 });
  const [noteLen, setNoteLen] = useState(0.5);
  const [tracksOpen, setTracksOpen] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);
  const [rollW, setRollW] = useState(0);
  // when zoomed out, the beats stretch to fill the visible width instead of leaving empty space
  const BEAT_W = Math.max(BASE_BEAT_W * zoom.x, rollW > 0 ? (rollW - 50) / patternLen : 0);
  const ROW_H = BASE_ROW_H * zoom.y;

  const hasTrack = activeTrack !== null;
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRollW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasTrack]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? "null");
      if (saved) setZoom({ x: clamp(saved.x, ZOOM_X), y: clamp(saved.y, ZOOM_Y) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, JSON.stringify(zoom));
    } catch {}
  }, [zoom]);

  /** Zoom while keeping the beat/pitch under (clientX, clientY) — or the view centre — in place. */
  const zoomBy = useCallback((fx: number, fy: number, clientX?: number, clientY?: number) => {
    const el = rollRef.current;
    setZoom((z) => {
      const next = { x: clamp(z.x * fx, ZOOM_X), y: clamp(z.y * fy, ZOOM_Y) };
      if (el) {
        const rect = el.getBoundingClientRect();
        const ox = (clientX ?? rect.left + rect.width / 2) - rect.left;
        const oy = (clientY ?? rect.top + rect.height / 2) - rect.top;
        const ax = el.scrollLeft + ox - 50;
        const ay = el.scrollTop + oy;
        requestAnimationFrame(() => {
          el.scrollLeft = (ax * next.x) / z.x + 50 - ox;
          el.scrollTop = (ay * next.y) / z.y - oy;
        });
      }
      return next;
    });
  }, []);

  // Ctrl/Cmd + wheel zooms time, add Shift to zoom pitch. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const f = Math.exp(-(e.deltaY || e.deltaX) * 0.0025);
      if (e.shiftKey) zoomBy(1, f, e.clientX, e.clientY);
      else zoomBy(f, 1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  const [playhead, setPlayhead] = useState(0);
  const [muted, setMuted] = useState<boolean[]>([false, false, false, false]);
  const [soloed, setSoloed] = useState<boolean[]>([false, false, false, false]);
  const [editingName, setEditingName] = useState(false);

  const masterGainRef = useRef<GainNode | null>(null);
  const volume = usePreviewVolume();
  useEffect(() => {
    const gain = masterGainRef.current;
    if (gain) gain.gain.setTargetAtTime(previewGain(volume), gain.context.currentTime, 0.02);
  }, [volume]);
  const playIntervalRef = useRef<number | null>(null);
  const songRef = useRef<LiveSong | null>(null);
  const scheduledRef = useRef<AudioScheduledSourceNode[]>([]);
  const [loaded, setLoaded] = useState(false);

  // the player reads the latest song on every tick, so edits and undo/redo are heard while it plays
  useEffect(() => {
    songRef.current = activeTrack ? { track: activeTrack, patternLen, muted, soloed, looping } : null;
  }, [activeTrack, patternLen, muted, soloed, looping]);

  useEffect(() => {
    const saved = storage.getAll("music", projectId);
    setTracks(saved);
    const first = saved[0] ?? null;
    setActiveTrack(first);
    if (first) setPatternLen(fitPatternLength(first));
    setLoaded(true);
  }, [projectId]);

  /** Open a track and show the whole song. */
  function openTrack(t: MusicTrack | null) {
    setActiveTrack(t);
    if (t) setPatternLen(fitPatternLength(t));
  }

  // the list shows the open track's live state (e.g. a new name) before it is saved
  const trackList = tracks.map((t) => (t.id === activeTrack?.id ? activeTrack : t));

  const autosave = useAutosave(
    activeTrack,
    (t) => {
      if (!t || !storage.getById("music", t.id, projectId)) return;
      storage.save("music", { ...t, updatedAt: new Date().toISOString() }, projectId);
    },
    { resetKey: activeTrack?.id, enabled: !!activeTrack }
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

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    scheduledRef.current.forEach((o) => {
      try { o.stop(); } catch {}
    });
    scheduledRef.current = [];
    setPlayhead(0);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  useOpenParam((id) => {
    const t = storage.getById("music", id, projectId);
    if (t) {
      stopPlayback();
      openTrack(t);
    }
  }, loaded);
  useTrackOpenAsset(activeTrack?.id ? { type: "music", id: activeTrack?.id } : null);

  // Play is a click handler, so the shared context is unlocked inside the user gesture.
  function getAudioCtx() {
    const ctx = getAudioContext();
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.value = previewGain();
      masterGainRef.current.connect(ctx.destination);
    }
    return ctx;
  }

  function track(node: AudioScheduledSourceNode) {
    scheduledRef.current.push(node);
    node.onended = () => {
      scheduledRef.current = scheduledRef.current.filter((n) => n !== node);
    };
  }

  function startPlayback() {
    if (!activeTrack) return;
    stopPlayback();
    const ctx = getAudioCtx();
    let cursor: PlayCursor = { time: ctx.currentTime, beat: 0 };

    function tick() {
      const song = songRef.current;
      if (!song) return;
      const scheduled = scheduleWindow(song, cursor, ctx.currentTime + LOOKAHEAD_SECONDS);
      scheduled.notes.forEach((due) => {
        track(scheduleNote(ctx, masterGainRef.current ?? ctx.destination, due.note, due.instrument, due.volume, due.passStart, due.beatDuration));
      });
      cursor = scheduled.cursor;
      if (scheduled.ended && ctx.currentTime >= cursor.time) {
        stopPlayback();
        return;
      }
      setPlayhead(beatAt(song, cursor, ctx.currentTime));
    }

    tick();
    setPlaying(true);
    playIntervalRef.current = window.setInterval(tick, 30);
  }

  /** Replace the open channel's notes. Functional so a drag always builds on the latest state. */
  function setActiveNotes(fn: (notes: MusicNote[]) => MusicNote[]) {
    setActiveTrack((t) => {
      if (!t) return t;
      const ch = t.channels[activeChannelIdx];
      if (!ch) return t;
      const pattern = ch.patterns[0] ?? { id: uuid(), notes: [] };
      return {
        ...t,
        channels: t.channels.map((c, i) => (i === activeChannelIdx ? { ...c, patterns: [{ ...pattern, notes: fn(pattern.notes) }] } : c)),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  const snap = noteLen < 0.5 ? 0.25 : 0.5;
  const dragRef = useRef<{ pitch: number; start: number } | null>(null);
  const tapRef = useRef<{ x: number; y: number } | null>(null);

  function gridPos(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const beat = Math.floor(x / (BEAT_W * snap)) * snap;
    const pitch = MAX_MIDI - Math.floor(y / ROW_H);
    return { x, y, beat, pitch, valid: pitch >= MIN_MIDI && pitch <= MAX_MIDI && beat >= 0 && beat < patternLen };
  }

  /** Click on a note removes it; click on empty space adds one. Returns true if a note was added. */
  function toggleAt(pitch: number, beat: number): boolean {
    const hit = activeNotes.find((n) => n.pitch === pitch && n.start <= beat + 1e-6 && beat < n.start + n.duration - 1e-6);
    if (hit) {
      setActiveNotes((ns) => ns.filter((n) => n !== hit && !(n.pitch === hit.pitch && n.start === hit.start)));
      return false;
    }
    const duration = Math.min(noteLen, patternLen - beat);
    setActiveNotes((ns) => [...ns, { pitch, start: beat, duration, velocity: 0.8 }]);
    return true;
  }

  function onGridPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const pos = gridPos(e);
    if (!pos.valid) return;
    // touch: wait for the finger to lift so scrolling the roll still works
    if (e.pointerType === "touch") {
      tapRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (toggleAt(pos.pitch, pos.beat)) {
      dragRef.current = { pitch: pos.pitch, start: pos.beat };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endBeat = Math.ceil((e.clientX - rect.left) / BEAT_W / snap) * snap;
    const duration = Math.min(patternLen - drag.start, Math.max(noteLen, endBeat - drag.start));
    setActiveNotes((ns) =>
      ns.map((n) => (n.pitch === drag.pitch && Math.abs(n.start - drag.start) < 1e-6 && n.duration !== duration ? { ...n, duration } : n))
    );
  }

  function onGridPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    const tap = tapRef.current;
    tapRef.current = null;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8) {
      const pos = gridPos(e);
      if (pos.valid) toggleAt(pos.pitch, pos.beat);
    }
  }

  const history = useHistory(
    activeTrack,
    (t) => {
      if (!t) return;
      setActiveTrack(t);
      setTracks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    },
    activeTrack?.id
  );

  function newTrack() {
    autosave.flush();
    const t = { ...createEmptyTrack(projectId), name: `Untitled track ${tracks.length + 1}` };
    storage.save("music", t, projectId);
    setTracks((prev) => [...prev, t]);
    openTrack(t);
  }

  function deleteTrack(id: string) {
    const t = tracks.find((x) => x.id === id);
    if (!confirm(`Delete "${t?.name ?? "this track"}"?`)) return;
    storage.delete("music", id, projectId);
    const remaining = tracks.filter((t) => t.id !== id);
    setTracks(remaining);
    if (activeTrack?.id === id) {
      openTrack(remaining[0] || null);
    }
  }

  function updateBpm(bpm: number) {
    if (!activeTrack) return;
    const clamped = Math.min(200, Math.max(60, bpm));
    const updated = { ...activeTrack, bpm: clamped, updatedAt: new Date().toISOString() };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function updateChannelVolume(chIdx: number, vol: number) {
    if (!activeTrack) return;
    const updated = {
      ...activeTrack,
      channels: activeTrack.channels.map((c, i) =>
        i === chIdx ? { ...c, volume: vol } : c
      ),
      updatedAt: new Date().toISOString(),
    };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function updateChannelInstrument(chIdx: number, instrument: string) {
    if (!activeTrack) return;
    const updated = {
      ...activeTrack,
      channels: activeTrack.channels.map((c, i) =>
        i === chIdx ? { ...c, instrument } : c
      ),
      updatedAt: new Date().toISOString(),
    };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function toggleMute(idx: number) {
    setMuted((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function toggleSolo(idx: number) {
    setSoloed((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function exportWav() {
    if (!activeTrack) return;
    const sampleRate = 44100;
    const beatDur = 60 / activeTrack.bpm;
    const totalDur = patternLen * beatDur;
    const numSamples = Math.ceil(sampleRate * totalDur);
    const buffer = new Float32Array(numSamples);
    const anySoloed = soloed.some(Boolean);

    activeTrack.channels.forEach((ch, ci) => {
      const isMuted = muted[ci] || (anySoloed && !soloed[ci]);
      if (isMuted) return;
      const pattern = ch.patterns[0];
      if (!pattern) return;

      pattern.notes.forEach((note) => {
        if (note.start >= patternLen) return;
        const startSample = Math.floor(note.start * beatDur * sampleRate);
        const durSamples = Math.floor(note.duration * beatDur * sampleRate);
        const freq = midiToFreq(note.pitch);
        const vol = ch.volume * note.velocity * 0.3;

        for (let i = 0; i < durSamples && startSample + i < numSamples; i++) {
          const t = i / sampleRate;
          const env = Math.max(0, 1 - t / (note.duration * beatDur));
          let sample = 0;

          if (ch.instrument === "noise") {
            sample = (Math.random() * 2 - 1) * vol * env;
          } else if (ch.instrument === "square") {
            sample = (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) * vol * env;
          } else if (ch.instrument === "sawtooth") {
            sample = (2 * ((freq * t) % 1) - 1) * vol * env;
          } else if (ch.instrument === "sine") {
            sample = Math.sin(2 * Math.PI * freq * t) * vol * env;
          } else if (ch.instrument === "triangle") {
            sample = (2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1) * vol * env;
          }

          buffer[startSample + i] += sample;
        }
      });
    });

    // clamp
    for (let i = 0; i < numSamples; i++) {
      buffer[i] = Math.max(-1, Math.min(1, buffer[i]));
    }

    const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuffer);
    function writeStr(offset: number, str: string) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTrack.name}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renamingDone(newName: string) {
    if (!activeTrack) return;
    const updated = { ...activeTrack, name: newName || "Untitled", updatedAt: new Date().toISOString() };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingName(false);
  }

  const activeNotes =
    activeTrack?.channels[activeChannelIdx]?.patterns[0]?.notes ?? [];


  // Also collect all channel notes for background display
  const allChannelNotes: { pitch: number; start: number; duration: number; chIdx: number }[] = [];
  activeTrack?.channels.forEach((ch, ci) => {
    if (ci === activeChannelIdx) return;
    ch.patterns[0]?.notes.forEach((n) => {
      if (n.start < patternLen) {
        allChannelNotes.push({ pitch: n.pitch, start: n.start, duration: n.duration, chIdx: ci });
      }
    });
  });

  const gridW = patternLen * BEAT_W;
  const gridH = PITCH_COUNT * ROW_H;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 h-12 border-b shrink-0"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <UndoRedoButtons history={history} />
          <button
            onClick={() => setTracksOpen(true)}
            className="md:hidden flex items-center gap-1 px-2 py-1.5 rounded-md text-xs"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            aria-label="Show tracks"
          >
            <ListMusic className="w-3.5 h-3.5" /> Tracks
          </button>
          <h1 className="text-sm font-semibold max-md:hidden" style={{ color: "var(--text-primary)" }}>
            Music Composer
          </h1>
          {activeTrack && (
            <span className="text-xs px-2 py-0.5 rounded max-md:hidden" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
              {activeTrack.channels[activeChannelIdx]?.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeTrack && <SaveIndicator state={autosave.state} />}
          <HelpButton topic="music" />
          <ExportMenu
            disabled={!activeTrack}
            items={[{ label: "WAV (this pattern)", description: `${patternLen} beats, with muted channels left out`, onClick: exportWav }]}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {tracksOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setTracksOpen(false)} />}
        {/* Track list sidebar (a drawer on phones) */}
        <div
          {...pasteTriggerProps("music")}
          className={`w-48 border-r flex flex-col shrink-0 overflow-y-auto ${
            tracksOpen ? "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-64 max-md:shadow-2xl" : "max-md:hidden"
          }`}
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          <div className="p-2 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Tracks</span>
            <div className="flex items-center gap-1">
              <PasteButton type="music" />
              <button onClick={newTrack} className="p-1 rounded" style={{ color: "var(--accent)" }} title="New track" aria-label="New track">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {trackList.map((t) => (
            <div
              key={t.id}
              {...assetTriggerProps({ type: "music", id: t.id })}
              {...rowButtonProps(() => assetTriggerProps({ type: "music", id: t.id }))}
              className="group flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs border-b"
              style={{
                background: t.id === activeTrack?.id ? "var(--bg-hover)" : "transparent",
                borderColor: "var(--border)",
                color: t.id === activeTrack?.id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
              onClick={() => { autosave.flush(); stopPlayback(); openTrack(t); setTracksOpen(false); }}
            >
              <span className="flex-1 truncate">{t.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteTrack(t.id); }}
                className="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 p-0.5 rounded"
                style={{ color: "var(--red)" }}
                title={`Delete ${t.name}`}
                aria-label={`Delete ${t.name}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <AssetPinButton asset={{ type: "music", id: t.id }} label={t.name} />
              <AssetMenuButton asset={{ type: "music", id: t.id }} label={t.name} />
            </div>
          ))}
          <div className="mt-auto p-2 border-t" style={{ borderColor: "var(--border)" }}>
            <ExamplesBar projectId={projectId} collections={["music"]} />
          </div>
        </div>

        {/* Main editor area */}
        {activeTrack ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Controls bar */}
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-2 border-b shrink-0"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {/* Name */}
              <div className="flex items-center gap-1">
                {editingName ? (
                  <input
                    className="bg-transparent text-sm font-medium outline-none px-1 rounded"
                    style={{ color: "var(--text-primary)", border: "1px solid var(--accent)" }}
                    defaultValue={activeTrack.name}
                    autoFocus
                    onBlur={(e) => renamingDone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") renamingDone((e.target as HTMLInputElement).value); }}
                  />
                ) : (
                  <span
                    className="text-sm font-medium cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => setEditingName(true)}
                  >
                    {activeTrack.name}
                  </span>
                )}
              </div>

              <div className="w-px h-5" style={{ background: "var(--border)" }} />

              {/* Play/Stop */}
              <button
                onClick={playing ? stopPlayback : startPlayback}
                className="p-1.5 rounded"
                style={{ background: playing ? "var(--red)" : "var(--accent)", color: "white" }}
                title={playing ? "Stop" : "Play"}
                aria-label={playing ? "Stop" : "Play"}
              >
                {playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              {/* Loop */}
              <button
                onClick={() => setLooping(!looping)}
                className="p-1.5 rounded"
                style={{
                  background: looping ? "var(--accent)" : "var(--bg-hover)",
                  color: looping ? "white" : "var(--text-secondary)",
                }}
                title="Loop"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-5" style={{ background: "var(--border)" }} />

              <VolumeControl />

              <div className="w-px h-5" style={{ background: "var(--border)" }} />

              {/* Zoom */}
              <div className="flex items-center gap-0.5" title="Zoom: Ctrl/⌘ + scroll for time, add Shift for pitch">
                <MoveHorizontal className="w-3.5 h-3.5 mr-0.5" style={{ color: "var(--text-muted)" }} />
                <button onClick={() => zoomBy(1 / 1.25, 1)} disabled={zoom.x <= ZOOM_X.min} className="p-1 rounded disabled:opacity-30" style={{ color: "var(--text-secondary)" }} title="Zoom out (time)" aria-label="Zoom out time">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => zoomBy(1.25, 1)} disabled={zoom.x >= ZOOM_X.max} className="p-1 rounded disabled:opacity-30" style={{ color: "var(--text-secondary)" }} title="Zoom in (time)" aria-label="Zoom in time">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <MoveVertical className="w-3.5 h-3.5 ml-1.5 mr-0.5" style={{ color: "var(--text-muted)" }} />
                <button onClick={() => zoomBy(1, 1 / 1.25)} disabled={zoom.y <= ZOOM_Y.min} className="p-1 rounded disabled:opacity-30" style={{ color: "var(--text-secondary)" }} title="Zoom out (pitch)" aria-label="Zoom out pitch">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => zoomBy(1, 1.25)} disabled={zoom.y >= ZOOM_Y.max} className="p-1 rounded disabled:opacity-30" style={{ color: "var(--text-secondary)" }} title="Zoom in (pitch)" aria-label="Zoom in pitch">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setZoom({ x: 1, y: 1 })} className="ml-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }} title="Reset zoom">
                  {Math.round(zoom.x * 100)}%
                </button>
              </div>

              <div className="w-px h-5" style={{ background: "var(--border)" }} />

              {/* BPM */}
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>BPM</span>
                <input
                  type="number"
                  min={60}
                  max={200}
                  value={activeTrack.bpm}
                  onChange={(e) => updateBpm(Number(e.target.value))}
                  className="w-14 bg-transparent text-xs text-center rounded px-1 py-0.5 outline-none"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                />
              </div>

              {/* Pattern length */}
              <label className="flex items-center gap-1" title="How long the loop is. 4 beats = 1 bar.">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loop length</span>
                <select
                  value={patternLen}
                  onChange={(e) => setPatternLen(Number(e.target.value))}
                  className="bg-transparent text-xs rounded px-1 py-0.5 outline-none"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {PATTERN_LENGTHS.map((l) => (
                    <option key={l} value={l}>
                      {l} beats ({l / 4} bars)
                    </option>
                  ))}
                </select>
              </label>

              <div className="w-px h-5" style={{ background: "var(--border)" }} />
              <LinkedAssets projectId={projectId} type="music" id={activeTrack.id} layout="row" />
            </div>

            {/* Channel mixer strip */}
            <div
              className="flex items-center gap-1 px-4 py-1.5 border-b shrink-0 overflow-x-auto"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              {activeTrack.channels.map((ch, ci) => {
                const isActive = ci === activeChannelIdx;
                const color = CHANNEL_COLORS[ci] || "var(--text-secondary)";
                return (
                  <div
                    key={ch.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs shrink-0"
                    style={{
                      background: isActive ? "var(--bg-hover)" : "transparent",
                      border: isActive ? `1px solid ${color}` : "1px solid transparent",
                    }}
                    onClick={() => setActiveChannelIdx(ci)}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>{ch.name}</span>

                    {/* Instrument select */}
                    <select
                      value={ch.instrument}
                      onChange={(e) => { e.stopPropagation(); updateChannelInstrument(ci, e.target.value); }}
                      className="bg-transparent text-xs outline-none"
                      style={{ color: "var(--text-muted)", maxWidth: 70 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {INSTRUMENTS.map((inst) => (
                        <option key={inst.value} value={inst.value}>{inst.label}</option>
                      ))}
                    </select>

                    {/* Volume */}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={ch.volume}
                      onChange={(e) => { e.stopPropagation(); updateChannelVolume(ci, Number(e.target.value)); }}
                      className="w-12 h-1 accent-current"
                      style={{ accentColor: color }}
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* Mute */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMute(ci); }}
                      className="p-0.5 rounded"
                      style={{ color: muted[ci] ? "var(--red)" : "var(--text-muted)" }}
                      title="Mute"
                    >
                      {muted[ci] ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </button>

                    {/* Solo */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSolo(ci); }}
                      className="px-1 rounded text-[10px] font-bold"
                      style={{
                        color: soloed[ci] ? "var(--yellow)" : "var(--text-muted)",
                        background: soloed[ci] ? "rgba(251,191,36,0.15)" : "transparent",
                      }}
                      title="Solo"
                    >
                      S
                    </button>
                  </div>
                );
              })}
            </div>

            {/* How to draw notes */}
            <div
              className="flex items-center gap-3 px-4 py-1.5 border-b shrink-0 flex-wrap"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                Note length
                <select
                  value={noteLen}
                  onChange={(e) => setNoteLen(Number(e.target.value))}
                  className="bg-transparent text-xs rounded px-1 py-0.5 outline-none"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {NOTE_LENGTHS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="max-md:hidden">Click to add a note, click it again to remove. Drag right for a longer note.</span>
                <span className="md:hidden">Tap to add a note, tap it again to remove.</span>
              </span>
            </div>

            {/* Piano roll */}
            <div ref={rollRef} className="flex-1 overflow-auto relative">
              <div className="flex" style={{ minWidth: gridW + 50 }}>
                {/* Piano keys */}
                <div className="sticky left-0 z-10 shrink-0" style={{ width: 50, background: "var(--bg-secondary)" }}>
                  {Array.from({ length: PITCH_COUNT }, (_, i) => {
                    const midi = MAX_MIDI - i;
                    const name = midiToName(midi);
                    const isBlack = name.includes("#");
                    return (
                      <div
                        key={midi}
                        className="flex items-center justify-end pr-1 border-b text-[9px] select-none"
                        style={{
                          height: ROW_H,
                          background: isBlack ? "var(--bg-primary)" : "var(--bg-secondary)",
                          borderColor: "var(--border)",
                          color: isBlack ? "var(--text-muted)" : "var(--text-secondary)",
                        }}
                      >
                        {ROW_H >= 9 ? name : ""}
                      </div>
                    );
                  })}
                </div>

                {/* Grid */}
                <div className="relative" style={{ width: gridW, height: gridH }}>
                  {/* Grid lines */}
                  <svg className="absolute inset-0" width={gridW} height={gridH}>
                    {/* Row lines */}
                    {Array.from({ length: PITCH_COUNT + 1 }, (_, i) => (
                      <line
                        key={`r${i}`}
                        x1={0} y1={i * ROW_H} x2={gridW} y2={i * ROW_H}
                        stroke="var(--border)" strokeWidth={0.5}
                      />
                    ))}
                    {/* Beat lines */}
                    {Array.from({ length: patternLen + 1 }, (_, i) => (
                      <line
                        key={`b${i}`}
                        x1={i * BEAT_W} y1={0} x2={i * BEAT_W} y2={gridH}
                        stroke={i % 4 === 0 ? "var(--border-hover)" : "var(--border)"}
                        strokeWidth={i % 4 === 0 ? 1 : 0.5}
                      />
                    ))}
                    {/* Half-beat lines */}
                    {Array.from({ length: patternLen }, (_, i) => (
                      <line
                        key={`hb${i}`}
                        x1={(i + 0.5) * BEAT_W} y1={0} x2={(i + 0.5) * BEAT_W} y2={gridH}
                        stroke="var(--border)" strokeWidth={0.25} strokeDasharray="2,4"
                      />
                    ))}
                  </svg>

                  {/* Background channel notes */}
                  {allChannelNotes.map((n, i) => {
                    const row = MAX_MIDI - n.pitch;
                    if (row < 0 || row >= PITCH_COUNT) return null;
                    const color = CHANNEL_COLORS[n.chIdx] || "var(--text-muted)";
                    return (
                      <div
                        key={`bg-${i}`}
                        className="absolute rounded-sm"
                        style={{
                          left: n.start * BEAT_W,
                          top: row * ROW_H + 1,
                          width: n.duration * BEAT_W - 1,
                          height: ROW_H - 2,
                          background: color,
                          opacity: 0.15,
                        }}
                      />
                    );
                  })}

                  {/* Active channel notes */}
                  {activeNotes.map((n, i) => {
                    const row = MAX_MIDI - n.pitch;
                    if (row < 0 || row >= PITCH_COUNT) return null;
                    if (n.start >= patternLen) return null;
                    const color = CHANNEL_COLORS[activeChannelIdx] || "var(--accent)";
                    return (
                      <div
                        key={`note-${i}`}
                        className="absolute rounded-sm cursor-pointer"
                        style={{
                          left: n.start * BEAT_W + 1,
                          top: row * ROW_H + 1,
                          width: n.duration * BEAT_W - 2,
                          height: ROW_H - 2,
                          background: color,
                          opacity: 0.85,
                        }}
                      />
                    );
                  })}

                  {/* Click area for adding/removing notes */}
                  <div
                    className="absolute inset-0"
                    style={{ cursor: "crosshair" }}
                    onPointerDown={onGridPointerDown}
                    onPointerMove={onGridPointerMove}
                    onPointerUp={onGridPointerUp}
                    onPointerCancel={() => {
                      dragRef.current = null;
                      tapRef.current = null;
                    }}
                  />

                  {/* Playhead */}
                  {playing && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{
                        left: playhead * BEAT_W,
                        width: 2,
                        background: "var(--accent)",
                        boxShadow: "0 0 8px var(--accent)",
                        zIndex: 20,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Beat numbers */}
              <div className="sticky bottom-0 flex" style={{ background: "var(--bg-secondary)" }}>
                <div style={{ width: 50 }} />
                {Array.from({ length: patternLen }, (_, i) => (
                  <div
                    key={i}
                    className="text-center text-[9px] py-0.5"
                    style={{ width: BEAT_W, color: i % 4 === 0 ? "var(--text-secondary)" : "var(--text-muted)" }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ color: "var(--text-muted)" }}>
            <ListMusic className="w-10 h-10" />
            <p className="text-sm">No track open. Start a new one, or add the example songs to learn from.</p>
            <button
              onClick={newTrack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              <Plus className="w-4 h-4" /> New track
            </button>
            <ExamplesBar projectId={projectId} collections={["music"]} />
          </div>
        )}
      </div>
    </div>
  );
}
