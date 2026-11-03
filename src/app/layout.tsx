import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { APP, type AppId } from "@/lib/app-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const METADATA: Record<AppId, Metadata> = {
  "gamedev-studio": {
    title: "GameDev Studio (Beta) - Free Open Source Game Development Toolkit",
    description:
      "Create pixel art, music, sound effects, tilemaps, dialogue trees, and plan your game — all in one free, open source app. No watermarks. No paywalls.",
    keywords: [
      "game development",
      "pixel art",
      "sprite editor",
      "game music",
      "sound effects",
      "tilemap editor",
      "dialogue tree",
      "open source",
      "free",
      "indie game dev",
    ],
  },
  "dev-studio": {
    title: "Dev Studio (Beta) - Free Open Source Project Planning Toolkit",
    description:
      "Plan software projects with a task board, a canvas for diagrams and moodboards, a linked wiki, a notebook and a decision log — all connected in one free, open source app. No sign-up needed.",
    keywords: ["task board", "kanban", "sprint planning", "whiteboard", "diagrams", "wiki", "notes", "decision log", "ADR", "open source", "free"],
  },
};

export const metadata: Metadata = { metadataBase: new URL(APP.url), ...METADATA[APP.id] };

/** Each app's brand colour, so the two sites can't be mixed up at a glance. */
const appTheme = {
  "--accent": APP.accent,
  "--accent-hover": APP.accentHover,
  "--accent-glow": `color-mix(in srgb, ${APP.accent} 15%, transparent)`,
} as React.CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={appTheme}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
