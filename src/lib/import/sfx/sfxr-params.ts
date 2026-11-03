import { ImportError } from "@/lib/import/types";

/** jsfxr's settings object: `wave_type` plus `p_*` sliders on 0–1 (or −1–1 for the signed ones), and `sound_vol`. */
export type SfxrParams = Record<(typeof SFXR_PARAM_ORDER)[number], number> & { sound_vol: number };

/** The order jsfxr packs its sliders in for its base58 ("b58") strings and sfxr.me links. */
export const SFXR_PARAM_ORDER = [
  "wave_type",
  "p_env_attack",
  "p_env_sustain",
  "p_env_punch",
  "p_env_decay",
  "p_base_freq",
  "p_freq_limit",
  "p_freq_ramp",
  "p_freq_dramp",
  "p_vib_strength",
  "p_vib_speed",
  "p_arp_mod",
  "p_arp_speed",
  "p_duty",
  "p_duty_ramp",
  "p_repeat_speed",
  "p_pha_offset",
  "p_pha_ramp",
  "p_lpf_freq",
  "p_lpf_ramp",
  "p_lpf_resonance",
  "p_hpf_freq",
  "p_hpf_ramp",
] as const;

/** jsfxr's defaults, for keys a file leaves out. */
export const SFXR_DEFAULTS: SfxrParams = {
  ...(Object.fromEntries(SFXR_PARAM_ORDER.map((key) => [key, 0])) as Record<(typeof SFXR_PARAM_ORDER)[number], number>),
  p_env_sustain: 0.3,
  p_env_decay: 0.4,
  p_base_freq: 0.3,
  p_lpf_freq: 1,
  sound_vol: 0.5,
};

export const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** One byte for the wave type, then each slider as a little-endian 32-bit float. */
const PACKED_LENGTH = 1 + (SFXR_PARAM_ORDER.length - 1) * 4;

function decodeBase58(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    for (; carry > 0; carry >>= 8) bytes.push(carry & 0xff);
  }
  for (let i = 0; i < text.length && text[i] === "1"; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

/** Reads a jsfxr b58 string, or an sfxr.me / jsfxr link whose `#` part is one. */
export function decodeSfxrB58(text: string): SfxrParams {
  const code = text.includes("#") ? text.slice(text.lastIndexOf("#") + 1) : text;
  const bytes = decodeBase58(code.trim());
  if (!bytes || bytes.length !== PACKED_LENGTH) throw new ImportError("This isn't an sfxr sound. Paste a jsfxr JSON object, a b58 code or an sfxr.me link into the file.");
  const view = new DataView(bytes.buffer);
  const params = { ...SFXR_DEFAULTS, wave_type: bytes[0] };
  SFXR_PARAM_ORDER.slice(1).forEach((key, index) => (params[key] = view.getFloat32(1 + index * 4, true)));
  return params;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Is this a jsfxr settings object (it has `wave_type` or any `p_*` slider)? */
export function isSfxrObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).some((key) => key === "wave_type" || key.startsWith("p_"));
}

/** A jsfxr settings object with every slider filled in. Non-numbers and NaN fall back to jsfxr's defaults. */
export function readSfxrObject(value: Record<string, unknown>): SfxrParams {
  const params = { ...SFXR_DEFAULTS };
  for (const key of [...SFXR_PARAM_ORDER, "sound_vol"] as const) {
    const entry = typeof value[key] === "string" ? Number(value[key]) : value[key];
    if (typeof entry === "number" && Number.isFinite(entry)) params[key] = entry;
  }
  return params;
}
