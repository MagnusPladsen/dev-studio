import { previewGain } from "@/hooks/usePreviewVolume";
import { getStoredAsset } from "@/lib/asset-actions";
import type { AssetRef, MusicTrack, SoundEffect } from "@/types";
import { getAudioContext } from "./context";
import { scheduleNote, trackLengthSeconds } from "./music-synth";
import { SAMPLE_RATE, synthesize } from "./sfx-synth";

let stopCurrent: (() => void) | null = null;
let previewing: AssetRef | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function setPreviewing(ref: AssetRef | null): void {
  previewing = ref;
  notifyListeners();
}

function createOutput(audio: AudioContext): GainNode {
  const output = audio.createGain();
  output.gain.value = previewGain();
  output.connect(audio.destination);
  return output;
}

function stopSources(sources: AudioScheduledSourceNode[]): void {
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // already stopped
    }
  }
}

function trackEnding(ref: AssetRef, sources: AudioScheduledSourceNode[], endsAfterSeconds: number): void {
  const timer = window.setTimeout(() => {
    if (previewing === ref) setPreviewing(null);
  }, endsAfterSeconds * 1000);
  stopCurrent = () => {
    window.clearTimeout(timer);
    stopSources(sources);
  };
}

function startSound(ref: AssetRef, sound: SoundEffect): void {
  const samples = synthesize(sound.params);
  if (samples.length === 0) return;
  const audio = getAudioContext();
  const buffer = audio.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(createOutput(audio));
  source.start();
  trackEnding(ref, [source], buffer.duration);
  setPreviewing(ref);
}

function startMusic(ref: AssetRef, track: MusicTrack): void {
  const audio = getAudioContext();
  const output = createOutput(audio);
  const beatDuration = 60 / track.bpm;
  const sources = track.channels.flatMap((channel) =>
    (channel.patterns[0]?.notes ?? []).map((note) =>
      scheduleNote(audio, output, note, channel.instrument, channel.volume, audio.currentTime, beatDuration)
    )
  );
  trackEnding(ref, sources, trackLengthSeconds(track));
  setPreviewing(ref);
}

export function stopPreview(): void {
  stopCurrent?.();
  stopCurrent = null;
  if (previewing) setPreviewing(null);
}

export function playPreview(projectId: string, ref: AssetRef): void {
  stopPreview();
  const asset = getStoredAsset(projectId, ref);
  if (!asset) return;
  if (ref.type === "sound") startSound(ref, asset as SoundEffect);
  if (ref.type === "music") startMusic(ref, asset as MusicTrack);
}

export function getPreviewing(): AssetRef | null {
  return previewing;
}

export function subscribePreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
