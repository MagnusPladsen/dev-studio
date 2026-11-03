"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Search,
  Link2,
  Download,
  X,
} from "lucide-react";
import { storage, PROJECT_COLLECTIONS } from "@/lib/storage";
import { isExample } from "@/lib/examples";
import { ASSET_ICONS } from "@/components/asset-icons";
import { ExamplesBar } from "@/components/ExamplesBar";
import { NewBadge, isNewTool } from "@/components/NewBadge";
import { HelpButton } from "@/components/HelpButton";
import { TutorialsToggle } from "@/components/TutorialsToggle";
import { ASSET_KINDS, ASSET_TYPES, assetHref, listAssets } from "@/lib/assets";
import { isDevStudio } from "@/lib/app-config";
import { getRelated } from "@/lib/links";
import { getAssetName, getStoredAsset } from "@/lib/asset-actions";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { useStorageVersion } from "@/hooks/useStorage";
import type { AssetRef, AssetType } from "@/types";

const ASSET_COLLECTIONS = PROJECT_COLLECTIONS.filter((c) => c !== "links");

const DESCRIPTIONS: Record<AssetType, string> = {
  sprite: "Draw sprites and animations",
  music: "Compose game music",
  sound: "Generate sound effects",
  tilemap: "Paint levels with your sprites",
  diagram: "Moodboards, plans and flow charts",
  story: isDevStudio ? "Linked docs about your project" : "Lore, characters and places",
  dialogue: "Branching conversations",
  palette: "Shared colour palettes",
  spritesheet: "Pack sprites for your engine",
  note: "Ideas, to-dos and dev notes",
  issue: "Sprints, tasks and bugs",
  model: "Chunky 3D props and characters",
  decision: "Why things are the way they are",
};

type SortOrder = "recent" | "name" | "type";

const SORT_LABELS: Record<SortOrder, string> = { recent: "Recent first", name: "Name A–Z", type: "By tool" };

function compareAssets(order: SortOrder) {
  return (a: { name: string; type: AssetType; updatedAt?: string }, b: typeof a): number => {
    const byName = a.name.localeCompare(b.name);
    if (order === "name") return byName;
    if (order === "type") return ASSET_KINDS[a.type].label.localeCompare(ASSET_KINDS[b.type].label) || byName;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || byName;
  };
}

function parseLinksParam(value: string | null): AssetRef | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || !id || !(ASSET_TYPES as string[]).includes(type)) return null;
  return { type: type as AssetType, id };
}

