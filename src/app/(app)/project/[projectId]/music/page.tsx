"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  SlidersHorizontal,
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
import { ImportMenu } from "@/components/ImportMenu";
import { ImportDropZone } from "@/components/ImportDropZone";
import { useImport } from "@/hooks/useImport";
import { importAsNewAssets } from "@/lib/import";
import { MUSIC_IMPORTERS } from "@/lib/import/music";
import { downloadBlob } from "@/lib/download";
import { HelpButton } from "@/components/HelpButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { rowButtonProps } from "@/lib/row-button";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { getAudioContext } from "@/lib/audio/context";
import { scheduleNote } from "@/lib/audio/music-synth";
import { applyPreset } from "@/lib/audio/music-instruments";
import { InstrumentPanel, PresetSelect } from "@/components/music/InstrumentPanel";
import { LinkedPatternNotice } from "@/components/music/LinkedPatternNotice";
import { SongRow } from "@/components/music/SongRow";
import { GameExportDialog } from "@/components/music/GameExportDialog";
import { useSelectedSection } from "@/hooks/useSelectedSection";
import { useShowChannels } from "@/hooks/useShowChannels";
import { RENDER_SAMPLE_RATE, renderSong } from "@/lib/audio/music-render";
import { encodeWav } from "@/lib/audio/wav";
import { safeFileName } from "@/lib/audio/sfx-export";
import { writeMidiFile } from "@/lib/import/music/midi-write";
import { fitPatternLength, getSections, SECTION_LENGTHS, sectionNotes, setSectionNotes, songSteps, updateSection, withLegacyLength, type SongStep } from "@/lib/music-sections";
import { beatAt, scheduleWindow, type LiveSong, type PlayCursor } from "@/lib/audio/music-scheduler";
import { isInScale, isScaleLocked, KEY_NAMES, SCALE_IDS, SCALES, songScale, type ScaleId } from "@/lib/music-scale";
import { cellsBetween, coversCell, eraseCells, paintCells, type GridCell, type NoteCell } from "@/lib/music-draw";
import type { MusicTrack, MusicChannel, MusicNote, MusicSectionLength } from "@/types";
import { v4 as uuid } from "uuid";
import { dialog } from "@/components/Dialog";

