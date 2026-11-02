import Image from "next/image";
import Link from "next/link";
import { BetaBadge } from "@/components/BetaBadge";
import { DesktopDownload } from "@/components/DesktopDownload";
import { ASSET_ICONS } from "@/components/asset-icons";
import { ASSET_KINDS } from "@/lib/assets";
import { supabaseEnabled } from "@/lib/supabase";
import type { AssetType } from "@/types";
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
  ArrowRight,
  Sparkles,
  Download,
  Globe,
  NotebookPen,
  SquareKanban,
  LogIn,
  WifiOff,
  ShieldCheck,
  FolderOpen,
  UserX,
  Gift,
  Monitor,
  Link2,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function ToolCard({ icon: Icon, name, description }: { icon: React.ComponentType<{ className?: string }>; name: string; description: string }) {
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

const tools = [
  { icon: Paintbrush, name: "Pixel Art Editor", description: "Draw sprites with layers, frames, and onion skinning. Create animations and export sprite sheets." },
  { icon: Box, name: "Voxel Models", description: "Build chunky 3D props and characters with your palettes. Export to Blender, Godot and Unity." },
  { icon: Music, name: "Music Composer", description: "Pattern-based music creation with multiple channels and instruments. Think BeepBox meets FL Studio." },
  { icon: Volume2, name: "SFX Generator", description: "Generate retro and modern sound effects with presets for explosions, lasers, pickups, and more." },
  { icon: Grid3X3, name: "Tilemap Editor", description: "Paint game levels using your own sprites. Multiple layers, auto-tiling, and collision maps." },
  { icon: GitBranch, name: "Diagrams & Boards", description: "Moodboards, story flow, level plans and reference boards with notes, images, videos, links and to-dos. Flow charts and state machines too." },
  { icon: BookOpen, name: "Story & Worldbuilding", description: "Write lore, create characters, and link everything together. Wiki-style connections like Obsidian." },
  { icon: MessageSquare, name: "Dialogue Trees", description: "Visual branching dialogue editor for RPGs and adventure games. Connect speakers and choices." },
  { icon: Palette, name: "Color Palettes", description: "Manage and share color palettes across all your tools. Built-in game-ready palette presets." },
  { icon: Package, name: "Sprite Sheet Packer", description: "Combine multiple sprites into optimized sprite sheets ready for any game engine." },
  { icon: SquareKanban, name: "Task Board", description: "Plan sprints like Jira: To Do, In Progress, Testing, Done. Issues link to the assets they're about." },
  { icon: NotebookPen, name: "Notebook", description: "Ideas, to-do lists, design docs and bug lists, with checklists and links to any asset." },
];

const heroLinks: { type: AssetType; name: string }[] = [
  { type: "story", name: "Pip" },
  { type: "sprite", name: "Pip (walk)" },
  { type: "sound", name: "Jump" },
  { type: "model", name: "Pip (3D)" },
  { type: "diagram", name: "Player States" },
];

function AssetChip({ type, name }: { type: AssetType; name: string }) {
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

const linkingExamples = [
  {
    image: "/landing/linking-story.webp",
    width: 958,
    height: 1090,
    maxWidth: 480,
    alt: "Pip's story entry: wiki links to The Great Fall, Elder Maren and The Lost Sword show as coloured chips, and the Linked panel lists Pip's sprite, jump sound, 3D model, state diagram, sprite sheet and related story entries.",
    kicker: "Character hub",
    title: "One story entry ties a character together",
    description:
      "Pip's story entry is the place to start. Type [[ to link another entry, like Elder Maren or the Sunsteel Sword, and use + Link to attach Pip's sprite, jump sound, 3D model and state diagram. Click any of them to jump straight into its tool.",
    points: ["[[Wiki links]] between story entries", "Mentioned in: every entry that links back", "Links work both ways, so the sprite lists Pip too"],
  },
  {
    image: "/landing/linking-board.webp",
    width: 1280,
    height: 985,
    maxWidth: 910,
    alt: "The Task Board with the issue Slime patrol and chase AI open on the right. Its description points to the Slime AI diagram, which is listed in its Linked panel.",
    kicker: "Task Board",
    title: "Tasks point at the work they're about",
    description:
      "Issues on the Task Board link to the assets they produce. Slime patrol & chase AI links to the Slime AI diagram, the title-music task to the track itself. The link count shows on every card, so you can see what's connected before you open it.",
    points: ["Open the linked asset right from the issue", "Notes you add to an issue stay linked to it", "Bugs link to the notes that describe them"],
  },
  {
    image: "/landing/linking-diagram.webp",
    width: 1280,
    height: 960,
    maxWidth: 656,
    alt: "A Look and feel group on a Diagrams board: a pixel-art meadow mood image, a 13-colour palette strip and a note, with cards for the Pip (walk) sprite, the Pip (3D) voxel model and the Mossbrook Meadow palette.",
    kicker: "Diagrams & Boards",
    title: "Put real assets on your moodboard",
    description:
      "Drop sprites, voxel models, palettes and music onto a board as cards, next to your notes, images and references. Each card shows the asset itself and opens it in its own tool, so the board stays in step as the game changes.",
    points: ["Cards for any asset in the project", "Group, connect and label them", "Edit the asset and the card follows"],
  },
];

function LinkingExample({ example, reversed }: { example: (typeof linkingExamples)[number]; reversed: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-6 lg:gap-12 items-center ${reversed ? "lg:grid-cols-[2fr_3fr]" : "lg:grid-cols-[3fr_2fr]"}`}>
      <div className={reversed ? "lg:order-2" : undefined}>
        <Image
          src={example.image}
          width={example.width}
          height={example.height}
          alt={example.alt}
          sizes="(max-width: 1024px) 100vw, 660px"
          className="w-full h-auto mx-auto rounded-xl border"
          style={{ borderColor: "var(--border)", maxWidth: example.maxWidth }}
        />
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "var(--accent)" }}>
          {example.kicker}
        </div>
        <h3 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
          {example.title}
        </h3>
        <p className="leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
          {example.description}
        </p>
        <ul className="space-y-2">
          {example.points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <Link2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const localPros = [
  { icon: WifiOff, title: "Works offline", description: "No internet needed once it's installed. Make your game on a plane or a train." },
  { icon: ShieldCheck, title: "Private", description: "Your projects never leave your computer unless you choose to share them." },
  { icon: FolderOpen, title: "Your files", description: "Save projects as plain JSON in any folder. Back them up, sync them, or keep them in git." },
  { icon: UserX, title: "No account", description: "Open the app and start making. Nothing to sign up for, nothing to log in to." },
  { icon: Gift, title: "Free forever", description: "Every tool and every export, with no watermark and no paid tier." },
  { icon: GithubIcon, title: "Open source", description: "MIT licensed. Read the code, change it, or run it from source." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md" style={{ borderColor: "var(--border)", background: "rgba(10,10,15,0.8)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: "var(--accent)" }}>
              GD
            </div>
            <span className="font-semibold text-base sm:text-lg whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              GameDev Studio
            </span>
            <BetaBadge className="max-[380px]:hidden" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <a
              href="https://github.com/magnuspladsen/gamedev-studio"
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

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full animate-glow"
            style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }}
          />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 animate-fade-in"
            style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(124,92,252,0.2)" }}
          >
            <Sparkles className="w-3 h-3" />
            Public beta · Free &amp; open source · No watermarks
          </div>
          <h1
            className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight mb-6 text-balance animate-fade-in stagger-1 opacity-0"
            style={{ color: "var(--text-primary)" }}
          >
            Everything you need to
            <br />
            <span style={{ color: "var(--accent)" }}>make your game</span>
          </h1>
          <p
            className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 animate-fade-in stagger-2 opacity-0 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Pixel art, music, sound effects, tilemaps, dialogue, story &amp;
            worldbuilding, moodboards and diagrams — all connected in one free toolkit.
            Create, link, and export everything for your game.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in stagger-3 opacity-0">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Start Creating
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/magnuspladsen/gamedev-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-80"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <GithubIcon className="w-4 h-4" />
              View on GitHub
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-80"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <Monitor className="w-4 h-4" />
              Download the app
            </a>
          </div>
        </div>
      </section>

      {/* Linking idea */}
      <section className="pb-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto rounded-2xl border p-6 sm:p-8 text-center" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
            Everything links to everything
          </h2>
          <p className="max-w-2xl mx-auto mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Any asset can link to any other: sprites, voxels, tilemaps, palettes, music, sound effects,
            dialogue, story entries, diagrams, notes and tasks. A character&apos;s story entry connects to
            their sprite, theme music, dialogue and the tasks to build them, and story{" "}
            <code style={{ color: "var(--text-primary)" }}>[[wiki links]]</code> count too.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 mb-6">
            {heroLinks.map((asset, index) => (
              <span key={asset.name} className="inline-flex items-center gap-1.5">
                {index > 0 && <Link2 className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden />}
                <AssetChip {...asset} />
              </span>
            ))}
          </div>
          <a href="#linking" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline" style={{ color: "var(--accent)" }}>
            See how linking works
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              One toolkit. Every asset.
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Stop switching between a dozen apps. Create all your game assets
              in one place, and they automatically connect to each other.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <ToolCard key={tool.name} {...tool} />
            ))}
          </div>
        </div>
      </section>

      {/* How linking works */}
      <section id="linking" className="py-20 px-4 sm:px-6 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              How linking works
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Every asset has a Linked panel. Press + Link, pick anything in the project, and both sides
              show the connection. Here&apos;s how it looks in the example game you can add to any
              project.
            </p>
          </div>
          <div className="space-y-16 lg:space-y-20">
            {linkingExamples.map((example, index) => (
              <LinkingExample key={example.title} example={example} reversed={index % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6" style={{ background: "var(--bg-secondary)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
                <Download className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
                Free Downloads, No Watermarks
              </h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Export everything you create as PNG, WAV, JSON, or sprite
                sheets. No limitations, no sign-up required.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }}>
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
                Works Everywhere
              </h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Works without an account. Sign in to sync across devices, or
                self-host and save straight to a folder on your computer.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(244,114,182,0.15)", color: "var(--pink)" }}>
                <GithubIcon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
                Open Source
              </h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                MIT licensed. View the source, contribute features, or fork
                it. Built by game devs, for game devs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Desktop app */}
      <section id="download" className="py-20 px-4 sm:px-6 scroll-mt-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-14 items-start">
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(124,92,252,0.2)" }}
            >
              <Monitor className="w-3 h-3" />
              Desktop app for Mac, Windows &amp; Linux
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              Keep it on your machine
            </h2>
            <p className="text-lg mb-8 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
              Download GameDev Studio and run every tool on your own computer. Same studio as the web
              version, with your projects saved where you want them.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {localPros.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-sm mt-8" style={{ color: "var(--text-muted)" }}>
              Prefer to build it yourself?{" "}
              <a
                href="https://github.com/MagnusPladsen/gamedev-studio#run-it-yourself"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                Run it from source
              </a>{" "}
              with Node.js.
            </p>
          </div>
          <DesktopDownload />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
            Ready to build your game?
          </h2>
          <p className="text-lg mb-8" style={{ color: "var(--text-secondary)" }}>
            Create a project and start making assets. Everything links
            together — sprites connect to tilemaps, dialogue references
            characters, and notes tie it all together.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-medium text-lg transition-all hover:opacity-90"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Open Studio
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs" style={{ background: "var(--accent)" }}>
              GD
            </div>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              GameDev Studio — Free &amp; Open Source
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm" style={{ color: "var(--text-muted)" }}>
            <a
              href="https://github.com/magnuspladsen/gamedev-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--text-secondary)" }}
            >
              GitHub
            </a>
            <span>MIT License</span>
            <span>Beta</span>
            <a
              href="https://pladsen.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--text-secondary)" }}
            >
              pladsen.dev
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
