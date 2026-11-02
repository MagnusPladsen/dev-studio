import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeContext {
  static created = 0;
  state = "suspended";
  sampleRate = 48000;
  destination = {};
  started = 0;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  constructor() {
    FakeContext.created++;
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { connect: () => {}, start: () => this.started++ };
  }
}

async function load() {
  vi.resetModules();
  return import("./context");
}

function fakeWindow(extra: object = {}) {
  return { navigator: {} as Navigator, ...extra } as Parameters<Awaited<ReturnType<typeof load>>["getAudioContext"]>[0];
}

describe("getAudioContext", () => {
  beforeEach(() => {
    FakeContext.created = 0;
  });

  it("creates one context and reuses it", async () => {
    const { getAudioContext } = await load();
    const win = fakeWindow({ AudioContext: FakeContext });
    expect(getAudioContext(win)).toBe(getAudioContext(win));
    expect(FakeContext.created).toBe(1);
  });

  it("falls back to webkitAudioContext on older Safari", async () => {
    const { getAudioContext } = await load();
    expect(getAudioContext(fakeWindow({ webkitAudioContext: FakeContext }))).toBeInstanceOf(FakeContext);
  });

  it("resumes a suspended context and plays silence to unlock it", async () => {
    const { getAudioContext } = await load();
    const audio = getAudioContext(fakeWindow({ AudioContext: FakeContext })) as unknown as FakeContext;
    expect(audio.resume).toHaveBeenCalledOnce();
    expect(audio.started).toBe(1);
  });

  it("resumes again after iOS interrupts the context", async () => {
    const { getAudioContext } = await load();
    const win = fakeWindow({ AudioContext: FakeContext });
    const audio = getAudioContext(win) as unknown as FakeContext;
    await Promise.resolve();
    audio.state = "interrupted";
    getAudioContext(win);
    expect(audio.resume).toHaveBeenCalledTimes(2);
  });

  it("asks for a playback audio session so the silent switch does not mute it", async () => {
    const { getAudioContext } = await load();
    const audioSession = { type: "auto" };
    getAudioContext(fakeWindow({ AudioContext: FakeContext, navigator: { audioSession } }));
    expect(audioSession.type).toBe("playback");
  });
});
