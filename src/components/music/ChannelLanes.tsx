"use client";

import { useEffect, useState } from "react";
import { Link } from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import { createLongPress } from "@/lib/long-press";
import type { Point } from "@/lib/menu-position";
import { buildCellMenu, type CellMenuActions } from "@/lib/music-section-menu";
import { assignPattern, findPattern, getSections, patternLabel, patternUses, unlinkPattern } from "@/lib/music-sections";
import type { MusicChannel, MusicSection, MusicTrack } from "@/types";

/** Width of the name column at the left of every lane (and of the "Sections" label above them). */
export const LANE_LABEL_WIDTH = 72;

export interface ChannelLanesProps {
  track: MusicTrack;
  selectedId: string;
  activeChannelIndex: number;
  /** Cell width per beat; the same as the blocks above, so cells line up with their section. */
  beatWidth: number;
  onChange(track: MusicTrack, selectId?: string): void;
  onSelectCell(sectionId: string, channelIndex: number): void;
}

interface OpenMenu {
  anchor: Point;
  entries: ContextMenuEntry[];
  label: string;
}

export function LaneLabel({ text }: { text: string }): React.JSX.Element {
  return (
    <span
      className="sticky left-0 z-10 shrink-0 self-stretch flex items-center pr-1 text-[11px] truncate"
      style={{ width: LANE_LABEL_WIDTH, background: "var(--bg-secondary)", color: "var(--text-muted)" }}
      title={text}
    >
      {text}
    </span>
  );
}

function useCellActions(props: ChannelLanesProps): (section: MusicSection, channelIndex: number) => CellMenuActions {
  const { track, onChange, onSelectCell } = props;
  return (section, channelIndex) => {
    const channelId = track.channels[channelIndex].id;
    const apply = (next: MusicTrack) => {
      onChange(next, section.id);
      onSelectCell(section.id, channelIndex);
    };
    return {
      usePattern: (patternId) => apply(assignPattern(track, section.id, channelId, patternId)),
      newPattern: () => apply(assignPattern(track, section.id, channelId, "new")),
      makeSilent: () => apply(assignPattern(track, section.id, channelId, null)),
      unlink: () => apply(unlinkPattern(track, section.id, channelId)),
    };
  };
}

/** Advanced view: one lane per channel under the blocks, showing which pattern each channel plays in each section. */
export function ChannelLanes(props: ChannelLanesProps): React.JSX.Element {
  const { track } = props;
  const sections = getSections(track);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const actionsFor = useCellActions(props);
  const [pressed] = useState((): { openMenu(point: Point): void } => ({ openMenu: () => {} }));
  const [longPress] = useState(() => createLongPress((point) => pressed.openMenu(point)));
  useEffect(() => () => longPress.cancel(), [longPress]);

  const openCellMenu = (section: MusicSection, channelIndex: number, anchor: Point) => {
    const channel = track.channels[channelIndex];
    const entries = buildCellMenu(track, section.id, channel.id, actionsFor(section, channelIndex));
    setMenu({ anchor, entries, label: `${channel.name} in ${section.name}` });
  };

  const cellHandlers = (section: MusicSection, channelIndex: number): React.HTMLAttributes<HTMLElement> => ({
    onPointerDown: (event) => {
      pressed.openMenu = (point) => openCellMenu(section, channelIndex, point);
      longPress.down({ x: event.clientX, y: event.clientY, pointerType: event.pointerType });
    },
    onPointerMove: (event) => longPress.move({ x: event.clientX, y: event.clientY }),
    onPointerUp: () => longPress.up(),
    onPointerCancel: () => longPress.cancel(),
    onClick: () => {
      if (!longPress.consumeClick()) props.onSelectCell(section.id, channelIndex);
    },
    onContextMenu: (event) => {
      event.preventDefault();
      openCellMenu(section, channelIndex, { x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openCellMenu(section, channelIndex, { x: rect.left, y: rect.bottom + 4 });
    },
  });

  return (
    <div className="flex flex-col gap-1 mt-1 w-max px-4 max-md:px-2" aria-label="Channels in each section" data-channel-lanes>
      {track.channels.map((channel, channelIndex) => (
        <div key={channel.id} className="flex items-center gap-1" data-channel-lane={channel.name}>
          <LaneLabel text={channel.name} />
          {sections.map((section) => (
            <LaneCell
              key={section.id}
              track={track}
              section={section}
              channel={channel}
              width={section.length * (section.repeat ?? 1) * props.beatWidth}
              isSelected={section.id === props.selectedId && channelIndex === props.activeChannelIndex}
              handlers={cellHandlers(section, channelIndex)}
            />
          ))}
        </div>
      ))}
      {menu && <ContextMenu anchor={menu.anchor} entries={menu.entries} label={menu.label} onClose={() => setMenu(null)} />}
    </div>
  );
}

interface LaneCellProps {
  track: MusicTrack;
  section: MusicSection;
  channel: MusicChannel;
  width: number;
  isSelected: boolean;
  handlers: React.HTMLAttributes<HTMLElement>;
}

function LaneCell({ track, section, channel, width, isSelected, handlers }: LaneCellProps): React.JSX.Element {
  const pattern = findPattern(track, section, channel.id);
  const label = pattern ? patternLabel(track, channel.id, pattern.id) : null;
  const isLinked = pattern ? patternUses(track, pattern.id).length > 1 : false;
  const description = label ? `pattern ${label}${isLinked ? ", linked" : ""}` : "silent";
  return (
    <button
      type="button"
      {...handlers}
      data-lane-cell
      className="shrink-0 h-6 rounded flex items-center gap-1 px-1.5 text-[11px] tabular-nums select-none overflow-hidden"
      style={{
        width,
        background: label ? "var(--bg-hover)" : "transparent",
        border: "1px solid var(--border)",
        outline: isSelected ? "2px solid var(--accent)" : undefined,
        outlineOffset: -1,
        color: label ? "var(--text-primary)" : "var(--text-muted)",
        touchAction: "pan-x",
      }}
      aria-pressed={isSelected}
      aria-label={`${channel.name} in ${section.name}: ${description}`}
      title={`${channel.name} in ${section.name}: click to edit. Right-click or long-press to change the pattern.`}
    >
      <span className="truncate">{label ?? "—"}</span>
      {isLinked && <Link className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
    </button>
  );
}
