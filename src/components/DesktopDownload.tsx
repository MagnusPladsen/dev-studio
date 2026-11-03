"use client";

import { useSyncExternalStore } from "react";
import { Download, ExternalLink } from "lucide-react";
import { APP } from "@/lib/app-config";

type Platform = "mac" | "windows" | "linux";

const RELEASES_URL = "https://github.com/MagnusPladsen/dev-studio/releases";

/** File names are fixed per app in desktop/electron-builder.ts so these links always point at the newest release. */
const ASSET_PREFIX = APP.name.replaceAll(" ", "-");

const DOWNLOADS: { platform: Platform; name: string; detail: string; file: string }[] = [
  { platform: "mac", name: "macOS", detail: "Apple Silicon (M1 or newer)", file: `${ASSET_PREFIX}-mac-arm64.dmg` },
  { platform: "mac", name: "macOS", detail: "Intel", file: `${ASSET_PREFIX}-mac-x64.dmg` },
  { platform: "windows", name: "Windows", detail: "Windows 10 and 11, 64-bit", file: `${ASSET_PREFIX}-windows-x64.exe` },
  { platform: "linux", name: "Linux", detail: "AppImage, any distro", file: `${ASSET_PREFIX}-linux-x64.AppImage` },
  { platform: "linux", name: "Linux", detail: ".deb for Ubuntu and Debian", file: `${ASSET_PREFIX}-linux-x64.deb` },
];

const BREW_COMMAND = `brew install --cask magnuspladsen/tap/${APP.id}`;

const downloadUrl = (file: string) => `${RELEASES_URL}/latest/download/${file}`;

function detectPlatform(): Platform | null {
  const userAgent = navigator.userAgent;
  // iPads report a Mac user agent, so touch support tells them apart.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
  if (isMobile) return null;
  if (/Mac/i.test(userAgent)) return "mac";
  if (/Win/i.test(userAgent)) return "windows";
  if (/Linux|X11|CrOS/i.test(userAgent)) return "linux";
  return null;
}

const subscribeToNothing = () => () => {};

export function DesktopDownload() {
  const platform = useSyncExternalStore(subscribeToNothing, detectPlatform, () => null);
  const recommended = DOWNLOADS.find((download) => download.platform === platform);
  const others = DOWNLOADS.filter((download) => download !== recommended);

  return (
    <div className="p-5 sm:p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <a
        href={recommended ? downloadUrl(recommended.file) : `${RELEASES_URL}/latest`}
        className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-lg font-medium text-lg transition-all hover:opacity-90"
        style={{ background: "var(--accent)", color: "white" }}
      >
        <Download className="w-5 h-5 shrink-0" />
        {recommended ? `Download for ${recommended.name}` : "Download the desktop app"}
      </a>
      <p className="text-xs text-center mt-2.5" style={{ color: "var(--text-muted)" }}>
        {recommended ? `${recommended.detail} · ` : "For Mac, Windows and Linux · "}Free, no sign-up, no watermark
      </p>

      <h3 className="text-sm font-semibold mt-6 mb-2" style={{ color: "var(--text-primary)" }}>
        {recommended ? "Other downloads" : "All downloads"}
      </h3>
      <ul className="divide-y rounded-lg border" style={{ borderColor: "var(--border)" }}>
        {others.map((download) => (
          <li key={download.file} style={{ borderColor: "var(--border)" }}>
            <a
              href={downloadUrl(download.file)}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="min-w-0">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {download.name}
                </span>
                <span className="block text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {download.detail}
                </span>
              </span>
              <Download className="w-4 h-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
            </a>
          </li>
        ))}
      </ul>

      <p className="text-xs mt-4" style={{ color: "var(--text-secondary)" }}>
        On a Mac with Homebrew:
      </p>
      <code
        className="block mt-1.5 px-3 py-2 rounded-lg border text-xs font-mono break-all select-all"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
      >
        {BREW_COMMAND}
      </code>

      <p className="text-xs leading-relaxed mt-4" style={{ color: "var(--text-muted)" }}>
        The app isn&apos;t code-signed yet, so the first launch shows a warning. On a Mac, open System Settings → Privacy
        &amp; Security and click <em>Open Anyway</em>. On Windows, click <em>More info</em> → <em>Run anyway</em>.
      </p>
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs mt-3 hover:underline"
        style={{ color: "var(--text-secondary)" }}
      >
        Release notes and older versions
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
