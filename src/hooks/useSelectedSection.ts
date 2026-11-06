"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resolveSelectedSection } from "@/lib/music-sections";
import type { MusicSection, MusicTrack } from "@/types";

const SECTION_PARAM = "section";

export interface SelectedSection {
  /** The open section of `track`; falls back to the first when the chosen one is gone (deleted, undone). */
  section: MusicSection | null;
  /** The `&section=` the page was loaded with, so a re-mount reopens it. */
  initialId: string | null;
  select(id: string | null): void;
}

/** The Music section open in the piano roll, mirrored in the URL as `&section=<id>` (other parameters stay). */
export function useSelectedSection(track: MusicTrack | null): SelectedSection {
  const searchParams = useSearchParams();
  const [initialId] = useState(() => searchParams.get(SECTION_PARAM));
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const section = track ? resolveSelectedSection(track, selectedId) : null;
  const sectionId = section?.id;

  useEffect(() => {
    if (!sectionId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(SECTION_PARAM) === sectionId) return;
    url.searchParams.set(SECTION_PARAM, sectionId);
    window.history.replaceState(window.history.state, "", url);
  }, [sectionId]);

  return { section, initialId, select: setSelectedId };
}
