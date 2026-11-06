"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Plus, Repeat, Rows3 } from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import { ChannelLanes, LaneLabel } from "@/components/music/ChannelLanes";
import { createLongPress, type LongPress } from "@/lib/long-press";
import type { Point } from "@/lib/menu-position";
import { buildSectionMenu, type SectionMenuActions } from "@/lib/music-section-menu";
import { addSection, deleteSection, getSections, moveSection, patternUses, setLoopStart, updateSection } from "@/lib/music-sections";
import type { MusicSection, MusicTrack } from "@/types";

export interface SongRowProps {
  track: MusicTrack;
  selectedId: string;
  /** The block that is sounding and how far through it playback is (0–1), or null when stopped. */
  playing: { sectionId: string; progress: number } | null;
  showChannels: boolean;
  /** The channel open in the piano roll; its cell in the open section is highlighted in the lanes. */
  activeChannelIndex: number;
  onSelect(sectionId: string): void;
  /** A section edit; `selectId` is the section to open afterwards. */
  onChange(track: MusicTrack, selectId?: string): void;
  onToggleChannels(): void;
  onSelectCell(sectionId: string, channelIndex: number): void;
}

/** Block width per beat, so the row reads as a timeline. */
const BLOCK_BEAT_PX = 7;
const DRAG_THRESHOLD_PX = 4;

interface OpenMenu {
  anchor: Point;
  entries: ContextMenuEntry[];
  label: string;
}

/** One section: only an "Add section" button. Two or more: the row of blocks, ending with that button. */
export function SongRow(props: SongRowProps): React.JSX.Element {
  if (getSections(props.track).length <= 1) {
    return <AddSectionButton track={props.track} selectedId={props.selectedId} onChange={props.onChange} />;
  }
  return <SectionBlocks {...props} />;
}

function useMenu(): { menu: OpenMenu | null; open(menu: OpenMenu): void; close(): void } {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const close = useCallback(() => setMenu(null), []);
  return { menu, open: setMenu, close };
}

function AddSectionButton({ track, selectedId, onChange }: Pick<SongRowProps, "track" | "selectedId" | "onChange">): React.JSX.Element {
  const { menu, open, close } = useMenu();
  const selected = getSections(track).find((section) => section.id === selectedId) ?? getSections(track)[0];
  const add = (mode: "copy" | "empty") => {
    const result = addSection(track, selected.id, mode);
    onChange(result.track, result.sectionId);
  };
  const entries: ContextMenuEntry[] = [
    { kind: "item", key: "copy", label: `Copy of ${selected.name}`, onSelect: () => add("copy") },
    { kind: "item", key: "empty", label: "Empty", onSelect: () => add("empty") },
  ];
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          open({ anchor: { x: rect.left, y: rect.bottom + 4 }, entries, label: "Add section" });
        }}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs shrink-0"
        style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
        aria-haspopup="menu"
      >
        <Plus className="w-3 h-3" /> Add section
      </button>
      {menu && <ContextMenu anchor={menu.anchor} entries={menu.entries} label={menu.label} onClose={close} />}
    </>
  );
}

function moveSectionTo(track: MusicTrack, id: string, from: number, to: number): MusicTrack {
  const delta = to > from ? 1 : -1;
  let moved = track;
  for (let index = from; index !== to; index += delta) moved = moveSection(moved, id, delta);
  return moved;
}

function isLinked(track: MusicTrack, section: MusicSection): boolean {
  return section.patterns.some((entry) => patternUses(track, entry.patternId).length > 1);
}

function buildSectionActions(props: SongRowProps, startRename: (id: string) => void): (section: MusicSection) => SectionMenuActions {
  const { track, selectedId, onChange } = props;
  return (section) => ({
    rename: () => startRename(section.id),
    duplicate: () => {
      const result = addSection(track, section.id, "copy");
      onChange(result.track, result.sectionId);
    },
    setRepeat: (count) => {
      if ((section.repeat ?? 1) !== count) onChange(updateSection(track, section.id, { repeat: count }));
    },
    loopFromHere: () => onChange(setLoopStart(track, section.id)),
    move: (delta) => onChange(moveSection(track, section.id, delta)),
    remove: () => {
      const sections = getSections(track);
      const index = sections.findIndex((candidate) => candidate.id === section.id);
      const remaining = sections.filter((candidate) => candidate.id !== section.id);
      const neighbour = remaining[Math.min(index, remaining.length - 1)];
      onChange(deleteSection(track, section.id), section.id === selectedId ? neighbour.id : undefined);
    },
  });
}

interface DragState {
  id: string;
  startX: number;
  isActive: boolean;
}

