"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Plus, Search, X } from "lucide-react";
import type { AssetType } from "@/types";
import { ASSET_KINDS, ASSET_TYPES, assetHref, listAssets, type AssetSummary } from "@/lib/assets";
import { addLink, getRelated, removeLink, type RelatedAsset } from "@/lib/links";
import { useStorageVersion } from "@/hooks/useStorage";
import { useAssetMenu } from "@/components/AssetContextMenu";

interface Props {
  projectId: string;
  type: AssetType;
  id: string | null | undefined;
  /** "row" fits in a toolbar, "panel" stacks vertically in a sidebar. */
  layout?: "row" | "panel";
  /** How many chips a row shows before the rest move behind a button; 0 shows only a "N linked" button. */
  maxRowChips?: number;
}

function Thumb({ asset }: { asset: AssetSummary }) {
  const color = ASSET_KINDS[asset.type].color;
  if (asset.thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnail} alt="" className="w-4 h-4 shrink-0" style={{ imageRendering: "pixelated" }} />;
  }
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;
}

/** Chips shown inline in a toolbar row by default; the rest sit behind a button so the toolbar never wraps. */
const ROW_CHIP_LIMIT = 2;

function LinkChip({ projectId, self, asset }: { projectId: string; self: { type: AssetType; id: string }; asset: RelatedAsset }) {
  const { assetTriggerProps } = useAssetMenu();
  return (
    <div
      {...assetTriggerProps({ type: asset.type, id: asset.id })}
      className="group flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded text-xs max-w-full"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      title={asset.excerpt ? `${ASSET_KINDS[asset.type].label}: ${asset.excerpt}` : ASSET_KINDS[asset.type].label}
    >
      <Thumb asset={asset} />
      <Link href={assetHref(projectId, asset.type, asset.id)} className="truncate hover:underline" style={{ color: "var(--text-primary)" }}>
        {asset.name}
      </Link>
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        {ASSET_KINDS[asset.type].label}
      </span>
      {asset.source !== "wiki" && (
        <button
          onClick={() => removeLink(projectId, self, asset)}
          className="opacity-0 group-hover:opacity-100 shrink-0"
          style={{ color: "var(--text-muted)" }}
          title="Remove link"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function LinkedAssets({ projectId, type, id, layout = "panel", maxRowChips = ROW_CHIP_LIMIT }: Props) {
  const version = useStorageVersion();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [showingAll, setShowingAll] = useState(false);

  const related = useMemo(
    () => (id ? getRelated(projectId, type, id) : []),
    // version: recompute when any stored data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, type, id, version]
  );

  const candidates = useMemo(() => {
    if (!picking || !id) return [];
    const taken = new Set(related.map((r) => `${r.type}:${r.id}`));
    const q = query.trim().toLowerCase();
    return listAssets(projectId).filter(
      (a) => !(a.type === type && a.id === id) && !taken.has(`${a.type}:${a.id}`) && (!q || a.name.toLowerCase().includes(q))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, query, projectId, type, id, related, version]);

  if (!id) {
    return layout === "panel" ? (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Save this asset to link it to sprites, sounds, story entries and more.
      </p>
    ) : null;
  }

  const self = { type, id };
  const chipLimit = layout === "row" ? maxRowChips : related.length;
  const shownChips = related.slice(0, chipLimit);
  const hiddenChips = related.slice(chipLimit);

  return (
    <div className={layout === "row" ? "relative flex items-center gap-1.5 min-w-0" : "relative space-y-1.5"}>
      <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
        <Link2 className="w-3.5 h-3.5" />
        {layout === "panel" && <span className="font-medium">Linked</span>}
        <button
          onClick={() => setPicking((p) => !p)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded"
          style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
          title="Link another asset"
        >
          <Plus className="w-3 h-3" />
          Link
        </button>
      </div>

      <div className={layout === "row" ? "flex items-center gap-1 min-w-0 [&>*]:max-w-56 [&>*]:min-w-0" : "flex flex-col gap-1"}>
        {related.length === 0 && layout === "panel" && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nothing linked yet.
          </p>
        )}
        {shownChips.map((r) => (
          <LinkChip key={`${r.type}:${r.id}`} projectId={projectId} self={self} asset={r} />
        ))}
        {hiddenChips.length > 0 && (
          <button
            onClick={() => setShowingAll((v) => !v)}
            className="px-1.5 py-0.5 rounded text-xs shrink-0 whitespace-nowrap"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            title={showingAll ? "Hide the other links" : `Show ${hiddenChips.length} more: ${hiddenChips.map((r) => r.name).join(", ")}`}
            aria-expanded={showingAll}
          >
            {shownChips.length === 0 ? `${hiddenChips.length} linked` : `+${hiddenChips.length}`}
          </button>
        )}
      </div>

      {showingAll && hiddenChips.length > 0 && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg shadow-xl p-2 flex flex-col gap-1"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          {hiddenChips.map((r) => (
            <LinkChip key={`${r.type}:${r.id}`} projectId={projectId} self={self} asset={r} />
          ))}
        </div>
      )}

      {picking && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg shadow-xl p-2"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-1.5 px-2 py-1 mb-1.5 rounded" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
            <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setPicking(false)}
              placeholder="Search assets in this project"
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          {candidates.length === 0 && (
            <p className="text-xs px-2 py-3 text-center" style={{ color: "var(--text-muted)" }}>
              No other assets to link yet.
            </p>
          )}
          {ASSET_TYPES.map((t) => {
            const group = candidates.filter((c) => c.type === t);
            if (!group.length) return null;
            return (
              <div key={t} className="mb-1">
                <div className="text-[10px] uppercase tracking-wide px-2 py-1" style={{ color: ASSET_KINDS[t].color }}>
                  {ASSET_KINDS[t].label}
                </div>
                {group.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      addLink(projectId, self, { type: c.type, id: c.id });
                      setPicking(false);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <Thumb asset={c} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
