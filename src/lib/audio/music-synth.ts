import type { MusicNote, MusicTrack } from "@/types";

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

export function scheduleNote(
  ctx: BaseAudioContext,
  destination: AudioNode,
  note: MusicNote,
  instrument: string,
  volume: number,
  when: number,
  beatDuration: number
): AudioScheduledSourceNode {
  const startTime = when + note.start * beatDuration;
  const dur = note.duration * beatDuration;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * note.velocity * 0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
  gain.connect(destination);

  if (instrument === "noise") {
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
  osc.type = instrument as OscillatorType;
  osc.frequency.setValueAtTime(midiToFreq(note.pitch), startTime);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + dur);
  return osc;
}

export function trackLengthSeconds(track: MusicTrack): number {
  let lastBeat = 0;
  for (const channel of track.channels) {
    for (const note of channel.patterns[0]?.notes ?? []) {
      lastBeat = Math.max(lastBeat, note.start + note.duration);
    }
  }
  return (lastBeat * 60) / track.bpm;
}