/** Drag a block with the mouse to reorder; touch uses Move left / right in the block menu. */
function useBlockDrag(track: MusicTrack, onChange: SongRowProps["onChange"]) {
  const dragRef = useRef<DragState | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const sections = getSections(track);

  const start = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.pointerType === "mouse" && event.button === 0) dragRef.current = { id, startX: event.clientX, isActive: false };
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.isActive && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
    if (!drag.isActive) event.currentTarget.setPointerCapture(event.pointerId);
    drag.isActive = true;
    setDropIndex(slotAt(event.currentTarget, event.clientX));
  };
  /** Ends the drag; true when it was a real drag, so the click that follows is not a select. */
  const end = (): boolean => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDropIndex(null);
    if (!drag?.isActive || dropIndex === null) return Boolean(drag?.isActive);
    const from = sections.findIndex((section) => section.id === drag.id);
    const to = dropIndex > from ? dropIndex - 1 : dropIndex;
    if (to !== from) onChange(moveSectionTo(track, drag.id, from, to));
    return true;
  };
  const cancel = () => {
    dragRef.current = null;
    setDropIndex(null);
  };
  return { dropIndex, start, move, end, cancel };
}

/** Where a dragged block would land: how many blocks of the row have their middle left of `clientX`. */
function slotAt(element: HTMLElement, clientX: number): number {
  const blocks = element.closest("[data-song-row]")?.querySelectorAll("[data-section-block]") ?? [];
  return Array.from(blocks).filter((block) => {
    const rect = block.getBoundingClientRect();
    return rect.left + rect.width / 2 < clientX;
  }).length;
}

/** One long-press controller for the row; the block pressed last decides which menu opens. */
function createPressTracker(): { pressed: { openMenu(point: Point): void }; longPress: LongPress } {
  const pressed: { openMenu(point: Point): void } = { openMenu: () => {} };
  return { pressed, longPress: createLongPress((point) => pressed.openMenu(point)) };
}

function SectionBlocks(props: SongRowProps): React.JSX.Element {
  const { track, selectedId, playing, onSelect } = props;
  const sections = getSections(track);
  const { menu, open, close } = useMenu();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const actionsFor = buildSectionActions(props, setRenamingId);
  const drag = useBlockDrag(track, props.onChange);
  const isClickSuppressed = useRef(false);
  const [{ pressed, longPress }] = useState(createPressTracker);
  useEffect(() => () => longPress.cancel(), [longPress]);

  const openSectionMenu = (section: MusicSection, anchor: Point) =>
    open({ anchor, entries: buildSectionMenu(track, section.id, actionsFor(section)), label: `Section ${section.name}` });
  const loopStartId = sections.some((section) => section.id === track.loopStartId) ? track.loopStartId : sections[0].id;

  const blockHandlers = (section: MusicSection) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      pressed.openMenu = (point) => openSectionMenu(section, point);
      longPress.down({ x: event.clientX, y: event.clientY, pointerType: event.pointerType });
      drag.start(event, section.id);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      longPress.move({ x: event.clientX, y: event.clientY });
      drag.move(event);
    },
    onPointerUp: () => {
      longPress.up();
      isClickSuppressed.current = drag.end();
    },
    onPointerCancel: () => {
      longPress.cancel();
      drag.cancel();
    },
    onClick: () => {
      const wasLongPress = longPress.consumeClick();
      if (wasLongPress || isClickSuppressed.current) return void (isClickSuppressed.current = false);
      onSelect(section.id);
    },
    onDoubleClick: () => setRenamingId(section.id),
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      openSectionMenu(section, { x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openSectionMenu(section, { x: rect.left, y: rect.bottom + 4 });
    },
  });

  return (
    <div className="flex items-start border-b shrink-0" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }} data-song-row>
      <div className="flex-1 min-w-0 overflow-x-auto py-1.5">
        <div className="flex items-center gap-1 w-max px-4 max-md:px-2" aria-label="Song sections">
          {props.showChannels && <LaneLabel text="Sections" />}
          {sections.map((section, index) => (
            <SectionBlock
              key={section.id}
              section={section}
              isSelected={section.id === selectedId}
              isLoopStart={section.id === loopStartId}
              isLinked={isLinked(track, section)}
              progress={playing?.sectionId === section.id ? playing.progress : null}
              dropEdge={drag.dropIndex === index ? "left" : drag.dropIndex === sections.length && index === sections.length - 1 ? "right" : null}
              isRenaming={renamingId === section.id}
              onRename={(name) => {
                setRenamingId(null);
                const trimmed = name.trim();
                if (trimmed && trimmed !== section.name) props.onChange(updateSection(track, section.id, { name: trimmed }));
              }}
              onCancelRename={() => setRenamingId(null)}
              handlers={blockHandlers(section)}
            />
          ))}
          <AddSectionButton track={track} selectedId={selectedId} onChange={props.onChange} />
        </div>
        {props.showChannels && (
          <ChannelLanes
            track={track}
            selectedId={selectedId}
            activeChannelIndex={props.activeChannelIndex}
            beatWidth={BLOCK_BEAT_PX}
            onChange={props.onChange}
            onSelectCell={props.onSelectCell}
          />
        )}
      </div>
      <ShowChannelsButton isOn={props.showChannels} onToggle={props.onToggleChannels} />
      {menu && <ContextMenu anchor={menu.anchor} entries={menu.entries} label={menu.label} onClose={close} />}
    </div>
  );
}

