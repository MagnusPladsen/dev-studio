"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AssetType } from "@/types";
import { useNavigateThenReload, urlWithOpen, urlWithoutOpen } from "@/components/AssetContextMenu";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toast";
import { ASSET_KINDS } from "@/lib/assets";
import { needsEditorReload } from "@/lib/asset-menu-items";
import { editorListFollowsStorage } from "@/lib/editor-refresh";
import { isLive } from "@/lib/live-editors";
import { getOpenAsset } from "@/lib/open-asset";
import { storage, type ChangeEvent } from "@/lib/storage";

const changedId = (c: ChangeEvent): string | null => (c.op === "put" ? c.item.id : c.op === "delete" ? c.id : null);

/** The asset type whose editor is on screen, if any. */
function toolOnScreen(pathname: string, projectId: string): AssetType | null {
  return (Object.keys(ASSET_KINDS) as AssetType[]).find((type) => needsEditorReload(pathname, projectId, type)) ?? null;
}

/**
 * Reacts to changes from another tab, device or the MCP server for whatever is on screen: a calm notice
 * when the open project or asset is deleted, and a re-mount (keeping the open asset) for editors that
 * don't follow remote changes themselves (see useRemoteChanges for the ones that do).
 */
export function LiveRefresh(): null {
  const pathname = usePathname();
  const router = useRouter();
  const openId = useSearchParams().get("open");
  const { reloadView } = useSync();
  const { showToast } = useToast();
  const navigateThenReload = useNavigateThenReload(openId, reloadView);

  const handle = (changes: ChangeEvent[]) => {
    const projectId = pathname.match(/\/project\/([^/]+)/)?.[1];
    if (!projectId) return;
    if (changes.some((c) => c.op === "deleteProject" && c.projectId === projectId)) {
      showToast({ message: "This project was deleted in another tab or on another device" });
      router.push("/projects");
      return;
    }
    const inProject = changes.filter((c) => c.op !== "deleteProject" && c.projectId === projectId);
    const open = getOpenAsset();
    const isOpenDeleted = !!open && inProject.some((c) => c.op === "delete" && c.id === open.id);
    if (open && isOpenDeleted) {
      showToast({ message: `This ${ASSET_KINDS[open.type].label.toLowerCase()} was deleted in another tab or on another device` });
    }

    const type = toolOnScreen(pathname, projectId);
    if (!type || isLive(ASSET_KINDS[type].collection)) return;
    const mine = inProject.filter((c) => c.op !== "deleteProject" && c.collection === ASSET_KINDS[type].collection);
    if (!mine.length) return;
    const openHere = open?.type === type ? open.id : null;
    if (openHere && isOpenDeleted) return navigateThenReload(urlWithoutOpen(pathname), null);
    const touchesOpen = !!openHere && mine.some((c) => changedId(c) === openHere);
    if (!touchesOpen && editorListFollowsStorage(type)) return;
    if (openHere) navigateThenReload(urlWithOpen(pathname, openHere), openHere);
    else reloadView();
  };
  const handler = useRef(handle);
  useEffect(() => {
    handler.current = handle;
  });
  useEffect(() => storage.onRemoteChange((changes) => handler.current(changes)), []);

  return null;
}
