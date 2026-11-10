"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AssetRef, AssetType, Issue, Note, Sprite } from "@/types";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import { AssetPickerModal } from "@/components/AssetPickerModal";
import { useSync } from "@/components/SyncProvider";
import { useToast, type ToastOptions } from "@/components/Toast";
import { saveIssue } from "@/lib/board";
import {
  addAssetToDiagram,
  assetUrl,
  createDiagramWith,
  createNoteAbout,
  createTaskFor,
  deleteAsset,
  deleteConfirmMessage,
  duplicateAsset,
  getAssetName,
  getStoredAsset,
  renameAsset,
  systemClipboardPayload,
  type StoredAsset,
} from "@/lib/asset-actions";
import { copyToSystemClipboard } from "@/lib/clipboard";
import { getOpenAsset } from "@/lib/open-asset";
import { canPaste, copyAsset, pasteAsset, readClipboard } from "@/lib/asset-clipboard";
import {
  getAssetMenuEntries,
  needsEditorReload,
  type AssetActionId,
  type AssetMenuContext,
  type AssetMenuEntry,
} from "@/lib/asset-menu-items";
import { assetHref } from "@/lib/assets";
import { decideEditorRefresh, editorListFollowsStorage, willOpenParamChange } from "@/lib/editor-refresh";
import { flushAllAutosaves } from "@/lib/autosave-registry";
import { downloadBlob } from "@/lib/download";
import { addLink, getRelated, refLabel, relatedRef } from "@/lib/links";
import { createLongPress, type LongPress } from "@/lib/long-press";
import { getPreviewing, playPreview, stopPreview } from "@/lib/audio/preview";
import { anchorPoint, contextMenuDecision, shouldUseNativeMenu, type Point } from "@/lib/menu-position";
import { isAssetPinned, toggleAssetPin } from "@/lib/pins";
import { loadImage, spriteFrameSrc } from "@/lib/pixels";
import { storage } from "@/lib/storage";
import { dialog } from "@/components/Dialog";

export interface MenuTriggerProps {
  "data-asset-menu": "";
  onContextMenu(e: React.MouseEvent<Element>): void;
  onPointerDown(e: React.PointerEvent<Element>): void;
  onPointerMove(e: React.PointerEvent<Element>): void;
  onPointerUp(e: React.PointerEvent<Element>): void;
  onPointerCancel(e: React.PointerEvent<Element>): void;
  onPointerLeave(e: React.PointerEvent<Element>): void;
  onClickCapture(e: React.MouseEvent<Element>): void;
  /** Menu key / Shift+F10: Chrome on macOS fires no `contextmenu` for them, so the menu opens from the key itself. */
  onKeyDown(e: React.KeyboardEvent<Element>): void;
}

export interface AssetMenuApi {
  projectId: string | null;
  openAssetMenu(anchor: Point, ref: AssetRef, opener?: HTMLElement | null): void;
  openMenu(anchor: Point, entries: ContextMenuEntry[], label: string, opener?: HTMLElement | null): void;
  assetTriggerProps(ref: AssetRef): MenuTriggerProps;
  /** `getEntries` returning null leaves the browser's own menu. */
  menuTriggerProps(getEntries: () => ContextMenuEntry[] | null, label: string): MenuTriggerProps;
  /** List background: opens "Paste" only when the clipboard fits `type`, otherwise the browser's own menu. */
  pasteTriggerProps(type?: AssetType): MenuTriggerProps;
  paste(type?: AssetType): Promise<void>;
}

export interface PickerRequest {
  title: string;
  types?: AssetType[];
  exclude: AssetRef[];
  hiddenIds?: string[];
  allowElements?: boolean;
  createLabel?: string;
  onCreate?(): void;
  onPick(ref: AssetRef): void;
}

type OpenAt = (anchor: Point, opener: HTMLElement | null) => void;
type ResolveOpen = () => OpenAt | null;

interface OpenMenuState {
  id: number;
  anchor: Point;
  entries: ContextMenuEntry[];
  label: string;
}