function ShowChannelsButton({ isOn, onToggle }: { isOn: boolean; onToggle(): void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 px-2 py-0.5 my-2.5 mr-4 max-md:mr-2 max-md:ml-1 max-md:py-1.5 rounded text-xs shrink-0"
      style={{
        color: "var(--text-primary)",
        border: `1px solid ${isOn ? "var(--accent)" : "var(--border)"}`,
        background: isOn ? "var(--bg-hover)" : undefined,
      }}
      aria-pressed={isOn}
      aria-label="Show channels"
      title={isOn ? "Hide the channel lanes" : "See and change which pattern each channel plays in each section"}
    >
      <Rows3 className="w-3 h-3" /> <span className="max-md:hidden">Show channels</span>
    </button>
  );
}

interface SectionBlockProps {
  section: MusicSection;
  isSelected: boolean;
  isLoopStart: boolean;
  isLinked: boolean;
  /** How far through this block playback is (0–1), or null when it is not sounding. */
  progress: number | null;
  dropEdge: "left" | "right" | null;
  isRenaming: boolean;
  onRename(name: string): void;
  onCancelRename(): void;
  handlers: React.HTMLAttributes<HTMLElement>;
}

function dropShadow(edge: SectionBlockProps["dropEdge"]): string | undefined {
  if (edge === "left") return "-3px 0 0 var(--accent)";
  if (edge === "right") return "3px 0 0 var(--accent)";
  return undefined;
}

function SectionBlock(props: SectionBlockProps): React.JSX.Element {
  const { section, isSelected, progress } = props;
  const beats = section.length * (section.repeat ?? 1);
  return (
    <div
      data-section-block
      className="relative shrink-0 h-9 rounded-md overflow-hidden"
      style={{
        width: beats * BLOCK_BEAT_PX,
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        outline: isSelected ? "2px solid var(--accent)" : undefined,
        outlineOffset: -1,
        boxShadow: dropShadow(props.dropEdge),
      }}
    >
      {progress !== null && (
        <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${progress * 100}%`, background: "var(--accent)", opacity: 0.3 }} data-progress />
      )}
      {props.isRenaming ? <RenameInput name={section.name} onRename={props.onRename} onCancel={props.onCancelRename} /> : <BlockButton {...props} />}
    </div>
  );
}

function blockLabel({ section, isLoopStart, isLinked }: Pick<SectionBlockProps, "section" | "isLoopStart" | "isLinked">): string {
  const repeat = section.repeat ?? 1;
  const parts = [`Section ${section.name}`];
  if (repeat > 1) parts.push(`plays ${repeat} times`);
  if (isLoopStart) parts.push("song loops from here");
  if (isLinked) parts.push("shares notes with another section");
  return parts.join(", ");
}

function BlockButton({ section, isSelected, isLoopStart, isLinked, handlers }: SectionBlockProps): React.JSX.Element {
  const repeat = section.repeat ?? 1;
  return (
    <button
      type="button"
      {...handlers}
      className="relative w-full h-full flex items-center gap-1 px-1.5 text-xs select-none"
      style={{ color: "var(--text-primary)", touchAction: "pan-x" }}
      aria-pressed={isSelected}
      aria-label={blockLabel({ section, isLoopStart, isLinked })}
      title={`${section.name}: click to edit. Right-click or long-press for more, drag to move.`}
    >
      <span className="truncate font-medium">{section.name}</span>
      {repeat > 1 && (
        <span className="shrink-0 px-1 rounded text-[10px] tabular-nums" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
          ×{repeat}
        </span>
      )}
      {isLoopStart && (
        <span className="shrink-0" title="The song loops from here" aria-label="The song loops from here">
          <Repeat className="w-3 h-3" style={{ color: "var(--accent)" }} />
        </span>
      )}
      {isLinked && (
        <span className="shrink-0" title="Shares notes with another section" aria-label="Shares notes with another section">
          <Link className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
        </span>
      )}
    </button>
  );
}

function RenameInput({ name, onRename, onCancel }: { name: string; onRename(name: string): void; onCancel(): void }): React.JSX.Element {
  const isCancelled = useRef(false);
  return (
    <input
      className="relative w-full h-full bg-transparent text-xs font-medium outline-none px-1.5"
      style={{ color: "var(--text-primary)" }}
      defaultValue={name}
      maxLength={24}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      aria-label="Section name"
      onBlur={(event) => (isCancelled.current ? onCancel() : onRename(event.currentTarget.value))}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          isCancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
