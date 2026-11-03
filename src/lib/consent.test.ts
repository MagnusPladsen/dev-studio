import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, hasAnalyticsConsent, readConsent, subscribeConsent, writeConsent } from "./consent";

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analytics consent", () => {
  it("counts no choice as no", () => {
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("allows analytics only after a yes, and a later no takes it back", () => {
    writeConsent("granted");
    expect(hasAnalyticsConsent()).toBe(true);
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("ignores values it didn't write", () => {
    localStorage.setItem(CONSENT_KEY, "yes");
    expect(readConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("counts blocked storage as no", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("tells subscribers about a new choice", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);
    writeConsent("granted");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeConsent("denied");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
