"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckSquare, ExternalLink, Globe, ImagePlus, Link2, Music, Play, Square } from "lucide-react";
import type { DiagramNode } from "@/types";
import { ASSET_KINDS, assetHref, getAsset } from "@/lib/assets";
import { ASSET_ICONS } from "@/components/asset-icons";
import {
  checklistItems,
  hostname,
  imageSrc,
  itemsFromLines,
  LINK_THUMB,
  linkLook,
  linkUrl,
  nodeAsset,
  SONG_COVER,
  type LinkLook,
} from "@/lib/diagrams/cards";
import {
  embedFor,
  imageUrlFor,
  normalizeUrl,
  playerSrc,
  PROVIDER_COLORS,
  PROVIDER_NAMES,
  type AudioEmbed,
  type Embed,
  type EmbedProvider,
  type Player,
  type VideoEmbed,
} from "@/lib/diagrams/embeds";
import { GROUP_HEADER } from "@/lib/diagrams/geometry";
import { DRAWING_STROKE, drawingStroke, smoothPath } from "@/lib/diagrams/freehand";
import { polygonPoints } from "@/lib/diagrams/shapes";
import { getShape, outlineOf, shapeColor } from "@/lib/canvas-shapes";
import { v4 as uuid } from "uuid";

export interface BodyProps {
  node: DiagramNode;
  projectId: string;
  isEditing: boolean;
  isLoading: boolean;
  /** This is the one selected card, so it shows its handles (tables show one per row). */
  hasHandles: boolean;
  onCommit(patch: Partial<DiagramNode>): void;
  onCancel(): void;
  onPickImage(): void;
}

/** Marks an element whose clicks belong to it, so pressing it never starts a card drag. */
export const CONTROL = { "data-card-control": "" };

export const FIELD_STYLE: React.CSSProperties = {
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export function cardSurface(node: DiagramNode): React.CSSProperties {
  return {
    background: node.color
      ? `linear-gradient(${node.color}26, ${node.color}26), var(--bg-card)`
      : "var(--bg-card)",
    border: `1px solid ${node.color ?? "var(--border)"}`,
  };
}

/** Keeps a draft while editing; Enter-less fields commit when they lose focus, Esc throws the draft away. */
function useDraft<T>(initial: T, onCommit: (value: T) => void, onCancel: () => void) {
  const [draft, setDraft] = useState(initial);
  const isCancelled = useRef(false);
  const finish = () => (isCancelled.current ? onCancel() : onCommit(draft));
  const cancel = (event: React.KeyboardEvent<HTMLElement>) => {
    isCancelled.current = true;
    event.currentTarget.blur();
  };
  return { draft, setDraft, finish, cancel };
}

function growToFit(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function TextEditor({ value, placeholder, multiline, onCommit, onCancel, className }: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  onCommit(value: string): void;
  onCancel(): void;
  className?: string;
}) {
  const { draft, setDraft, finish, cancel } = useDraft(value, onCommit, onCancel);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    growToFit(ref.current);
    ref.current?.select();
  }, []);
  return (
    <textarea
      {...CONTROL}
      ref={ref}
      autoFocus
      rows={1}
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        growToFit(e.target);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") cancel(e);
        if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={`w-full resize-none overflow-hidden bg-transparent outline-none select-text ${className ?? ""}`}
      style={{ color: "var(--text-primary)" }}
    />
  );
}

export function ShapeBody({ node, isEditing, onCommit, onCancel }: BodyProps) {
  const shape = getShape(node.type);
  const color = shapeColor(node);
  const padding = shape.labelInset ?? "px-3";
  const clamp = shape.shapeStyle === "basic" ? "line-clamp-[8]" : "line-clamp-3";
  return (
    <div className={`relative w-full h-full flex items-center justify-center text-center ${padding}`}>
      <svg className="absolute inset-0 overflow-visible pointer-events-none" width="100%" height="100%" aria-hidden>
        <ShapeOutline node={node} color={color} />
      </svg>
      <div className={`relative w-full text-[13px] leading-4 break-words ${clamp}`} style={{ color: "var(--text-primary)" }}>
        {isEditing ? (
          <TextEditor value={node.label} placeholder="Label" onCommit={(label) => onCommit({ label })} onCancel={onCancel} className="text-center" />
        ) : (
          node.label
        )}
      </div>
    </div>
  );
}

