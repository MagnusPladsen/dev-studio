/** Vorbis quality on the encoder's -1..10 scale; 6 is quality 0.6 on Vorbis' -0.1..1 scale. */
const VORBIS_QUALITY = 6;
const FRAMES_PER_CHUNK = 16384;

type OggEncoder = Awaited<ReturnType<typeof import("wasm-media-encoders").createOggEncoder>>;

async function loadOggEncoder(): Promise<OggEncoder> {
  try {
    const { createOggEncoder } = await import("wasm-media-encoders");
    return await createOggEncoder();
  } catch {
    throw new Error("Could not load the OGG encoder. Check your connection and try again.");
  }
}

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function encodeAll(encoder: OggEncoder, samples: Float32Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < samples.length; start += FRAMES_PER_CHUNK) {
    // The encoder owns the returned buffer and reuses it, so each chunk is copied.
    chunks.push(encoder.encode([samples.subarray(start, start + FRAMES_PER_CHUNK)]).slice());
  }
  chunks.push(encoder.finalize().slice());
  return joinChunks(chunks);
}

/** Encodes mono PCM to Ogg Vorbis (VBR quality 0.6). The encoder is downloaded on the first call. */
export async function encodeOgg(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
  const encoder = await loadOggEncoder();
  try {
    encoder.configure({ channels: 1, sampleRate, vbrQuality: VORBIS_QUALITY });
    return encodeAll(encoder, samples);
  } catch {
    throw new Error("Could not encode the audio as OGG.");
  }
}