interface MenuServices {
  projectId: string;
  pathname: string;
  /** The `?open=` id of the editor on screen, if any. */
  openId: string | null;
  router: ReturnType<typeof useRouter>;
  showToast(options: ToastOptions): void;
  reloadView(): void;
  /** Replaces the URL, then re-mounts the editor once `?open=` has become `open`. */
  navigateThenReload(href: string, open: string | null): void;
  openPicker(request: PickerRequest, opener: HTMLElement | null): void;
}

/** "created" is a new asset the editor should switch to; "changed" keeps whatever the editor has open. */
type MutationOutcome = { kind: "created" | "changed" | "deleted"; ref: AssetRef } | null;

interface MenuTarget {
  context: AssetMenuContext;
  item: StoredAsset;
}

interface ActionRun extends MenuTarget {
  services: MenuServices;
  arg?: string;
  opener: HTMLElement | null;
}

type ActionHandler = (run: ActionRun) => void | Promise<void>;

export const COPY_FAILED_MESSAGE = "Couldn't copy: the browser blocked the clipboard";
const ACTION_FAILED_MESSAGE = "Something went wrong";
const ISSUE_ORDER_STEP = 1000;
const PROJECT_PATH = /\/project\/([^/]+)/;
const FOLLOW_UP_CONTEXT_MENU_MS = 1000;

const AssetMenuApiContext = createContext<AssetMenuApi | null>(null);

export function useAssetMenu(): AssetMenuApi {
  const api = useContext(AssetMenuApiContext);
  if (!api) throw new Error("useAssetMenu must be used inside <AssetContextMenuProvider>");
  return api;
}

function restoreFocus(opener: HTMLElement | null): void {
  if (opener?.isConnected) opener.focus({ preventScroll: true });
}

function isPreviewing(ref: AssetRef): boolean {
  const current = getPreviewing();
  return current?.type === ref.type && current.id === ref.id;
}

function readMenuTarget(projectId: string, ref: AssetRef): MenuTarget | null {
  const item = getStoredAsset(projectId, ref);
  if (!item) return null;
  const context: AssetMenuContext = {
    ref,
    name: getAssetName(ref.type, item),
    isPinnedToSidebar: isAssetPinned(projectId, ref),
  };
  if (ref.type === "sound" || ref.type === "music") context.isPreviewing = isPreviewing(ref);
  if (ref.type === "note") context.isNotePinned = Boolean((item as Note).pinned);
  if (ref.type === "issue") {
    context.board = storage.getAll("boards", projectId)[0];
    context.issue = item as Issue;
  }
  return { context, item };
}

function entryKey(entry: Extract<AssetMenuEntry, { kind: "item" }>): string {
  return entry.arg === undefined ? entry.action : `${entry.action}:${entry.arg}`;
}

/** A disabled entry never carries its submenu, so it shows no ▸ and cannot open one. */
function toMenuEntries(entries: AssetMenuEntry[], run: (action: AssetActionId, arg?: string) => void): ContextMenuEntry[] {
  return entries.map((entry, index): ContextMenuEntry => {
    if (entry.kind === "separator") return { kind: "separator", key: `separator-${index}` };
    const submenu = entry.submenu && !entry.disabled ? toMenuEntries(entry.submenu, run) : undefined;
    return {
      kind: "item",
      key: entryKey(entry),
      label: entry.label,
      danger: entry.danger,
      disabled: entry.disabled,
      hint: entry.hint,
      submenu,
      onSelect: submenu || entry.disabled ? undefined : () => run(entry.action, entry.arg),
    };
  });
}

export function urlWithoutOpen(pathname: string): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("open");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function urlWithOpen(pathname: string, id: string): string {
  const params = new URLSearchParams(window.location.search);
  params.set("open", id);
  return `${pathname}?${params.toString()}`;
}

/** The asset the editor on screen reports as open, when it belongs to that tool and is stored (or was just deleted by this change). */
function openAssetOnScreen(pathname: string, projectId: string, deleted: AssetRef | null): AssetRef | null {
  const open = getOpenAsset();
  if (!open || !needsEditorReload(pathname, projectId, open.type)) return null;
  const isJustDeleted = deleted?.type === open.type && deleted.id === open.id;
  return isJustDeleted || getStoredAsset(projectId, open) ? open : null;
}

