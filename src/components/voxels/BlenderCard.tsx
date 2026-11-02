"use client";

import { useSyncExternalStore } from "react";
import { Box, X } from "lucide-react";

const DISMISSED_KEY = "gds-ui:blender-card-dismissed";
export const BLENDER_URL = "https://www.blender.org/download/";
const MAGICAVOXEL_URL = "https://ephtracy.github.io/";
const BLOCKBENCH_URL = "https://www.blockbench.net";

export const BLENDER_MENU_DESCRIPTION = "Export .glb, then File → Import → glTF 2.0 in Blender";

const listeners = new Set<() => void>();
let isDismissedInMemory = false;

function readDismissed(): boolean {
  try {
    return isDismissedInMemory || localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return isDismissedInMemory;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismissCard(): void {
  isDismissedInMemory = true;
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // storage blocked: the card stays hidden for this visit only
  }
  listeners.forEach((listener) => listener());
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>
      {children}
    </a>
  );
}

function FullText(): React.JSX.Element {
  return (
    <>
      <p className="text-sm font-semibold pr-6" style={{ color: "var(--text-primary)" }}>
        Need more than cubes? Use Blender — it&apos;s free.
      </p>
      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        This tool is for quick, chunky models. For smooth shapes, sculpting, UV textures, rigging and animation, use{" "}
        <ExternalLink href={BLENDER_URL}>Blender</ExternalLink>: free and open source, and used for real games and films.
        Export your model as <strong>.glb</strong>, then in Blender choose <em>File → Import → glTF 2.0</em>. Your
        colours come with it.
      </p>
      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Also free: <ExternalLink href={MAGICAVOXEL_URL}>MagicaVoxel</ExternalLink> for big voxel scenes (open our{" "}
        <strong>.vox</strong> export) and <ExternalLink href={BLOCKBENCH_URL}>Blockbench</ExternalLink> for boxy low-poly
        models with pixel-art textures.
      </p>
    </>
  );
}

/** Recommends Blender for anything beyond voxels. Dismissible; the choice is remembered in this browser. */
export function BlenderCard(): React.JSX.Element | null {
  const isDismissed = useSyncExternalStore(subscribe, readDismissed, () => false);
  if (isDismissed) return null;
  return (
    <div
      className="relative flex gap-3 rounded-lg p-3 text-left"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)" }}
    >
      <Box className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
      <div className="min-w-0"><FullText /></div>
      <button
        onClick={dismissCard}
        className="absolute top-2 right-2 p-1 rounded"
        style={{ color: "var(--text-muted)" }}
        title="Hide this tip"
        aria-label="Hide the Blender tip"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
