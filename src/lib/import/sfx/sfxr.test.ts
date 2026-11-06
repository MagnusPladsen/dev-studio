import { describe, expect, it } from "vitest";
import { findImporter, runImporter } from "@/lib/import";
import { textFile } from "@/lib/import/test-helpers";
import { SFX_IMPORTERS } from "./index";
import { sfxrImporter } from "./sfxr";
import { BASE58_ALPHABET, SFXR_DEFAULTS, SFXR_PARAM_ORDER, type SfxrParams } from "./sfxr-params";

// A hand-tuned laser as jsfxr's "Copy JSON" writes it.
const LASER: SfxrParams = {
  ...SFXR_DEFAULTS,
  wave_type: 1,
  p_env_attack: 0,
  p_env_sustain: 0.2,
  p_env_decay: 0.4,
  p_base_freq: 0.5,
  p_freq_ramp: -0.3,
  p_lpf_freq: 0.8,
  p_lpf_resonance: 0.25,
  p_hpf_freq: 0.1,
  sound_vol: 0.25,
};

/** jsfxr's b58 layout: the wave type byte, then every slider as a little-endian float32, in base58. */
function toB58(params: SfxrParams): string {
  const bytes = new Uint8Array(1 + (SFXR_PARAM_ORDER.length - 1) * 4);
  const view = new DataView(bytes.buffer);
  bytes[0] = params.wave_type;
  SFXR_PARAM_ORDER.slice(1).forEach((key, index) => view.setFloat32(1 + index * 4, params[key], true));
  const [zero, base] = [BigInt(0), BigInt(58)];
  let number = bytes.reduce((value, byte) => value * BigInt(256) + BigInt(byte), zero);
  let text = "";
  for (; number > zero; number /= base) text = BASE58_ALPHABET[Number(number % base)] + text;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) text = "1" + text;
  return text;
}

async function importParams(text: string, name = "laser.json") {
  const outcome = await runImporter(sfxrImporter, textFile(text, name));
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.result;
}

describe("sfxr import", () => {
  it("maps a jsfxr JSON object onto the SFX parameters", async () => {
    const { items, warnings } = await importParams(JSON.stringify({ oldParams: true, ...LASER, sample_rate: 44100, sample_size: 8 }));
    expect(items[0].name).toBe("laser");
    expect(items[0].params).toEqual({
      waveType: "sawtooth",
      frequency: 886,
      frequencySlide: expect.closeTo(-0.927, 3),
      repeatSpeed: 0,
      attackTime: 0,
      sustainTime: 0.091,
      decayTime: 0.363,
      hpFilterCutoff: 0.1,
      lpFilterCutoff: 0.8,
      lpFilterResonance: 0.25,
      volume: 0.28,
      vibratoDepth: 0,
      vibratoSpeed: 0,
      version: 2,
    });
    expect(warnings).toEqual([]);
  });

  it("reads b58 codes and sfxr.me links, one sound per line", async () => {
    const code = toB58(LASER);
    const blip = toB58({ ...SFXR_DEFAULTS, wave_type: 2, p_base_freq: 0.35173364 });
    const { items } = await importParams(`${code}\nhttps://sfxr.me/#${blip}\n`, "sounds.txt");
    expect(items.map((sound) => [sound.name, sound.params.waveType])).toEqual([["sounds 1", "sawtooth"], ["sounds 2", "sine"]]);
    expect(items[0].params.frequency).toBe(886);
    expect(items[1].params.frequency).toBe(440);
    expect(toB58({ ...SFXR_DEFAULTS })[0]).toBe("1");
    expect((await importParams(toB58({ ...SFXR_DEFAULTS }), "default.txt")).items[0].params.waveType).toBe("square");
  });

  it("warns about sfxr features this tool doesn't have", async () => {
    const { warnings } = await importParams(JSON.stringify({ ...LASER, wave_type: 0, p_freq_ramp: 0, p_env_punch: 0.4, p_duty: 0.3, p_pha_offset: 0.2, p_env_decay: 1 }));
    expect(warnings).toEqual([
      "Capped to this tool's ranges: decay time.",
      "This tool has no sustain punch, square duty, flanger; those parts of the sound are left out.",
    ]);
  });

  it("rejects text that isn't sfxr, and too-big files", async () => {
    expect(await runImporter(sfxrImporter, textFile("hello there", "notes.txt"))).toEqual({ ok: false, message: expect.stringContaining("isn't an sfxr sound") });
    expect(await runImporter(sfxrImporter, textFile('{"nodes":[]}'))).toEqual({ ok: false, message: expect.stringContaining("isn't an sfxr sound") });
    expect(await runImporter(sfxrImporter, textFile(" ".repeat(256 * 1024 + 1), "big.txt"))).toEqual({ ok: false, message: expect.stringContaining("is too big") });
  });

  it("is picked for dropped jsfxr JSON, while the app's own sound JSON goes to its re-importer", async () => {
    expect((await findImporter(SFX_IMPORTERS, textFile(JSON.stringify(LASER))))?.id).toBe("sfxr");
    const params = { waveType: "square", frequency: 300, frequencySlide: 0.25, repeatSpeed: 0, sustainTime: 0.08, decayTime: 0.2, attackTime: 0, hpFilterCutoff: 0, lpFilterCutoff: 1, lpFilterResonance: 0, volume: 0.5, vibratoDepth: 0, vibratoSpeed: 0 };
    const own = { id: "s", name: "Jump", params };
    expect((await findImporter(SFX_IMPORTERS, textFile(JSON.stringify(own))))?.id).toBe("sound-json");
  });
});