function refreshTarget(services: MenuServices, outcome: NonNullable<MutationOutcome>, open: string | null): { href: string; open: string | null } {
  const { pathname, projectId } = services;
  if (outcome.kind === "created") return { href: assetHref(projectId, outcome.ref.type, outcome.ref.id), open };
  return { href: open ? urlWithOpen(pathname, open) : urlWithoutOpen(pathname), open };
}

/** Re-mounts the editor on screen when it shows the changed asset's tool, keeping its open asset open. */
function refreshEditor(services: MenuServices, outcome: MutationOutcome): void {
  const { pathname, projectId, openId } = services;
  if (!outcome || !needsEditorReload(pathname, projectId, outcome.ref.type)) return;
  const deleted = outcome.kind === "deleted" ? outcome.ref : null;
  const tracked = openAssetOnScreen(pathname, projectId, deleted);
  const decision = decideEditorRefresh(outcome, openId, tracked, editorListFollowsStorage(outcome.ref.type));
  if (decision.kind === "none") return;
  if (decision.kind === "reload") return services.reloadView();
  const { href, open } = refreshTarget(services, outcome, decision.open);
  services.navigateThenReload(href, open);
}

/** Writes pending editor saves first, so an open editor cannot overwrite the change afterwards. */
async function mutate(services: MenuServices, change: () => MutationOutcome): Promise<MutationOutcome> {
  await flushAllAutosaves();
  const outcome = change();
  refreshEditor(services, outcome);
  return outcome;
}

function created(ref: AssetRef | null): MutationOutcome {
  return ref ? { kind: "created", ref } : null;
}

function toastWithOpen(services: MenuServices, message: string, ref: AssetRef): void {
  services.showToast({ message, action: { label: "Open", href: assetHref(services.projectId, ref.type, ref.id, ref.elementId) } });
}

function nameOf(projectId: string, ref: AssetRef): string {
  return getAssetName(ref.type, getStoredAsset(projectId, ref));
}

async function copyText(services: MenuServices, text: string): Promise<void> {
  const isCopied = await copyToSystemClipboard({ kind: "text", text });
  services.showToast({ message: isCopied ? "Copied" : COPY_FAILED_MESSAGE });
}

