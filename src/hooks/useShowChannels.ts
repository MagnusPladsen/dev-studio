"use client";

import { useState } from "react";

const SHOW_CHANNELS_KEY = "music.showChannels";

function readShowChannels(): boolean {
  try {
    return localStorage.getItem(SHOW_CHANNELS_KEY) === "true";
  } catch {
    return false;
  }
}

/** Music's "Show channels" view: a preference kept in this browser, not in the song. */
export function useShowChannels(): { showChannels: boolean; toggleChannels(): void } {
  const [showChannels, setShowChannels] = useState(readShowChannels);
  const toggleChannels = (): void => {
    const next = !showChannels;
    setShowChannels(next);
    try {
      localStorage.setItem(SHOW_CHANNELS_KEY, String(next));
    } catch {}
  };
  return { showChannels, toggleChannels };
}
