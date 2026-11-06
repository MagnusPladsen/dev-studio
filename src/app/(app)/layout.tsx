"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Paintbrush,
  Music,
  Volume2,
  GitBranch,
  BookOpen,
  Grid3X3,
  MessageSquare,
  Palette,
  Package,
  NotebookPen,
  SquareKanban,
  Scale,
  FolderOpen,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Pin,
  X,
} from "lucide-react";
import { useState, Suspense } from "react";
import { SyncProvider, useSync } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toast";
import { AssetContextMenuProvider, useAssetMenu } from "@/components/AssetContextMenu";
import { LiveRefresh } from "@/components/LiveRefresh";
import { WhatsNewButton, WhatsNewOnUpdate } from "@/components/WhatsNew";
import type { ContextMenuEntry } from "@/components/ContextMenu";
import { anchorPoint, type Point } from "@/lib/menu-position";
import { SidebarPins } from "@/components/SidebarPins";
import { AccountPanel } from "@/components/AccountPanel";
import { BetaBadge } from "@/components/BetaBadge";
import { ToolTutorial } from "@/components/ToolTutorial";
import { NewBadge, isNewTool } from "@/components/NewBadge";
import { ASSET_KINDS, ASSET_TYPES } from "@/lib/assets";
import { APP } from "@/lib/app-config";
import { getPins, isToolPinned, orderTools, toggleToolPin } from "@/lib/pins";
import { useStorageVersion } from "@/hooks/useStorage";
import { storage } from "@/lib/storage";
import { COPY } from "@/copy";

/** Tints the shared surface colours with a tool's colour, so every editor inside picks it up. */
function toolTheme(color?: string, onAccent = "#0b0b10"): React.CSSProperties {
  if (!color) return {};
  const mix = (pct: number, base: string) => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  return {
    "--tool-color": color,
    "--bg-primary": mix(4, "#0a0a0f"),
    "--bg-secondary": mix(6, "#12121a"),
    "--bg-card": mix(7, "#16161f"),
    "--bg-hover": mix(11, "#1e1e2a"),
    "--border": mix(14, "#2a2a3a"),
    "--border-hover": mix(22, "#3a3a4f"),
    "--accent": color,
    "--accent-hover": `color-mix(in srgb, ${color} 85%, #000)`,
    "--accent-glow": `color-mix(in srgb, ${color} 16%, transparent)`,
    "--on-accent": onAccent,
    background: "var(--bg-primary)",
  } as React.CSSProperties;
}

const allToolNav = [
  { icon: LayoutDashboard, name: "Assets", path: "assets", color: "var(--text-secondary)" },
  { icon: SquareKanban, name: "Task Board", path: "board", color: ASSET_KINDS.issue.color },
  { icon: Paintbrush, name: "Pixel Art", path: "pixel-art", color: ASSET_KINDS.sprite.color, onAccent: "#fff" },
  { icon: Box, name: "3D Pixel Art", path: "voxels", color: ASSET_KINDS.model.color, onAccent: "#0b0b10" },
  { icon: Music, name: "Music", path: "music", color: ASSET_KINDS.music.color },
  { icon: Volume2, name: "SFX", path: "sfx", color: ASSET_KINDS.sound.color },
  { icon: Grid3X3, name: "Tilemap", path: "tilemap", color: ASSET_KINDS.tilemap.color },
  { icon: GitBranch, name: "Canvas", path: "diagrams", color: ASSET_KINDS.diagram.color },
  { icon: BookOpen, name: COPY.nav.story, path: "story", color: ASSET_KINDS.story.color },
  { icon: NotebookPen, name: "Notebook", path: "notebook", color: ASSET_KINDS.note.color },
  { icon: Scale, name: "Decision log", path: "decisions", color: ASSET_KINDS.decision.color },
  { icon: MessageSquare, name: "Dialogue", path: "dialogue", color: ASSET_KINDS.dialogue.color },
  { icon: Palette, name: "Palettes", path: "palettes", color: ASSET_KINDS.palette.color },
  { icon: Package, name: "Sprite Sheets", path: "sprites", color: ASSET_KINDS.spritesheet.color },
];

const enabledToolPaths = new Set(ASSET_TYPES.map((type) => ASSET_KINDS[type].path));
const toolNav = allToolNav.filter((tool) => tool.path === "assets" || enabledToolPaths.has(tool.path));

function toolMenuEntries(projectId: string, path: string): ContextMenuEntry[] {
  const pinned = isToolPinned(projectId, path);
  return [{ kind: "item", key: "pin", label: pinned ? "Unpin" : "Pin to top", onSelect: () => toggleToolPin(projectId, path) }];
}

/** Phone-only `⋯` on a tool row; opens the same menu as right-click. */
function ToolMenuButton({ name, onOpen }: { name: string; onOpen(anchor: Point, opener: HTMLElement): void }): React.JSX.Element {
  const title = `More actions for ${name}`;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        onOpen(anchorPoint(event, button.getBoundingClientRect()), button);
      }}
      className="md:hidden absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md"
      style={{ color: "var(--text-primary)" }}
    >
      <MoreHorizontal className="w-3.5 h-3.5" />
    </button>
  );
}