export default function AssetsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { assetTriggerProps, pasteTriggerProps } = useAssetMenu();
  const version = useStorageVersion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetType | "all">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");

  const project = storage.getById("projects", projectId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => listAssets(projectId), [projectId, version]);
  const counts = useMemo(() => {
    const c = {} as Record<AssetType, number>;
    for (const t of ASSET_TYPES) c[t] = 0;
    for (const a of all) c[a.type]++;
    return c;
  }, [all]);

  const linksRef = parseLinksParam(searchParams.get("links"));
  const linksKey = linksRef ? `${linksRef.type}:${linksRef.id}` : null;
  const linksName = useMemo(() => {
    const stored = linksRef && getStoredAsset(projectId, linksRef);
    return linksRef && stored ? getAssetName(linksRef.type, stored) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey, projectId, version]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const linkedKeys =
      linksRef && linksName
        ? new Set([linksKey, ...getRelated(projectId, linksRef.type, linksRef.id).map((r) => `${r.type}:${r.id}`)])
        : null;
    return all
      .filter((a) => !linkedKeys || linkedKeys.has(`${a.type}:${a.id}`))
      .filter((a) => (filter === "all" || a.type === filter) && (!q || a.name.toLowerCase().includes(q)))
      .sort(compareAssets(sortOrder))
      .map((a) => {
        const collection = ASSET_KINDS[a.type].collection;
        return {
          ...a,
          related: getRelated(projectId, a.type, a.id),
          example: isExample(storage.getById(collection, a.id, projectId), collection),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, query, filter, sortOrder, projectId, version, linksKey, linksName]);

  if (!project) {
    return (
      <div className="p-10 text-center" style={{ color: "var(--text-secondary)" }}>
        Project not found. <Link href="/projects" className="underline">Back to projects</Link>
      </div>
    );
  }

  function exportProject() {
    const blob = new Blob([storage.exportProject(projectId)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project!.name}.gamedev.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="p-6 max-md:p-4 md:p-10 max-w-5xl mx-auto">
      <div className="mb-3 flex items-start justify-between gap-4 max-md:flex-col max-md:items-stretch">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {project.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton topic="assets" />
          <TutorialsToggle projectId={projectId} />
          <button
            onClick={exportProject}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm shrink-0 max-md:flex-1"
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
            title="Download the whole project as one JSON file (import it again from the Projects page)"
          >
            <Download className="w-4 h-4" />
            Export project
          </button>
        </div>
      </div>
      <ExamplesBar projectId={projectId} collections={ASSET_COLLECTIONS} className="mb-8" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-12">
        {ASSET_TYPES.map((t) => {
          const kind = ASSET_KINDS[t];
          const Icon = ASSET_ICONS[t];
          return (
            <Link
              key={t}
              href={`/project/${projectId}/${kind.path}`}
              className="group flex items-start gap-3 p-4 rounded-xl border text-left transition-colors hover:brightness-125"
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, ${kind.color} 13%, var(--bg-card)), color-mix(in srgb, ${kind.color} 4%, var(--bg-card)))`,
                borderColor: `color-mix(in srgb, ${kind.color} 22%, var(--border))`,
              }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${kind.color}22`, color: kind.color }}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    {t === "spritesheet" ? "Sprite Sheets" : t === "note" ? "Notebook" : t === "issue" ? "Task Board" : t === "decision" ? "Decision log" : t === "diagram" || kind.label === "Story" ? kind.label : `${kind.label}s`.replace("Musics", "Music")}
                    {isNewTool(kind.path) && <NewBadge />}
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: kind.color }} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {DESCRIPTIONS[t]}
                </p>
                {counts[t] > 0 && (
                  <span className="inline-block text-xs mt-1.5 px-2 py-0.5 rounded-full" style={{ background: `${kind.color}18`, color: kind.color }}>
                    {counts[t]} saved
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 max-md:[&_input]:w-full max-md:[&>div]:w-full max-md:[&>div>div]:flex-1">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Everything in this project
        </h2>
        <div className="flex items-center gap-2">
          <PasteButton />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="Sort"
            className="px-2 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
              <option key={order} value={order}>
                {SORT_LABELS[order]}
              </option>
            ))}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as AssetType | "all")}
            className="px-2 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            <option value="all">All types</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_KINDS[t].label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="bg-transparent text-xs outline-none w-32"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        </div>
      </div>

      {linksName && (
        <div
          className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg text-xs w-fit max-w-full"
          style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          <Link2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <span className="truncate">Showing {linksName} and its links</span>
          <button
            type="button"
            onClick={() => router.replace(pathname, { scroll: false })}
            title="Show everything"
            aria-label="Show everything"
            className="shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p {...pasteTriggerProps()} className="text-sm py-10 text-center rounded-xl border border-dashed" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>
          {all.length === 0 ? "Nothing saved yet. Pick a tool above to start." : "No matches."}
        </p>
      ) : (
        <div {...pasteTriggerProps()} className="rounded-xl border divide-y" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          {shown.map((a) => {
            const kind = ASSET_KINDS[a.type];
            return (
              <div key={`${a.type}:${a.id}`} {...assetTriggerProps({ type: a.type, id: a.id })} className="group flex items-center gap-3 px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
                {a.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnail} alt="" className="w-6 h-6 shrink-0" style={{ imageRendering: "pixelated" }} />
                ) : (
                  <span className="w-6 h-6 rounded shrink-0 flex items-center justify-center" style={{ background: `${kind.color}22`, color: kind.color }}>
                    {(() => {
                      const Icon = ASSET_ICONS[a.type];
                      return <Icon className="w-3.5 h-3.5" />;
                    })()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link href={assetHref(projectId, a.type, a.id)} className="text-sm truncate block hover:underline" style={{ color: "var(--text-primary)" }}>
                    {a.name}
                  </Link>
                  <span className="text-xs flex items-center gap-1.5" style={{ color: kind.color }}>
                    {kind.label}
                    {a.example && (
                      <span
                        className="px-1.5 py-px rounded text-[10px] font-medium"
                        style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                        title="Example asset. Edit it or remove all examples above."
                      >
                        Example
                      </span>
                    )}
                  </span>
                </div>
                {a.related.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-[50%]">
                    <Link2 className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
                    {a.related.slice(0, 4).map((r) => (
                      <Link
                        key={`${r.type}:${r.id}`}
                        href={assetHref(projectId, r.type, r.id)}
                        className="text-xs px-1.5 py-0.5 rounded truncate max-w-32 hover:underline"
                        style={{ background: `${ASSET_KINDS[r.type].color}18`, color: ASSET_KINDS[r.type].color }}
                      >
                        {r.name}
                      </Link>
                    ))}
                    {a.related.length > 4 && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        +{a.related.length - 4}
                      </span>
                    )}
                  </div>
                )}
                <AssetPinButton asset={{ type: a.type, id: a.id }} label={a.name} />
                <AssetMenuButton asset={{ type: a.type, id: a.id }} label={a.name} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
