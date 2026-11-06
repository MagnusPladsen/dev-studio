import { getSections, songSteps } from "@/lib/music-sections";
import type { MusicNote, MusicTrack, MusicVibrato } from "@/types";
import { envelopeSteps, releaseSeconds, SILENT } from "./music-envelope";
import type { MusicVoice } from "./music-instruments";

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createNoiseBuffer(ctx: BaseAudioContext, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Seconds the vibrato takes to fade in once its delay is over, so it doesn't jump in. */
const VIBRATO_FADE = 0.1;

function applyEnvelope(param: AudioParam, voice: MusicVoice, peak: number, startTime: number, held: number): number {
  if (!voice.envelope) {
    // Classic: full volume at the start, fading out over the note
    param.setValueAtTime(peak, startTime);
    param.exponentialRampToValueAtTime(SILENT, startTime + held);
    return held;
  }
  for (const step of envelopeSteps(voice.envelope, peak, held)) {
    if (step.kind === "set") param.setValueAtTime(step.value, startTime + step.time);
    else if (step.kind === "linear") param.linearRampToValueAtTime(step.value, startTime + step.time);
    else param.exponentialRampToValueAtTime(step.value, startTime + step.time);
  }
  return held + releaseSeconds(voice.envelope);
}

function addVibrato(ctx: BaseAudioContext, osc: OscillatorNode, vibrato: MusicVibrato, startTime: number, endTime: number) {
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(vibrato.rate, startTime);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, startTime + vibrato.delay);
  depth.gain.linearRampToValueAtTime(vibrato.depth, startTime + vibrato.delay + VIBRATO_FADE);
  lfo.connect(depth);
  depth.connect(osc.detune);
  lfo.start(startTime);
  lfo.stop(endTime);
}

/** Schedule one note on the channel's voice; Play, the placing preview and WAV export all come through here. */
export function scheduleNote(
  ctx: BaseAudioContext,
  destination: AudioNode,
  note: MusicNote,
  voice: MusicVoice,
  volume: number,
  when: number,
  beatDuration: number
): AudioScheduledSourceNode {
  const startTime = when + note.start * beatDuration;
  const held = note.duration * beatDuration;
  const gain = ctx.createGain();
  const dur = applyEnvelope(gain.gain, voice, volume * note.velocity * 0.3, startTime, held);
  gain.connect(destination);

  if (voice.instrument === "noise") {
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, dur);
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = midiToFreq(note.pitch);
    bpf.Q.value = 1;
    src.connect(bpf);
    bpf.connect(gain);
    src.start(startTime);
    src.stop(startTime + dur);
    return src;
  }
  const osc = ctx.createOscillator();
  osc.type = voice.instrument as OscillatorType;
  osc.frequency.setValueAtTime(midiToFreq(note.pitch), startTime);
  if (voice.vibrato && voice.vibrato.depth > 0) addVibrato(ctx, osc, voice.vibrato, startTime, startTime + dur);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + dur);
  return osc;
}

export function trackLengthSeconds(track: MusicTrack): number {
  if (getSections(track).length > 1) {
    const beats = songSteps(track, "song", getSections(track)[0].id).steps.reduce((total, step) => total + step.length, 0);
    return (beats * 60) / track.bpm;
  }
  let lastBeat = 0;
  for (const channel of track.channels) {
    for (const note of channel.patterns[0]?.notes ?? []) {
      lastBeat = Math.max(lastBeat, note.start + note.duration);
    }
  }
  return (lastBeat * 60) / track.bpm;
}