/** Desktop-only pin at the right of a tool row: shows on hover or focus, and stays filled while the tool is pinned. */
function ToolPinButton({ projectId, path, name, color }: { projectId: string; path: string; name: string; color: string }): React.JSX.Element {
  const isPinned = isToolPinned(projectId, path);
  const title = isPinned ? `Unpin ${name} from the top` : `Pin ${name} to the top`;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isPinned}
      onClick={() => toggleToolPin(projectId, path)}
      className={`max-md:hidden absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded ${isPinned ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"}`}
      style={{ color: isPinned ? color : "var(--text-primary)" }}
    >
      <Pin className="w-3 h-3" fill={isPinned ? "currentColor" : "none"} />
    </button>
  );
}

function AppSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { ready, generation } = useSync();
  useStorageVersion();
  const { openMenu, menuTriggerProps } = useAssetMenu();

  const projectMatch = pathname.match(/\/project\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const isProjectView = !!projectId;
  const activeTool = toolNav.find((t) => t.path !== "assets" && pathname.startsWith(`/project/${projectId}/${t.path}`)) as
    | ((typeof toolNav)[number] & { onAccent?: string })
    | undefined;
  const projectName = projectId ? storage.getById("projects", projectId)?.name : undefined;
  const pageTitle = activeTool?.name ?? (pathname.endsWith("/assets") ? "Project" : pathname === "/projects" ? "Projects" : APP.name);

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: "var(--bg-primary)" }}>

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-56 flex flex-col border-r transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="h-14 flex items-center px-4 border-b" style={{ borderColor: "var(--border)" }}>
          <Link href="/" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs"
              style={{ background: "var(--accent)" }}
            >
              {APP.initials}
            </div>
            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              {APP.name}
            </span>
            <BetaBadge />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {!isProjectView ? (
            <div className="px-2">
              <Link
                href="/projects"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: pathname === "/projects" ? "var(--text-primary)" : "var(--text-secondary)",
                  background: pathname === "/projects" ? "var(--bg-hover)" : "transparent",
                }}
              >
                <FolderOpen className="w-4 h-4" />
                Projects
              </Link>
            </div>
          ) : (
            <>
              <div className="px-2 mb-1">
                <Link
                  href="/projects"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ChevronLeft className="w-3 h-3" />
                  All Projects
                </Link>
              </div>
              <SidebarPins projectId={projectId} onNavigate={() => setSidebarOpen(false)} />
              <div className="px-2 space-y-0.5">
                {orderTools(toolNav, getPins(projectId).tools).map((tool) => {
                  const href = `/project/${projectId}/${tool.path}`;
                  const isActive = pathname === href;
                  const link = (
                    <Link
                      key={tool.path}
                      href={href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                        background: isActive ? `color-mix(in srgb, ${tool.color} 14%, transparent)` : "transparent",
                      }}
                      onClick={() => setSidebarOpen(false)}
                      {...(tool.path === "assets" ? {} : menuTriggerProps(() => toolMenuEntries(projectId, tool.path), tool.name))}
                    >
                      <tool.icon className="w-4 h-4" style={{ color: isActive ? tool.color : undefined }} />
                      {tool.name}
                      {isNewTool(tool.path) && <NewBadge className="ml-auto max-md:mr-8 md:mr-5" />}
                    </Link>
                  );
                  if (tool.path === "assets") return link;
                  return (
                    <div key={tool.path} className="group relative">
                      {link}
                      <ToolPinButton projectId={projectId} path={tool.path} name={tool.name} color={tool.color} />
                      <ToolMenuButton name={tool.name} onOpen={(anchor, opener) => openMenu(anchor, toolMenuEntries(projectId, tool.path), tool.name, opener)} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <WhatsNewButton />
          <AccountPanel />
        </div>
      </aside>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
      {/* Phone top bar: menu + where you are. Hidden from md up, so desktop is unchanged. */}
      <header
        className="md:hidden flex items-center gap-2 h-12 shrink-0 border-b"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
          paddingLeft: "max(8px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(12px, env(safe-area-inset-right, 0px))",
        }}
      >
        <button
          className="p-2 rounded-lg"
          style={{ color: "var(--text-primary)" }}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        {activeTool && <activeTool.icon className="w-4 h-4 shrink-0" style={{ color: activeTool.color }} />}
        <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {pageTitle}
        </span>
        {projectName && (
          <span className="text-xs truncate ml-auto max-w-[45%]" style={{ color: "var(--text-muted)" }}>
            {projectName}
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-auto" style={toolTheme(activeTool?.color, activeTool?.onAccent)}>
        {ready ? (
          <div key={generation} className="h-full">
            {children}
            {projectId && <ToolTutorial projectId={projectId} />}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading your projects…
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm mx-auto mb-3" style={{ background: "var(--accent)" }}>
            {APP.initials}
          </div>
          <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
        </div>
      </div>
    }>
      <SyncProvider>
        <ToastProvider>
          <AssetContextMenuProvider>
            <LiveRefresh />
            <WhatsNewOnUpdate />
            <AppSidebar>{children}</AppSidebar>
          </AssetContextMenuProvider>
        </ToastProvider>
      </SyncProvider>
    </Suspense>
  );
}