function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${KEY_NAMES[midi % 12]}${octave}`;
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

function defaultChannel(name: string, preset: string): MusicChannel {
  return applyPreset({ id: uuid(), name, instrument: "square", volume: 0.5, patterns: [{ id: uuid(), notes: [] }] }, preset);
}

function createEmptyTrack(projectId: string): MusicTrack {
  return {
    id: uuid(),
    projectId,
    name: "Untitled track",
    bpm: 120,
    channels: [
      defaultChannel("Melody", "lead"),
      defaultChannel("Harmony", "soft-pad"),
      defaultChannel("Bass", "bass"),
      defaultChannel("Drums", "drum-kit"),
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
/** How far ahead notes are handed to the audio clock; edits land after at most this long. */
const LOOKAHEAD_SECONDS = 0.2;
/** Longest a placed note is heard for, in beats, so long notes don't drone while you draw. */
const PLACE_PREVIEW_BEATS = 0.5;

/** How many earlier passes of the same section come right before `stepIndex` (its repeats so far). */
function playedRepeats(steps: SongStep[], stepIndex: number): number {
  let count = 0;
  while (stepIndex - count > 0 && steps[stepIndex - count - 1].sectionId === steps[stepIndex].sectionId) count++;
  return count;
}

/** How far through its song-row block playback is: a repeated block fills over all its passes in Song mode, over the one pass in Section mode. */
function blockProgress(track: MusicTrack, steps: SongStep[], playhead: { step: number; beat: number }, mode: "song" | "section"): number {
  const step = steps[playhead.step];
  if (mode === "section") return Math.min(1, playhead.beat / step.length);
  const repeat = getSections(track).find((section) => section.id === step.sectionId)?.repeat ?? 1;
  return Math.min(1, (playhead.beat + playedRepeats(steps, playhead.step) * step.length) / (step.length * repeat));
}

const PLAY_MODES = [
  { mode: "song", label: "Song", title: "Play the whole song: the intro once, then loop" },
  { mode: "section", label: "Section", title: "Play only the section you are editing" },
] as const;

function PlayModeToggle({ mode, onChange }: { mode: "song" | "section"; onChange(mode: "song" | "section"): void }) {
  return (
    <div className="flex items-center rounded overflow-hidden text-xs" style={{ border: "1px solid var(--border)" }} role="group" aria-label="What to play">
      {PLAY_MODES.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onChange(option.mode)}
          className="px-2 py-0.5"
          style={mode === option.mode ? { background: "var(--accent)", color: "var(--on-accent)" } : { color: "var(--text-primary)" }}
          title={option.title}
          aria-pressed={mode === option.mode}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function MusicPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();

  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<MusicTrack | null>(null);
  const [isGameExportOpen, setIsGameExportOpen] = useState(false);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);
  const [legacyLength, setLegacyLength] = useState<MusicSectionLength>(8);
  const shownTrack = useMemo(() => (activeTrack ? withLegacyLength(activeTrack, legacyLength) : null), [activeTrack, legacyLength]);
  const selection = useSelectedSection(shownTrack);
  const { showChannels, toggleChannels } = useShowChannels();
  const selectedSectionId = selection.section?.id ?? "";
  const patternLen = selection.section?.length ?? 8;
  const [playMode, setPlayMode] = useState<"song" | "section">("song");
  const hasSongRow = shownTrack ? getSections(shownTrack).length > 1 : false;
  const effectivePlayMode = hasSongRow ? playMode : "section";
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [zoom, setZoom] = useState({ x: 1, y: 1 });
  const [noteLen, setNoteLen] = useState(0.5);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [isInstrumentOpen, setIsInstrumentOpen] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
  const [playhead, setPlayhead] = useState<{ step: number; beat: number } | null>(null);
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
    if (!shownTrack) {
      songRef.current = null;
      return;
    }
    songRef.current = { track: shownTrack, ...songSteps(shownTrack, effectivePlayMode, selectedSectionId), muted, soloed, looping };
  }, [shownTrack, effectivePlayMode, selectedSectionId, muted, soloed, looping]);

  useEffect(() => {
    const saved = storage.getAll("music", projectId);
    setTracks(saved);
    const first = saved[0] ?? null;
    setActiveTrack(first);
    if (first) setLegacyLength(fitPatternLength(first));
    setLoaded(true);
  }, [projectId]);

  /** Open a track on `sectionId`, or on its first section. */
  function openTrack(t: MusicTrack | null, sectionId: string | null = null) {
    setActiveTrack(t);
    if (t) setLegacyLength(fitPatternLength(t));
    selection.select(sectionId);
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
    setPlayhead(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  useOpenParam((id) => {
    const t = storage.getById("music", id, projectId);
    if (t) {
      stopPlayback();
      openTrack(t, selection.initialId);
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
    let cursor: PlayCursor = { time: ctx.currentTime, step: 0, beat: 0 };

    function tick() {
      const song = songRef.current;
      if (!song) return;
      const scheduled = scheduleWindow(song, cursor, ctx.currentTime + LOOKAHEAD_SECONDS);
      scheduled.notes.forEach((due) => {
        track(scheduleNote(ctx, masterGainRef.current ?? ctx.destination, due.note, due.voice, due.volume, due.passStart, due.beatDuration));
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
      return { ...setSectionNotes(t, selectedSectionId, ch.id, fn), updatedAt: new Date().toISOString() };
    });
  }

  const snap = noteLen < 0.5 ? 0.25 : 0.5;
  const scale = songScale(activeTrack ?? {});
  // noise "pitches" are drum colours, not notes, so the drums channel is never locked
  const isLocked = isScaleLocked(scale) && activeTrack?.channels[activeChannelIdx]?.instrument !== "noise";
  const isPlayable = (pitch: number) => !isLocked || isInScale(pitch, scale);
  // a stroke paints notes into empty cells, or erases notes when it starts on one
  const strokeRef = useRef<{ mode: "paint" | "erase"; last: GridCell } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  function gridCell(e: React.PointerEvent<HTMLDivElement>): GridCell {
    const rect = e.currentTarget.getBoundingClientRect();
    return { col: Math.floor((e.clientX - rect.left) / (BEAT_W * snap)), row: Math.floor((e.clientY - rect.top) / ROW_H) };
  }

  function toNoteCells(cells: GridCell[]): NoteCell[] {
    return cells
      .map((c) => ({ pitch: MAX_MIDI - c.row, beat: c.col * snap }))
      .filter((c) => c.pitch >= MIN_MIDI && c.pitch <= MAX_MIDI && c.beat >= 0 && c.beat < patternLen);
  }

  function drawCells(mode: "paint" | "erase", cells: GridCell[]) {
    const noteCells = toNoteCells(cells).filter((c) => mode === "erase" || isPlayable(c.pitch));
    if (noteCells.length === 0) return;
    setActiveNotes((ns) => (mode === "erase" ? eraseCells(ns, noteCells) : paintCells(ns, noteCells, noteLen, patternLen)));
  }

  function onGridPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cell = gridCell(e);
    const [start] = toNoteCells([cell]);
    if (!start) return;
    const mode = activeNotes.some((n) => coversCell(n, start)) ? "erase" : "paint";
    if (mode === "paint" && !isPlayable(start.pitch)) return;
    if (mode === "paint") previewPitch(start.pitch);
    strokeRef.current = { mode, last: cell };
    history.checkpoint();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    drawCells(mode, [cell]);
  }

  /** Play a just-placed note through the playback synth. Skipped while the song plays, which is heard anyway. */
  function previewPitch(pitch: number) {
    const ch = activeTrack?.channels[activeChannelIdx];
    if (!ch || playing || muted[activeChannelIdx]) return;
    const ctx = getAudioCtx();
    const note = { pitch, start: 0, duration: Math.min(noteLen, PLACE_PREVIEW_BEATS), velocity: 0.8 };
    scheduleNote(ctx, masterGainRef.current ?? ctx.destination, note, ch, ch.volume, ctx.currentTime, 60 / activeTrack.bpm);
  }

  function onGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const cell = gridCell(e);
    if (cell.col === stroke.last.col && cell.row === stroke.last.row) return;
    drawCells(stroke.mode, cellsBetween(stroke.last, cell).slice(1));
    stroke.last = cell;
  }

  function endStroke() {
    strokeRef.current = null;
    setIsDrawing(false);
  }

  // while a stroke is drawn the history sees the track as it was, so the whole stroke is one undo step
  const [stableTrack, setStableTrack] = useState(activeTrack);
  if (!isDrawing && stableTrack !== activeTrack) setStableTrack(activeTrack);

  const history = useHistory(
    isDrawing ? stableTrack : activeTrack,
    (t) => {
      if (!t) return;
      setActiveTrack(t);
      setTracks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    },
    activeTrack?.id
  );

  const imports = useImport<MusicTrack>({
    importers: MUSIC_IMPORTERS,
    noun: ["song", "songs"],
    history,
    openId: activeTrack?.id ?? null,
    apply: ({ items }) =>
      importAsNewAssets("music", projectId, items, {
        previousId: activeTrack?.id ?? null,
        open: (t) => showImported(t),
        back: (previous) => showImported(previous ?? null),
      }),
  });

  function showImported(t: MusicTrack | null) {
    autosave.flush();
    stopPlayback();
    setTracks(storage.getAll("music", projectId));
    openTrack(t);
  }

  function newTrack() {
    autosave.flush();
    const t = { ...createEmptyTrack(projectId), name: `Untitled track ${tracks.length + 1}` };
    storage.save("music", t, projectId);
    setTracks((prev) => [...prev, t]);
    openTrack(t);
  }

  async function deleteTrack(id: string) {
    const t = tracks.find((x) => x.id === id);
    if (!(await dialog.confirm({ message: `Delete "${t?.name ?? "this track"}"?`, confirmLabel: "Delete", danger: true }))) return;
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

  /** Key and scale changes are each their own undo step. */
  function updateScale(change: { key?: number; scale?: ScaleId }) {
    if (!activeTrack) return;
    history.checkpoint();
    const updated = { ...activeTrack, ...change, updatedAt: new Date().toISOString() };
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

  /** A channel's sound. Picking a preset or wave is its own undo step; a slider drag is grouped by `onStartEdit`. */
  function updateChannelSound(chIdx: number, next: MusicChannel, isNewStep = false) {
    if (!activeTrack) return;
    if (isNewStep) history.checkpoint();
    const updated = {
      ...activeTrack,
      channels: activeTrack.channels.map((c, i) => (i === chIdx ? next : c)),
      updatedAt: new Date().toISOString(),
    };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  /** A song-section edit is its own undo step; `selectId` opens that section afterwards. */
  function applySectionEdit(next: MusicTrack, selectId?: string) {
    history.checkpoint();
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectId) selection.select(selectId);
  }

  function updateSectionLength(length: MusicSectionLength) {
    if (!shownTrack || !selection.section || length === selection.section.length) return;
    applySectionEdit(updateSection(shownTrack, selection.section.id, { length }));
  }

  function toggleMute(idx: number) {
    setMuted((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function toggleSolo(idx: number) {
    setSoloed((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  async function exportWav(mode: "song" | "section", fileName: string) {
    if (!shownTrack) return;
    const samples = await renderSong(shownTrack, { steps: songSteps(shownTrack, mode, selectedSectionId).steps, muted, soloed });
    downloadBlob(`${fileName}.wav`, new Blob([encodeWav(samples, RENDER_SAMPLE_RATE)], { type: "audio/wav" }));
  }

  function wavExportItems() {
    const name = activeTrack?.name ?? "";
    const withoutMuted = "with muted channels left out";
    if (!hasSongRow) return [{ label: "WAV (this pattern)", description: `${patternLen} beats, ${withoutMuted}`, onClick: () => exportWav("section", name) }];
    return [
      { label: "WAV (whole song)", description: `Intro + one pass of the loop, ${withoutMuted}`, onClick: () => exportWav("song", name) },
      {
        label: "WAV (this section)",
        description: `${selection.section?.name}, ${patternLen} beats, ${withoutMuted}`,
        onClick: () => exportWav("section", `${name} - ${selection.section?.name}`),
      },
    ];
  }

  function exportMidi() {
    if (!shownTrack) return;
    downloadBlob(`${safeFileName(shownTrack.name)}.mid`, new Blob([writeMidiFile(shownTrack).slice()], { type: "audio/midi" }));
  }

  function exportJson() {
    if (!activeTrack) return;
    downloadBlob(`${activeTrack.name}.json`, new Blob([JSON.stringify(activeTrack, null, 2)], { type: "application/json" }));
  }

  function renamingDone(newName: string) {
    if (!activeTrack) return;
    const updated = { ...activeTrack, name: newName || "Untitled", updatedAt: new Date().toISOString() };
    setActiveTrack(updated);
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingName(false);
  }

  const activeChannel = activeTrack?.channels[activeChannelIdx];
  const activeNotes = shownTrack && activeChannel && selection.section ? sectionNotes(shownTrack, selection.section, activeChannel.id) : [];
  const outOfKeyCount = activeNotes.filter((n) => !isPlayable(n.pitch)).length;

  const playSteps = shownTrack ? songSteps(shownTrack, effectivePlayMode, selectedSectionId).steps : [];
  const playingStep = playing && playhead ? playSteps[playhead.step] : undefined;
  const isPlayheadInRoll = playingStep?.sectionId === selectedSectionId;
  const playingBlock = playingStep && playhead && shownTrack ? { sectionId: playingStep.sectionId, progress: blockProgress(shownTrack, playSteps, playhead, effectivePlayMode) } : null;


  // Also collect all channel notes for background display
  const allChannelNotes: { pitch: number; start: number; duration: number; chIdx: number }[] = [];
  shownTrack?.channels.forEach((ch, ci) => {
    if (ci === activeChannelIdx || !selection.section) return;
    sectionNotes(shownTrack, selection.section, ch.id).forEach((n) => {
      allChannelNotes.push({ pitch: n.pitch, start: n.start, duration: n.duration, chIdx: ci });
    });
  });

  const gridW = patternLen * BEAT_W;
  const gridH = PITCH_COUNT * ROW_H;

  return (
    <div ref={rootRef} className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <ImportDropZone imports={imports} target={rootRef} />
      {isGameExportOpen && shownTrack && <GameExportDialog track={shownTrack} onClose={() => setIsGameExportOpen(false)} />}
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-2 px-4 max-md:px-2 h-12 border-b shrink-0"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3 max-md:gap-2 min-w-0">
          <UndoRedoButtons history={imports.history} />
          <button
            onClick={() => setTracksOpen(true)}
            className="md:hidden flex items-center gap-1 px-2 py-1.5 rounded-md text-xs shrink-0"
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
        <div className="flex items-center gap-3 max-md:gap-1.5 shrink-0">
          {activeTrack && <SaveIndicator state={autosave.state} className="max-[359px]:hidden" />}
          <HelpButton topic="music" />
          <ImportMenu imports={imports} />
          <ExportMenu
            disabled={!activeTrack}
            items={[
              ...wavExportItems(),
              { label: "Export for game…", description: "OGG or WAV that loops cleanly, stems, fade-out", onClick: () => setIsGameExportOpen(true) },
              { label: "MIDI (.mid)", description: "Notes and tempo for a music app like LMMS (free)", onClick: exportMidi },
              { label: "Song JSON", description: "Every channel and note, to import again later", onClick: exportJson },
            ]}
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
        {activeTrack && shownTrack ? (
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

              {hasSongRow && <PlayModeToggle mode={playMode} onChange={setPlayMode} />}

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
                  onChange={(e) => updateSectionLength(Number(e.target.value) as MusicSectionLength)}
                  className="bg-transparent text-xs rounded px-1 py-0.5 outline-none"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {SECTION_LENGTHS.map((l) => (
                    <option key={l} value={l}>
                      {l} beats ({l / 4} bars)
                    </option>
                  ))}
                </select>
              </label>
              {!hasSongRow && (
                <SongRow
                  track={shownTrack}
                  selectedId={selectedSectionId}
                  playing={null}
                  showChannels={false}
                  activeChannelIndex={activeChannelIdx}
                  onSelect={selection.select}
                  onChange={applySectionEdit}
                  onToggleChannels={() => {}}
                  onSelectCell={() => {}}
                />
              )}

              {/* Key and scale */}
              <div className="flex items-center gap-1" title="Lock the grid to a scale so every note you place fits. Chromatic turns the lock off. Drums are never locked.">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Scale</span>
                <select
                  value={scale.key}
                  onChange={(e) => updateScale({ key: Number(e.target.value) })}
                  disabled={!isScaleLocked(scale)}
                  className="bg-transparent text-xs rounded px-1 py-0.5 outline-none disabled:opacity-40"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  aria-label="Key"
                >
                  {KEY_NAMES.map((name, i) => (
                    <option key={name} value={i}>{name}</option>
                  ))}
                </select>
                <select
                  value={scale.scale}
                  onChange={(e) => updateScale({ scale: e.target.value as ScaleId })}
                  className="bg-transparent text-xs rounded px-1 py-0.5 outline-none"
                  style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  aria-label="Scale"
                >
                  {SCALE_IDS.map((id) => (
                    <option key={id} value={id}>{SCALES[id].label}</option>
                  ))}
                </select>
              </div>

              <div className="w-px h-5" style={{ background: "var(--border)" }} />
              <LinkedAssets projectId={projectId} type="music" id={activeTrack.id} layout="row" />
            </div>

            {hasSongRow && (
              <SongRow
                track={shownTrack}
                selectedId={selectedSectionId}
                playing={playingBlock}
                showChannels={showChannels}
                activeChannelIndex={activeChannelIdx}
                onSelect={selection.select}
                onChange={applySectionEdit}
                onToggleChannels={toggleChannels}
                onSelectCell={(sectionId, channelIndex) => {
                  selection.select(sectionId);
                  setActiveChannelIdx(channelIndex);
                }}
              />
            )}

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

                    <PresetSelect
                      channel={ch}
                      onChange={(next) => updateChannelSound(ci, next, true)}
                      className="bg-transparent text-xs outline-none"
                      style={{ color: "var(--text-muted)", maxWidth: 84 }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveChannelIdx(ci);
                        setIsInstrumentOpen((open) => !(open && isActive));
                      }}
                      className="p-0.5 rounded"
                      style={{ color: isInstrumentOpen && isActive ? color : "var(--text-muted)" }}
                      title={`Edit ${ch.name} instrument`}
                      aria-label={`Edit ${ch.name} instrument`}
                      aria-pressed={isInstrumentOpen && isActive}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                    </button>

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

            {isInstrumentOpen && activeTrack.channels[activeChannelIdx] && (
              <InstrumentPanel
                channel={activeTrack.channels[activeChannelIdx]}
                color={CHANNEL_COLORS[activeChannelIdx] || "var(--text-secondary)"}
                onChange={(next) => updateChannelSound(activeChannelIdx, next)}
                onStartEdit={() => history.checkpoint()}
                onClose={() => setIsInstrumentOpen(false)}
              />
            )}

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
                <span className="max-md:hidden">Click or drag in any direction to draw notes. Start on a note to erase instead.</span>
                <span className="md:hidden">Tap or drag to draw notes, start on a note to erase. Drag the piano keys to scroll.</span>
              </span>
              {outOfKeyCount > 0 && (
                <span className="text-xs" style={{ color: "var(--red)" }}>
                  {outOfKeyCount === 1 ? "1 note is" : `${outOfKeyCount} notes are`} outside the scale (dashed). Click or tap one to erase it.
                </span>
              )}
            </div>

            {activeChannel && selection.section && (
              <LinkedPatternNotice track={shownTrack} section={selection.section} channelId={activeChannel.id} showChannels={showChannels} onChange={applySectionEdit} />
            )}

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
                          opacity: isPlayable(midi) ? 1 : 0.35,
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
                    {/* Rows outside the scale */}
                    {isLocked &&
                      Array.from({ length: PITCH_COUNT }, (_, i) =>
                        isPlayable(MAX_MIDI - i) ? null : (
                          <rect key={`off${i}`} x={0} y={i * ROW_H} width={gridW} height={ROW_H} fill="var(--bg-secondary)" opacity={0.85} />
                        )
                      )}
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
                    const isOutOfKey = !isPlayable(n.pitch);
                    return (
                      <div
                        key={`note-${i}`}
                        className="absolute rounded-sm cursor-pointer"
                        data-out-of-key={isOutOfKey || undefined}
                        style={{
                          outline: isOutOfKey ? "2px dashed var(--red)" : undefined,
                          outlineOffset: -2,
                          left: n.start * BEAT_W + 1,
                          top: row * ROW_H + 1,
                          width: n.duration * BEAT_W - 2,
                          height: ROW_H - 2,
                          background: color,
                          opacity: isOutOfKey ? 0.5 : 0.85,
                        }}
                      />
                    );
                  })}

                  {/* Click area for adding/removing notes */}
                  <div
                    className="absolute inset-0"
                    style={{ cursor: "crosshair", touchAction: "none" }}
                    onPointerDown={onGridPointerDown}
                    onPointerMove={onGridPointerMove}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                  />

                  {/* Playhead */}
                  {isPlayheadInRoll && playhead && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{
                        left: playhead.beat * BEAT_W,
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
