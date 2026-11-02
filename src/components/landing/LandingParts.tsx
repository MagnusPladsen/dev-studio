import Link from "next/link";
import { ArrowUpRight, LogIn } from "lucide-react";
import { BetaBadge } from "@/components/BetaBadge";
import { APP, OTHER_APP, isDevStudio } from "@/lib/app-config";
import { supabaseEnabled } from "@/lib/supabase";
import { ASSET_ICONS } from "@/components/asset-icons";
import { ASSET_KINDS } from "@/lib/assets";
import type { AssetType } from "@/types";

export const GITHUB_URL = "https://github.com/magnuspladsen/dev-studio";

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export function ToolCard({ icon: Icon, name, description }: { icon: React.ComponentType<{ className?: string }>; name: string; description: string }) {
  return (
    <div className="group p-5 rounded-xl border transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
        {name}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {description}
      </p>
    </div>
  );
}

export function LandingNav({ sections }: { sections: { href: string; label: string }[] }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md" style={{ borderColor: "var(--border)", background: "rgba(10,10,15,0.8)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: "var(--accent)" }}>
            {APP.initials}
          </div>
          <span className="font-semibold text-base sm:text-lg whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
            {APP.name}
          </span>
          <BetaBadge className="max-[380px]:hidden" />
        </div>
        <div className="hidden md:flex items-center gap-1">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg transition-colors hover:opacity-80 hidden sm:block"
            style={{ color: "var(--text-secondary)" }}
            aria-label="GitHub repository"
          >
            <GithubIcon className="w-5 h-5" />
          </a>
          {supabaseEnabled && (
            <Link
              href="/projects?signin=1"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <LogIn className="w-4 h-4 max-[380px]:hidden" />
              Sign in
            </Link>
          )}
          <Link
            href="/projects"
            className="px-3 sm:px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all hover:opacity-90"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Open Studio
          </Link>
        </div>
      </div>
    </nav>
  );
}

const OTHER_APP_PITCH = isDevStudio
  ? {
      question: "Making a game?",
      pitch: "GameDev Studio has these planning tools plus pixel art, 3D pixel art, music, sound effects, tilemaps and dialogue trees, all linked together.",
    }
  : {
      question: "Planning something that isn't a game?",
      pitch: "Dev Studio is the Task Board, Canvas, Wiki and Notebook on their own, made for any software project. Same account, same free tools.",
    };

/** "Have you tried the other studio?" card, in the other app's own colour. */
export function OtherAppPromo() {
  return (
    <section className="py-12 px-4 sm:px-6">
      <a
        href={OTHER_APP.url}
        className="group max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-5 rounded-2xl border p-6 sm:p-8 transition-colors hover:bg-[var(--bg-hover)]"
        style={{ background: "var(--bg-secondary)", borderColor: `color-mix(in srgb, ${OTHER_APP.accent} 40%, var(--border))` }}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0" style={{ background: OTHER_APP.accent, color: "white" }}>
          {OTHER_APP.initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-1" style={{ color: OTHER_APP.accent }}>
            {OTHER_APP_PITCH.question} Have you tried {OTHER_APP.name}?
          </p>
          <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {OTHER_APP_PITCH.pitch}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0"
          style={{ background: OTHER_APP.accent, color: "white" }}
        >
          Open {OTHER_APP.name}
          <ArrowUpRight className="w-4 h-4" />
        </span>
      </a>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="py-8 px-4 sm:px-6 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs" style={{ background: "var(--accent)" }}>
            {APP.initials}
          </div>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {APP.name} — Free &amp; Open Source
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm" style={{ color: "var(--text-muted)" }}>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--text-secondary)" }}>
            GitHub
          </a>
          <span>MIT License</span>
          <span>Beta</span>
          <a href="https://pladsen.dev" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--text-secondary)" }}>
            pladsen.dev
          </a>
        </div>
      </div>
    </footer>
  );
}

export function AssetChip({ type, name }: { type: AssetType; name: string }) {
  const { color, label } = ASSET_KINDS[type];
  const Icon = ASSET_ICONS[type];
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md text-xs sm:text-sm whitespace-nowrap"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      {name}
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </span>
  );
}