function ShapeOutline({ node, color }: { node: DiagramNode; color: string }) {
  const outline = outlineOf(node.type, { x: 0, y: 0, width: node.width, height: node.height });
  const isBasic = getShape(node.type).shapeStyle === "basic";
  const fill = node.color && isBasic ? `${node.color}1f` : "var(--bg-card)";
  const common = { fill, stroke: color, strokeWidth: isBasic ? 2 : 1.5 };
  if (outline.kind === "polygon") return <polygon points={polygonPoints(outline.points)} {...common} />;
  if (outline.kind === "ellipse") return <ellipse cx={outline.cx} cy={outline.cy} rx={Math.max(0, outline.rx - 1)} ry={Math.max(0, outline.ry - 1)} {...common} />;
  return <rect x="0.75" y="0.75" width={outline.width - 1.5} height={outline.height - 1.5} rx={outline.radius} {...common} />;
}

export function DrawingBody({ node }: BodyProps) {
  const { points, box } = drawingStroke(node);
  const path = smoothPath(points);
  return (
    <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" viewBox={`0 0 ${box.width} ${box.height}`} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" strokeLinecap="round" style={{ pointerEvents: "stroke" }} />
      <path d={path} fill="none" stroke={shapeColor(node)} strokeWidth={DRAWING_STROKE} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NoteBody({ node, isEditing, onCommit, onCancel }: BodyProps) {
  return (
    <div className="rounded-xl px-3.5 py-3 text-sm leading-5 min-h-12 shadow-sm" style={cardSurface(node)}>
      {isEditing ? (
        <TextEditor value={node.label} placeholder="Write a note" multiline onCommit={(label) => onCommit({ label })} onCancel={onCancel} />
      ) : (
        <p className="whitespace-pre-wrap break-words" style={{ color: node.label ? "var(--text-primary)" : "var(--text-muted)" }}>
          {node.label || "Double-click to write"}
        </p>
      )}
    </div>
  );
}

/** Title and task lines edit as one: moving between the two fields keeps the editor open. */
function ChecklistEditor({ node, onCommit, onCancel }: BodyProps) {
  const items = checklistItems(node);
  const [title, setTitle] = useState(node.label);
  const [lines, setLines] = useState(items.map((item) => item.text).join("\n"));
  const isCancelled = useRef(false);
  const linesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => growToFit(linesRef.current), []);
  const finish = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (isCancelled.current) return onCancel();
    onCommit({ label: title, data: { ...node.data, items: itemsFromLines(lines.split("\n"), items, uuid) } });
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") isCancelled.current = true;
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  return (
    <div onBlur={finish}>
      <input
        {...CONTROL}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="List title"
        aria-label="List title"
        className="w-full mb-1.5 px-1 py-0.5 rounded text-sm font-semibold outline-none select-text"
        style={FIELD_STYLE}
      />
      <textarea
        {...CONTROL}
        ref={linesRef}
        autoFocus
        rows={1}
        value={lines}
        onChange={(e) => {
          setLines(e.target.value);
          growToFit(e.target);
        }}
        onKeyDown={onKeyDown}
        placeholder="One task per line"
        aria-label="Tasks, one per line"
        className="w-full resize-none overflow-hidden bg-transparent outline-none text-[13px] leading-5 px-1 rounded select-text"
        style={{ color: "var(--text-primary)" }}
      />
      <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>One task per line · ⌘/Ctrl+Enter to finish</p>
    </div>
  );
}

export function ChecklistBody(props: BodyProps) {
  const { node, isEditing, onCommit } = props;
  const items = checklistItems(node);
  const doneCount = items.filter((item) => item.done).length;
  const toggle = (id: string) =>
    onCommit({ data: { ...node.data, items: items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)) } });
  return (
    <div className="rounded-xl px-3.5 py-3 shadow-sm" style={cardSurface(node)}>
      {isEditing ? (
        <ChecklistEditor {...props} />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-sm font-semibold break-words min-w-0" style={{ color: "var(--text-primary)" }}>{node.label || "To-do"}</span>
            {items.length > 0 && <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{doneCount}/{items.length}</span>}
          </div>
          {items.length === 0 && <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Double-click to add tasks</p>}
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-[13px] leading-5">
                <button
                  {...CONTROL}
                  onClick={() => toggle(item.id)}
                  className="mt-0.5 shrink-0"
                  style={{ color: item.done ? "var(--green)" : "var(--text-muted)" }}
                  title={item.done ? "Mark as not done" : "Mark as done"}
                  aria-label={`${item.done ? "Untick" : "Tick"} ${item.text}`}
                  aria-pressed={item.done}
                >
                  {item.done ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
                <span
                  className="break-words min-w-0"
                  style={{ color: item.done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: item.done ? "line-through" : undefined }}
                >
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ImageBody({ node, isEditing, onCommit, onCancel, onPickImage }: BodyProps) {
  const src = imageSrc(node);
  const aspect = typeof node.data?.aspect === "number" ? node.data.aspect : 4 / 3;
  return (
    <div className="rounded-lg overflow-hidden shadow-sm" style={cardSurface(node)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={node.label || "Image card"} draggable={false} className="block w-full object-cover" style={{ aspectRatio: aspect }} />
      ) : (
        <button
          {...CONTROL}
          onClick={onPickImage}
          className="w-full flex flex-col items-center justify-center gap-2 text-xs"
          style={{ aspectRatio: aspect, color: "var(--text-secondary)" }}
        >
          <ImagePlus className="w-6 h-6" />
          Choose an image, or paste / drop one on the board
        </button>
      )}
      {(isEditing || node.label) && (
        <div className="px-3 py-2 text-[13px] leading-5" style={{ color: "var(--text-primary)" }}>
          {isEditing ? (
            <TextEditor value={node.label} placeholder="Caption" multiline onCommit={(label) => onCommit({ label })} onCancel={onCancel} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{node.label}</p>
          )}
        </div>
      )}
    </div>
  );
}

function LinkForm({ node, onCommit, onCancel }: BodyProps) {
  const [error, setError] = useState("");
  const { draft, setDraft, finish, cancel } = useDraft(linkUrl(node) ?? "", (text) => {
    if (!text.trim()) return onCancel();
    const url = normalizeUrl(text);
    if (!url) return onCancel();
    onCommit({ data: { ...node.data, url, preview: url === linkUrl(node) ? node.data?.preview : undefined } });
  }, onCancel);
  return (
    <div className="p-3">
      <label className="flex items-center gap-2 text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
        <Link2 className="w-3.5 h-3.5" /> Paste a link (YouTube, Spotify, any website)
      </label>
      <input
        {...CONTROL}
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(e.target.value && !normalizeUrl(e.target.value) ? "That doesn't look like a web link" : "");
        }}
        onBlur={finish}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") cancel(e);
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="https://"
        aria-label="Link address"
        className="w-full px-2 py-1.5 rounded text-[13px] outline-none select-text"
        style={FIELD_STYLE}
      />
      {error && <p className="text-[11px] mt-1" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

function OpenLinkButton({ url, title }: { url: string; title: string }) {
  return (
    <a
      {...CONTROL}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="p-1 rounded shrink-0"
      style={{ color: "var(--text-secondary)" }}
      title="Open link in a new tab"
      aria-label={`Open ${title} in a new tab`}
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}

function ProviderBadge({ provider, className = "" }: { provider: EmbedProvider; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium truncate ${className}`} style={{ color: "var(--text-secondary)" }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PROVIDER_COLORS[provider] }} />
      {PROVIDER_NAMES[provider]}
    </span>
  );
}

function PlayerFrame({ embed, player, title }: { embed: Embed; player: Player; title: string }) {
  return (
    <iframe
      src={playerSrc(embed, player, window.location.hostname)}
      title={title}
      className="block w-full"
      style={"height" in player ? { height: player.height } : { aspectRatio: player.aspect }}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

interface LinkView extends LinkLook {
  isLoading: boolean;
}

function LinkTitle({ view, lines = "line-clamp-2" }: { view: LinkView; lines?: string }) {
  return (
    <p className={`text-[13px] font-semibold leading-5 break-words ${lines}`} style={{ color: "var(--text-primary)" }}>
      {view.isLoading && !view.preview.title ? "Loading preview…" : view.title}
    </p>
  );
}

function VideoLink({ embed, view }: { embed: VideoEmbed; view: LinkView }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const thumbnail = view.preview.image ?? embed.thumbnail;
  const name = PROVIDER_NAMES[embed.provider];
  return (
    <>
      {isPlaying ? (
        <PlayerFrame embed={embed} player={embed.player} title={view.title} />
      ) : (
        <div className="relative w-full" style={{ aspectRatio: embed.player.aspect, background: "var(--bg-primary)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumbnail && <img src={thumbnail} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />}
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: PROVIDER_COLORS[embed.provider], color: "var(--bg-primary)" }}>
            {name}
          </span>
          <button
            {...CONTROL}
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 m-auto w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: "rgba(0,0,0,0.7)", color: "white" }}
            title={`Play on ${name}`}
            aria-label={`Play ${view.title} here`}
          >
            <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
          </button>
        </div>
      )}
      <div className="px-3.5 py-2.5">
        <LinkTitle view={view} />
        {view.preview.description && (
          <p className="text-xs leading-4 mt-0.5 line-clamp-1 break-words" style={{ color: "var(--text-secondary)" }}>{view.preview.description}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <ProviderBadge provider={embed.provider} />
          <OpenLinkButton url={view.url} title={view.title} />
        </div>
      </div>
    </>
  );
}

function SongLink({ embed, view }: { embed: AudioEmbed; view: LinkView }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const cover = view.preview.image ?? embed.thumbnail;
  const accent = PROVIDER_COLORS[embed.provider];
  const { player } = embed;
  return (
    <div className="relative">
      <span className="absolute left-0 inset-y-0 w-1" style={{ background: accent }} />
      {isPlaying && player ? (
        <div className="pl-1">
          <PlayerFrame embed={embed} player={player} title={view.title} />
        </div>
      ) : (
        <div className="flex items-center gap-3 pl-4 pr-3 pt-3">
          <div className="shrink-0 rounded-md overflow-hidden flex items-center justify-center" style={{ width: SONG_COVER, height: SONG_COVER, background: "var(--bg-primary)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover ? <img src={cover} alt="" draggable={false} className="w-full h-full object-cover" /> : <Music className="w-6 h-6" style={{ color: accent }} />}
          </div>
          <div className="min-w-0 flex-1">
            <LinkTitle view={view} />
            {view.preview.description && (
              <p className="text-xs leading-4 mt-0.5 line-clamp-2 break-words" style={{ color: "var(--text-secondary)" }}>{view.preview.description}</p>
            )}
          </div>
          {player && (
            <button
              {...CONTROL}
              onClick={() => setIsPlaying(true)}
              className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center shadow"
              style={{ background: accent, color: "var(--bg-primary)" }}
              title={`Play on ${PROVIDER_NAMES[embed.provider]}`}
              aria-label={`Play ${view.title} here`}
            >
              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pl-4 pr-2.5 py-1.5">
        <ProviderBadge provider={embed.provider} />
        <OpenLinkButton url={view.url} title={view.title} />
      </div>
    </div>
  );
}

function ImageLink({ src, view }: { src: string; view: LinkView }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={view.title} draggable={false} className="block w-full" />
      <div className="flex items-center justify-between gap-2 px-3.5 py-1.5">
        <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{hostname(view.url)}</span>
        <OpenLinkButton url={view.url} title={view.title} />
      </div>
    </>
  );
}

function PlainLink({ view }: { view: LinkView }) {
  const thumbnail = view.preview.image;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="shrink-0 rounded-md overflow-hidden flex items-center justify-center" style={{ width: LINK_THUMB, height: LINK_THUMB, background: "var(--bg-primary)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumbnail ? <img src={thumbnail} alt="" draggable={false} className="w-full h-full object-cover" /> : <Globe className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />}
      </div>
      <div className="min-w-0 flex-1">
        <LinkTitle view={view} />
        <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
          {view.preview.siteName ? `${view.preview.siteName} · ${hostname(view.url)}` : hostname(view.url)}
        </p>
      </div>
      <OpenLinkButton url={view.url} title={view.title} />
    </div>
  );
}

function LinkContent({ view }: { view: LinkView }) {
  const image = imageUrlFor(view.url);
  if (image) return <ImageLink src={image} view={view} />;
  const embed = embedFor(view.url);
  if (embed?.kind === "video") return <VideoLink embed={embed} view={view} />;
  if (embed?.kind === "audio") return <SongLink embed={embed} view={view} />;
  return <PlainLink view={view} />;
}

export function LinkBody(props: BodyProps) {
  const { node, isEditing, isLoading } = props;
  const url = linkUrl(node);
  if (isEditing || !url) return <div className="rounded-xl shadow-sm" style={cardSurface(node)}><LinkForm {...props} /></div>;
  const view = { ...linkLook(node), isLoading };
  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={cardSurface(node)}>
      <LinkContent key={url} view={view} />
    </div>
  );
}

export function AssetBody({ node, projectId }: BodyProps) {
  const ref = nodeAsset(node);
  const summary = ref ? getAsset(projectId, ref.type, ref.id) : undefined;
  const kind = ref ? ASSET_KINDS[ref.type] : undefined;
  const Icon = ref ? ASSET_ICONS[ref.type] : null;
  return (
    <div className="relative rounded-xl overflow-hidden shadow-sm flex items-center gap-3 pl-4 pr-2 py-2.5 min-h-16" style={cardSurface(node)}>
      <span className="absolute left-0 inset-y-0 w-1" style={{ background: summary ? kind?.color : "var(--text-muted)" }} />
      {summary?.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={summary.thumbnail} alt="" draggable={false} className="w-10 h-10 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
      ) : (
        Icon && <Icon className="w-5 h-5 shrink-0" style={{ color: summary ? kind?.color : "var(--text-muted)" }} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px]" style={{ color: summary ? kind?.color : "var(--text-muted)" }}>{summary ? kind?.label : "Deleted asset"}</p>
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{summary?.name ?? node.label}</p>
        {summary?.excerpt && <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>{summary.excerpt}</p>}
      </div>
      {summary && ref && (
        <Link
          {...CONTROL}
          href={assetHref(projectId, ref.type, ref.id)}
          className="p-1.5 rounded shrink-0"
          style={{ color: "var(--text-secondary)" }}
          title={`Open ${summary.name}`}
          aria-label={`Open ${summary.name}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

export function GroupBody({ node, isEditing, onCommit, onCancel }: BodyProps) {
  const color = node.color ?? "#666680";
  return (
    <div className="w-full h-full rounded-2xl" style={{ background: `${color}1a`, border: `1.5px solid ${color}80` }}>
      <div className="px-4 flex items-center text-sm font-semibold" style={{ height: GROUP_HEADER, color: "var(--text-primary)" }}>
        {isEditing ? (
          <TextEditor value={node.label} placeholder="Group name" onCommit={(label) => onCommit({ label })} onCancel={onCancel} />
        ) : (
          <span className="truncate">{node.label || "Group"}</span>
        )}
      </div>
    </div>
  );
}