async function spritePngBlob(sprite: Sprite): Promise<Blob | null> {
  const src = spriteFrameSrc(sprite);
  if (!src) return null;
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** What the asset already links to directly; links of a canvas's own elements don't count, so the canvas can still pick those. */
function relatedRefs(projectId: string, ref: AssetRef): AssetRef[] {
  return [ref, ...getRelated(projectId, ref.type, ref.id).filter((related) => !related.viaElementId).map(relatedRef)];
}

function openLinkPicker(run: ActionRun, title: string, types?: AssetType[], allowElements = false): void {
  const { services, context } = run;
  const { projectId } = services;
  services.openPicker(
    {
      title,
      types,
      exclude: relatedRefs(projectId, context.ref),
      hiddenIds: [context.ref.id],
      allowElements,
      onPick: (picked) => {
        addLink(projectId, context.ref, picked);
        toastWithOpen(services, `Linked to ${refLabel(projectId, picked) ?? nameOf(projectId, picked)}`, picked);
      },
    },
    run.opener,
  );
}

async function addToDiagram(services: MenuServices, change: () => MutationOutcome): Promise<void> {
  const outcome = await mutate(services, change);
  if (outcome) toastWithOpen(services, `Added to ${nameOf(services.projectId, outcome.ref)}`, outcome.ref);
}

function openDiagramPicker(run: ActionRun): void {
  const { services, context } = run;
  const { projectId } = services;
  const toRef = (id: string | undefined): AssetRef | null => (id ? { type: "diagram", id } : null);
  const changed = (ref: AssetRef | null): MutationOutcome => (ref ? { kind: "changed", ref } : null);
  services.openPicker(
    {
      title: "Add to canvas",
      types: ["diagram"],
      exclude: [context.ref],
      createLabel: "New canvas",
      onCreate: () => void addToDiagram(services, () => created(toRef(createDiagramWith(projectId, context.ref).id))),
      onPick: (picked) =>
        void addToDiagram(services, () => changed(toRef(addAssetToDiagram(projectId, picked.id, context.ref)?.id))),
    },
    run.opener,
  );
}

function moveToColumn({ services, context, arg }: ActionRun): void {
  const { board, issue } = context;
  if (!board || !issue || !arg) return;
  const siblings = storage.getAll("issues", services.projectId).filter((other) => other.status === arg);
  const order = siblings.reduce((max, other) => Math.max(max, other.order), 0) + ISSUE_ORDER_STEP;
  saveIssue(services.projectId, board, issue, { status: arg, order });
}

function addToSprint({ services, context, arg }: ActionRun): void {
  const { board, issue } = context;
  if (!board || !issue || arg === undefined) return;
  saveIssue(services.projectId, board, issue, { sprintId: arg || null });
}

async function toggleNotePin({ services, item }: ActionRun): Promise<void> {
  const { id } = item as Note;
  await mutate(services, () => {
    const note = storage.getById("notes", id, services.projectId) ?? (item as Note);
    storage.save("notes", { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() }, services.projectId);
    return { kind: "changed", ref: { type: "note", id } };
  });
}

function togglePreview({ services, context }: ActionRun): void {
  if (isPreviewing(context.ref)) stopPreview();
  else playPreview(services.projectId, context.ref);
}

async function exportPng({ context, item }: ActionRun): Promise<void> {
  const blob = await spritePngBlob(item as Sprite);
  if (blob) downloadBlob(`${context.name}.png`, blob);
}

async function duplicate({ services, context }: ActionRun): Promise<void> {
  const outcome = await mutate(services, () => created(duplicateAsset(services.projectId, context.ref)));
  if (outcome) toastWithOpen(services, `Duplicated as ${nameOf(services.projectId, outcome.ref)}`, outcome.ref);
}

async function copyInApp({ services, context }: ActionRun): Promise<void> {
  await flushAllAutosaves();
  if (copyAsset(services.projectId, context.ref)) services.showToast({ message: "Copied" });
}

async function copySystem({ services, context, item }: ActionRun): Promise<void> {
  const isCopied = await copyToSystemClipboard(systemClipboardPayload(context.ref.type, item));
  services.showToast({ message: isCopied ? "Copied" : COPY_FAILED_MESSAGE });
}

function toggleSidebarPin({ services, context }: ActionRun): void {
  const wasPinned = isAssetPinned(services.projectId, context.ref);
  toggleAssetPin(services.projectId, context.ref);
  if (!wasPinned) services.showToast({ message: "Pinned to sidebar" });
}

async function rename({ services, context }: ActionRun): Promise<void> {
  const next = await dialog.prompt({ title: "Rename", defaultValue: context.name, confirmLabel: "Rename" });
  if (next === null || next === context.name) return;
  await mutate(services, () => {
    renameAsset(services.projectId, context.ref, next);
    return { kind: "changed", ref: context.ref };
  });
}

async function remove({ services, context }: ActionRun): Promise<void> {
  if (!(await dialog.confirm({ message: deleteConfirmMessage(services.projectId, context.ref), confirmLabel: "Delete", danger: true }))) return;
  await mutate(services, () => {
    deleteAsset(services.projectId, context.ref);
    return { kind: "deleted", ref: context.ref };
  });
}

function pushTo(path: (run: ActionRun) => string): ActionHandler {
  return (run) => run.services.router.push(path(run));
}

const ACTION_HANDLERS: Record<AssetActionId, ActionHandler> = {
  open: pushTo(({ services, context }) => assetHref(services.projectId, context.ref.type, context.ref.id)),
  "open-new-tab": ({ services, context }) =>
    void window.open(assetHref(services.projectId, context.ref.type, context.ref.id), "_blank", "noopener"),
  "export-png": exportPng,
  "use-in-tilemap": pushTo(({ services, context }) => `/project/${services.projectId}/tilemap?tile=${encodeURIComponent(context.ref.id)}`),
  "make-3d-model": pushTo(({ services, context }) => `/project/${services.projectId}/voxels?fromSprite=${encodeURIComponent(context.ref.id)}`),
  "use-in-pixel-art": pushTo(({ services, context }) => `/project/${services.projectId}/pixel-art?palette=${encodeURIComponent(context.ref.id)}`),
  "use-in-voxels": pushTo(({ services, context }) => `/project/${services.projectId}/voxels?palette=${encodeURIComponent(context.ref.id)}`),
  "toggle-note-pin": toggleNotePin,
  "toggle-preview": togglePreview,
  "move-to-column": moveToColumn,
  "add-to-sprint": addToSprint,
  "link-to-note": (run) => openLinkPicker(run, "Link to note", ["note"]),
  "new-note": pushTo(({ services, context }) => assetHref(services.projectId, "note", createNoteAbout(services.projectId, context.ref).id)),
  "add-to-diagram": openDiagramPicker,
  "create-task": pushTo(({ services, context }) => assetHref(services.projectId, "issue", createTaskFor(services.projectId, context.ref).id)),
  "link-to-asset": (run) => openLinkPicker(run, "Link to", undefined, true),
  "show-links": pushTo(({ services, context }) => `/project/${services.projectId}/assets?links=${context.ref.type}:${encodeURIComponent(context.ref.id)}`),
  duplicate,
  copy: copyInApp,
  "copy-system": copySystem,
  "copy-name": ({ services, context }) => copyText(services, context.name),
  "copy-link": ({ services, context }) => copyText(services, assetUrl(window.location.origin, services.projectId, context.ref)),
  "toggle-sidebar-pin": toggleSidebarPin,
  rename,
  delete: remove,
};

function runAction(services: MenuServices, ref: AssetRef, action: AssetActionId, arg: string | undefined, opener: HTMLElement | null): void {
  const target = readMenuTarget(services.projectId, ref);
  if (!target) return;
  const showFailure = (): void => services.showToast({ message: ACTION_FAILED_MESSAGE });
  try {
    Promise.resolve(ACTION_HANDLERS[action]({ ...target, services, arg, opener })).catch(showFailure);
  } catch {
    showFailure();
  }
}

function useLastPointerType(): React.RefObject<string | null> {
  const lastPointerType = useRef<string | null>(null);
  useEffect(() => {
    const trackPointer = (event: PointerEvent): void => {
      lastPointerType.current = event.pointerType;
    };
    const resetOnKey = (): void => {
      lastPointerType.current = null;
    };
    window.addEventListener("pointerdown", trackPointer, true);
    window.addEventListener("keydown", resetOnKey, true);
    return () => {
      window.removeEventListener("pointerdown", trackPointer, true);
      window.removeEventListener("keydown", resetOnKey, true);
    };
  }, []);
  return lastPointerType;
}

interface PressedTrigger {
  resolve: ResolveOpen;
  element: HTMLElement;
  event: Event;
}

interface PressTracker {
  longPress: LongPress;
  press(trigger: PressedTrigger): boolean;
  /** True once after a long-press that actually opened a menu. */
  consumeClick(): boolean;
}

/** One long-press controller for every trigger; the innermost trigger pressed last decides what opens. */
function createPressTracker(): PressTracker {
  let pressed: PressedTrigger | null = null;
  let hasOpened = false;
  const longPress = createLongPress((point) => {
    const open = pressed?.resolve();
    if (!open || !pressed) return;
    hasOpened = true;
    open(point, pressed.element);
  });
  const press = (trigger: PressedTrigger): boolean => {
    if (pressed?.event === trigger.event) return false;
    pressed = trigger;
    hasOpened = false;
    return true;
  };
  const consumeClick = (): boolean => {
    const shouldSuppress = longPress.consumeClick() && hasOpened;
    hasOpened = false;
    return shouldSuppress;
  };
  return { longPress, press, consumeClick };
}

function isNativeMenuTarget(target: EventTarget | null): boolean {
  const selectedText = window.getSelection()?.toString() ?? "";
  return shouldUseNativeMenu(target instanceof Element ? target : null, selectedText);
}

function isMenuKey(event: React.KeyboardEvent<Element>): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/**
 * Windows and Linux follow the menu key with a `contextmenu` event (Menu key: after keyup), which would open
 * a second menu or the browser's own over ours. Swallow it until the key is released, or a second at most.
 */
function swallowFollowUpContextMenu(): void {
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  const stop = (): void => {
    window.removeEventListener("contextmenu", swallow, true);
    window.removeEventListener("keyup", stopAfterKeyUp, true);
  };
  const stopAfterKeyUp = (): void => void setTimeout(stop, 0);
  window.addEventListener("contextmenu", swallow, true);
  window.addEventListener("keyup", stopAfterKeyUp, true);
  setTimeout(stop, FOLLOW_UP_CONTEXT_MENU_MS);
}

function useTriggerFactory(): (resolve: ResolveOpen) => MenuTriggerProps {
  const lastPointerType = useLastPointerType();
  const [{ longPress, press, consumeClick }] = useState(createPressTracker);

  return useCallback(
    (resolve: ResolveOpen): MenuTriggerProps => ({
      "data-asset-menu": "",
      onContextMenu(e) {
        const decision = contextMenuDecision({ isNativeTarget: isNativeMenuTarget(e.target), lastPointerType: lastPointerType.current });
        if (decision === "native") return;
        const open = resolve();
        if (!open) return;
        e.preventDefault();
        if (decision === "ignore") return;
        e.stopPropagation();
        const opener = e.currentTarget as HTMLElement;
        open(anchorPoint(e, opener.getBoundingClientRect()), opener);
      },
      onPointerDown(e) {
        if (!press({ resolve, element: e.currentTarget as HTMLElement, event: e.nativeEvent })) return;
        if (isNativeMenuTarget(e.target)) return longPress.cancel();
        longPress.down({ x: e.clientX, y: e.clientY, pointerType: e.pointerType });
      },
      onPointerMove: (e) => longPress.move({ x: e.clientX, y: e.clientY }),
      onPointerUp: () => longPress.up(),
      onPointerCancel: () => longPress.cancel(),
      onPointerLeave: () => longPress.cancel(),
      onClickCapture(e) {
        if (!consumeClick()) return;
        e.preventDefault();
        e.stopPropagation();
      },
      onKeyDown(e) {
        if (!isMenuKey(e) || isNativeMenuTarget(e.target)) return;
        const open = resolve();
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        const opener = e.target instanceof HTMLElement ? e.target : (e.currentTarget as HTMLElement);
        swallowFollowUpContextMenu();
        open(anchorPoint({ clientX: 0, clientY: 0 }, opener.getBoundingClientRect()), opener);
      },
    }),
    [lastPointerType, longPress, press, consumeClick],
  );
}

function useMenuState(): {
  menu: OpenMenuState | null;
  openMenu: AssetMenuApi["openMenu"];
  closeMenu(): void;
} {
  const [menu, setMenu] = useState<OpenMenuState | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openMenu = useCallback((anchor: Point, entries: ContextMenuEntry[], label: string, from?: HTMLElement | null) => {
    opener.current = from ?? null;
    setMenu((previous) => ({ id: (previous?.id ?? 0) + 1, anchor, entries, label }));
  }, []);
  const closeMenu = useCallback(() => {
    const from = opener.current;
    opener.current = null;
    setMenu(null);
    restoreFocus(from);
  }, []);
  return { menu, openMenu, closeMenu };
}

function usePickerState(): {
  picker: PickerRequest | null;
  openPicker: MenuServices["openPicker"];
  closePicker(): void;
} {
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openPicker = useCallback((request: PickerRequest, from: HTMLElement | null) => {
    opener.current = from;
    setPicker(request);
  }, []);
  const closePicker = useCallback(() => {
    const from = opener.current;
    opener.current = null;
    setPicker(null);
    restoreFocus(from);
  }, []);
  return { picker, openPicker, closePicker };
}

/** Re-mounts the editor only after a pending `router.replace` has landed, so it reads the new `?open=`. */
export function useNavigateThenReload(openId: string | null, reloadView: () => void): MenuServices["navigateThenReload"] {
  const router = useRouter();
  const pendingOpen = useRef<{ open: string | null } | null>(null);
  useEffect(() => {
    if (pendingOpen.current?.open !== openId) return;
    pendingOpen.current = null;
    reloadView();
  }, [openId, reloadView]);
  return useCallback(
    (href: string, open: string | null) => {
      router.replace(href, { scroll: false });
      if (willOpenParamChange(open, openId)) pendingOpen.current = { open };
      else reloadView();
    },
    [router, openId, reloadView],
  );
}

function useMenuServices(projectId: string | null, openPicker: MenuServices["openPicker"]): MenuServices | null {
  const pathname = usePathname();
  const openId = useSearchParams().get("open");
  const router = useRouter();
  const { showToast } = useToast();
  const { reloadView } = useSync();
  const navigateThenReload = useNavigateThenReload(openId, reloadView);
  return useMemo(
    () =>
      projectId ? { projectId, pathname, openId, router, showToast, reloadView, navigateThenReload, openPicker } : null,
    [projectId, pathname, openId, router, showToast, reloadView, navigateThenReload, openPicker],
  );
}

async function pasteFromClipboard(services: MenuServices | null, type?: AssetType): Promise<void> {
  const clip = readClipboard();
  if (!services || !clip || (type && clip.type !== type) || !canPaste(clip, services.projectId).ok) return;
  const outcome = await mutate(services, () => created(pasteAsset(clip, services.projectId)));
  if (outcome) toastWithOpen(services, `Pasted ${nameOf(services.projectId, outcome.ref)}`, outcome.ref);
}

function assetMenuOpener(services: MenuServices | null, ref: AssetRef, openMenu: AssetMenuApi["openMenu"]): OpenAt | null {
  const target = services && readMenuTarget(services.projectId, ref);
  if (!services || !target) return null;
  return (anchor, opener) => {
    const run = (action: AssetActionId, arg?: string): void => runAction(services, ref, action, arg, opener);
    openMenu(anchor, toMenuEntries(getAssetMenuEntries(target.context), run), target.context.name, opener);
  };
}

function pasteMenuOpener(services: MenuServices | null, type: AssetType | undefined, openMenu: AssetMenuApi["openMenu"]): OpenAt | null {
  const clip = readClipboard();
  if (!services || !clip || (type && clip.type !== type)) return null;
  const check = canPaste(clip, services.projectId);
  const paste = (): void => void pasteFromClipboard(services, type);
  const entries: ContextMenuEntry[] = [
    { kind: "item", key: "paste", label: "Paste", disabled: !check.ok, hint: check.ok ? undefined : check.reason, onSelect: paste },
  ];
  return (anchor, opener) => openMenu(anchor, entries, "Paste", opener);
}

function createAssetMenuApi(
  projectId: string | null,
  services: MenuServices | null,
  openMenu: AssetMenuApi["openMenu"],
  createTriggerProps: (resolve: ResolveOpen) => MenuTriggerProps,
): AssetMenuApi {
  const openWhenInProject: AssetMenuApi["openMenu"] = (anchor, entries, label, opener) => {
    if (services) openMenu(anchor, entries, label, opener);
  };
  return {
    projectId,
    openAssetMenu: (anchor, ref, opener) => assetMenuOpener(services, ref, openMenu)?.(anchor, opener ?? null),
    openMenu: openWhenInProject,
    assetTriggerProps: (ref) => createTriggerProps(() => assetMenuOpener(services, ref, openMenu)),
    menuTriggerProps: (getEntries, label) =>
      createTriggerProps(() => {
        const entries = services ? getEntries() : null;
        return entries ? (anchor, opener) => openMenu(anchor, entries, label, opener) : null;
      }),
    pasteTriggerProps: (type) => createTriggerProps(() => pasteMenuOpener(services, type, openMenu)),
    paste: (type) => pasteFromClipboard(services, type),
  };
}

function OpenPicker({ projectId, request, onClose }: { projectId: string; request: PickerRequest; onClose(): void }): React.JSX.Element {
  const { onCreate, onPick } = request;
  const handleCreate = (): void => {
    onClose();
    onCreate?.();
  };
  const handlePick = (ref: AssetRef): void => {
    onClose();
    onPick(ref);
  };
  return (
    <AssetPickerModal
      projectId={projectId}
      title={request.title}
      types={request.types}
      exclude={request.exclude}
      hiddenIds={request.hiddenIds}
      allowElements={request.allowElements}
      createLabel={request.createLabel}
      onCreate={onCreate ? handleCreate : undefined}
      onPick={handlePick}
      onClose={onClose}
    />
  );
}

const NO_ACTIONS_ENTRIES: ContextMenuEntry[] = [
  { kind: "item", key: "no-actions", label: "No actions here", detail: "Right-click an asset, card or item to see what you can do with it.", disabled: true },
];

function linkEntries(link: HTMLAnchorElement, showToast: (options: ToastOptions) => void): ContextMenuEntry[] {
  const copyLink = async (): Promise<void> => {
    const isCopied = await copyToSystemClipboard({ kind: "text", text: link.href });
    showToast({ message: isCopied ? "Link copied" : COPY_FAILED_MESSAGE });
  };
  return [
    { kind: "item", key: "open", label: "Open", onSelect: () => link.click() },
    { kind: "item", key: "open-new-tab", label: "Open in new tab", onSelect: () => void window.open(link.href, "_blank", "noopener") },
    { kind: "item", key: "copy-link", label: "Copy link", onSelect: () => void copyLink() },
  ];
}

/**
 * Right-clicks nothing else handled get our menu too, so the studio never mixes in the browser's own menu:
 * links get open / copy, everything else a short "No actions here". Text fields and selected text keep the browser's.
 */
function useFallbackContextMenu(openMenu: AssetMenuApi["openMenu"], showToast: (options: ToastOptions) => void): void {
  const lastPointerType = useLastPointerType();
  useEffect(() => {
    const openFallback = (event: MouseEvent): void => {
      if (event.defaultPrevented) return;
      const decision = contextMenuDecision({ isNativeTarget: isNativeMenuTarget(event.target), lastPointerType: lastPointerType.current });
      if (decision !== "open") return;
      event.preventDefault();
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="menu"], [role="dialog"], [role="alertdialog"]')) return;
      const link = target?.closest("a[href]");
      const opener = target instanceof HTMLElement ? target : null;
      const anchor = anchorPoint(event, (target ?? document.body).getBoundingClientRect());
      if (link instanceof HTMLAnchorElement) openMenu(anchor, linkEntries(link, showToast), link.textContent?.trim() || "Link", opener);
      else openMenu(anchor, NO_ACTIONS_ENTRIES, "No actions", opener);
    };
    window.addEventListener("contextmenu", openFallback);
    return () => window.removeEventListener("contextmenu", openFallback);
  }, [openMenu, showToast, lastPointerType]);
}

/** Holds the one asset menu and picker; surfaces only spread the trigger props it hands out. */
export function AssetContextMenuProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const projectId = usePathname().match(PROJECT_PATH)?.[1] ?? null;
  const { menu, openMenu, closeMenu } = useMenuState();
  const { picker, openPicker, closePicker } = usePickerState();
  const services = useMenuServices(projectId, openPicker);
  const createTriggerProps = useTriggerFactory();
  const { showToast } = useToast();
  useFallbackContextMenu(openMenu, showToast);

  const api = useMemo(
    () => createAssetMenuApi(projectId, services, openMenu, createTriggerProps),
    [projectId, services, openMenu, createTriggerProps],
  );

  return (
    <AssetMenuApiContext.Provider value={api}>
      {children}
      {menu && <ContextMenu key={menu.id} anchor={menu.anchor} entries={menu.entries} label={menu.label} onClose={closeMenu} />}
      {picker && projectId && <OpenPicker projectId={projectId} request={picker} onClose={closePicker} />}
    </AssetMenuApiContext.Provider>
  );
}
