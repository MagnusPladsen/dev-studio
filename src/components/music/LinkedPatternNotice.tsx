"use client";

import { Link } from "lucide-react";
import { findPattern, patternUses, unlinkPattern } from "@/lib/music-sections";
import type { MusicSection, MusicTrack } from "@/types";

interface LinkedPatternNoticeProps {
  track: MusicTrack;
  section: MusicSection;
  channelId: string;
  /** Show channels is on: the button may say "Unlink"; Easy mode says "Make separate". */
  showChannels: boolean;
  onChange(track: MusicTrack): void;
}

/** Above the roll: the notes being edited also play in other sections, with a way to give this one its own copy. */
export function LinkedPatternNotice({ track, section, channelId, showChannels, onChange }: LinkedPatternNoticeProps): React.JSX.Element | null {
  const pattern = findPattern(track, section, channelId);
  const otherUses = pattern ? patternUses(track, pattern.id).filter((use) => use.id !== section.id) : [];
  if (otherUses.length === 0) return null;
  return (
    <div
      className="flex items-center gap-2 px-4 max-md:px-2 py-1 border-b shrink-0 text-xs"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
      role="status"
      data-linked-notice
    >
      <Link className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      <span className="min-w-0 truncate">Also plays in {otherUses.map((use) => use.name).join(", ")}</span>
      <button
        type="button"
        onClick={() => onChange(unlinkPattern(track, section.id, channelId))}
        className="px-2 py-0.5 rounded text-xs shrink-0"
        style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
        title="Give this section its own copy, so edits here no longer change the others"
      >
        {showChannels ? "Unlink" : "Make separate"}
      </button>
    </div>
  );
}
