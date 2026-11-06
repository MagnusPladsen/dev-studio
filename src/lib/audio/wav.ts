const HEADER_BYTES = 44;

export type WavBitDepth = 8 | 16;

/**
 * Mono PCM WAV, 16-bit (default) or 8-bit. Samples outside -1..1 are clipped.
 * 8-bit WAV is unsigned with silence at 128, as the format requires.
 */
export function encodeWav(samples: Float32Array, sampleRate: number, bitDepth: WavBitDepth = 16): ArrayBuffer {
  const bytesPerSample = bitDepth / 8;
  const dataBytes = samples.length * bytesPerSample;
  const wav = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(wav);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    if (bitDepth === 8) view.setUint8(HEADER_BYTES + i, Math.round(sample * 127) + 128);
    else view.setInt16(HEADER_BYTES + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return wav;
}

/** Changes the sample rate by linear interpolation; the sound keeps its length and pitch. */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const step = fromRate / toRate;
  const out = new Float32Array(Math.max(1, Math.round(samples.length / step)));
  for (let i = 0; i < out.length; i++) {
    const position = i * step;
    const index = Math.min(Math.floor(position), samples.length - 1);
    const next = samples[Math.min(index + 1, samples.length - 1)];
    out[i] = samples[index] + (next - samples[index]) * (position - index);
  }
  return out;
}
