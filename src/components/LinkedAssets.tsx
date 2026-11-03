"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Plus, X } from "lucide-react";
import type { AssetRef, AssetType } from "@/types";
import { ASSET_KINDS, assetHref } from "@/lib/assets";
import { addLink, getRelated, relatedKey, relatedLabel, relatedRef, removeLink, type RelatedAsset } from "@/lib/links";
import { useStorageVersion } from "@/hooks/useStorage";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetPickerList, AssetThumb } from "@/components/AssetPickerList";

interface Props {
  projectId: string;
  type: AssetType;
  id: string | null | undefined;
  /** One element of the canvas `id`: the panel then lists and adds that element's links only. */
  elementId?: string;
  /** "row" fits in a toolbar, "panel" stacks vertically in a sidebar. */
  layout?: "row" | "panel";
  /** How many chips a row shows before the rest move behind a button; 0 shows only a "N linked" button. */
  maxRowChips?: number;
  /** Inside a panel floating at the right edge (and at the bottom on phones): the picker opens leftwards, and upwards on phones. */
  isInFloatingPanel?: boolean;
}

/** Chips shown inline in a toolbar row by default; the rest sit behind a button so the toolbar never wraps. */
const ROW_CHIP_LIMIT = 2;

const POPUP = "absolute z-50 top-full mt-1 rounded-lg shadow-xl p-2";
const FLOATING_POPUP = "right-0 max-md:left-0 max-md:w-auto max-md:top-auto max-md:bottom-full max-md:mt-0 max-md:mb-1";

function LinkChip({ projectId, self, asset }: { projectId: string; self: AssetRef; asset: RelatedAsset }) {
  const { assetTriggerProps } = useAssetMenu();
  const label = relatedLabel(asset);
  const from = asset.viaElementId ? { ...self, elementId: asset.viaElementId } : self;
  return (
    <div
      {...assetTriggerProps({ type: asset.type, id: asset.id })}
      className="group flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded text-xs max-w-full"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      title={asset.excerpt ? `${ASSET_KINDS[asset.type].label}: ${asset.excerpt}` : ASSET_KINDS[asset.type].label}
    >
      <AssetThumb asset={asset} />
      {asset.viaElementName && (
        <span className="shrink-0 truncate max-w-20" style={{ color: "var(--text-muted)" }} title={`Linked from ${asset.viaElementName}`}>
          {asset.viaElementName} ›
        </span>
      )}
      <Link href={assetHref(projectId, asset.type, asset.id, asset.elementId)} className="truncate hover:underline" style={{ color: "var(--text-primary)" }}>
        {label}
      </Link>
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        {ASSET_KINDS[asset.type].label}
      </span>
      {asset.source !== "wiki" && (
        <button
          onClick={() => removeLink(projectId, from, relatedRef(asset))}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 shrink-0"
          style={{ color: "var(--text-muted)" }}
          title="Remove link"
          aria-label={`Remove link to ${label}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function LinkedAssets({ projectId, type, id, elementId, layout = "panel", maxRowChips = ROW_CHIP_LIMIT, isInFloatingPanel }: Props) {
  const version = useStorageVersion();
  const [picking, setPicking] = useState(false);
  const [showingAll, setShowingAll] = useState(false);

  const related = useMemo(
    () => (id ? getRelated(projectId, type, id, elementId) : []),
    // version: recompute when any stored data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, type, id, elementId, version]
  );

  if (!id) {
    return layout === "panel" ? (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Save this asset to link it to sprites, sounds, story entries and more.
      </p>
    ) : null;
  }

  const self: AssetRef = elementId ? { type, id, elementId } : { type, id };
  const taken = related.filter((r) => !r.viaElementId).map(relatedRef);
  const chipLimit = layout === "row" ? maxRowChips : related.length;
  const shownChips = related.slice(0, chipLimit);
  const hiddenChips = related.slice(chipLimit);
  const popupPlacement = isInFloatingPanel ? FLOATING_POPUP : "left-0";

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
          aria-expanded={picking}
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
          <LinkChip key={relatedKey(r)} projectId={projectId} self={self} asset={r} />
        ))}
        {hiddenChips.length > 0 && (
          <button
            onClick={() => setShowingAll((v) => !v)}
            className="px-1.5 py-0.5 rounded text-xs shrink-0 whitespace-nowrap"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            title={showingAll ? "Hide the other links" : `Show ${hiddenChips.length} more: ${hiddenChips.map(relatedLabel).join(", ")}`}
            aria-expanded={showingAll}
          >
            {shownChips.length === 0 ? `${hiddenChips.length} linked` : `+${hiddenChips.length}`}
          </button>
        )}
      </div>

      {showingAll && hiddenChips.length > 0 && (
        <div className={`${POPUP} left-0 w-64 max-h-80 overflow-y-auto flex flex-col gap-1`} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          {hiddenChips.map((r) => (
            <LinkChip key={relatedKey(r)} projectId={projectId} self={self} asset={r} />
          ))}
        </div>
      )}

      {picking && (
        <div
          className={`${POPUP} ${popupPlacement} w-72 max-h-80 flex flex-col`}
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <AssetPickerList
            projectId={projectId}
            exclude={taken}
            hiddenIds={[id]}
            allowElements
            onEscape={() => setPicking(false)}
            onPick={(ref) => {
              addLink(projectId, self, ref);
              setPicking(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
