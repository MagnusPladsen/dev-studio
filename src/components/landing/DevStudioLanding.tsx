import Link from "next/link";
import { ArrowRight, BookOpen, Download, GitBranch, Globe, Link2, NotebookPen, Scale, Sparkles, SquareKanban, Clapperboard, PenTool, LayoutGrid, Network } from "lucide-react";
import type { AssetType } from "@/types";
import { AssetChip, GITHUB_URL, GithubIcon, LandingFooter, LandingNav, OtherAppPromo, ToolCard } from "./LandingParts";

const tools = [
  { icon: SquareKanban, name: "Task Board", description: "Plan sprints like Jira: To Do, In Progress, Testing, Done. Issues link to the specs, diagrams and docs they're about." },
  { icon: GitBranch, name: "Canvas", description: "Architecture sketches, flow charts, moodboards and reference boards with notes, images, videos, links and to-dos." },
  { icon: BookOpen, name: "Wiki", description: "Pages for people, systems, components, goals and decisions, joined with [[wiki links]] and a graph of how it all connects." },
  { icon: NotebookPen, name: "Notebook", description: "Ideas, specs, meeting notes and bug lists, with checklists, folders, templates and links to anything." },
  { icon: Scale, name: "Decision log", description: "Architecture decision records (ADR-001, ADR-002…) with status, context, options and consequences. Supersede old ones and export to Markdown." },
];

const linkedExample: { type: AssetType; name: string }[] = [
  { type: "issue", name: "Resolve sync conflicts" },
  { type: "story", name: "Sync API" },
  { type: "diagram", name: "Architecture" },
  { type: "note", name: "Beta kickoff meeting" },
  { type: "decision", name: "ADR-003 Latest tick wins" },
];

const canvasFeatures = [
  {
    icon: Clapperboard,
    title: "Paste anything",
    description: "Paste or drop a link and the canvas knows what it is. Videos play on the canvas, images show as images, and every other site becomes a tidy link card.",
  },
  {
    icon: PenTool,
    title: "Sketch and diagram",
    description: "Rectangles, ellipses, diamonds and a freehand pen, joined by labelled arrows. Flow-chart cards for states, actions and conditions.",
  },
  {
    icon: LayoutGrid,
    title: "Organise it",
    description: "Notes, checklists and groups that stack cards into columns. Box-select, align, distribute, copy and duplicate, with undo for every step.",
  },
  {
    icon: Network,
    title: "Your real work on the canvas",
    description: "Issues, wiki pages and notes sit on the canvas as live cards. Open one and you're straight in its tool.",
  },
  {
    icon: Download,
    title: "Export it",
    description: "Save the whole canvas as a PNG or SVG picture, or as JSON to re-import. Free, with no watermark.",
  },
];

const navSections = [
  { href: "#tools", label: "Tools" },
  { href: "#canvas", label: "Canvas" },
];

export function DevStudioLanding() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      <LandingNav sections={navSections} />

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
            style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" }}
          >
            <Sparkles className="w-3 h-3" />
            Public beta · Free &amp; open source · No sign-up
          </div>
          <h1
            className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight mb-6 text-balance animate-fade-in stagger-1 opacity-0"
            style={{ color: "var(--text-primary)" }}
          >
            Plan, sketch and document
            <br />
            <span style={{ color: "var(--accent)" }}>your next project</span>
          </h1>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 animate-fade-in stagger-2 opacity-0 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            A task board, a canvas, a linked wiki, a notebook and a decision log — all connected in one free toolkit. Every issue, diagram
            and doc can link to the others.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in stagger-3 opacity-0">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Start Planning
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-80"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <GithubIcon className="w-4 h-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="pb-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto rounded-2xl border p-6 sm:p-8 text-center" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
            Everything links to everything
          </h2>
          <p className="max-w-2xl mx-auto mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            An issue links to the wiki page for the system it changes, the diagram that explains it and the meeting where
            it was decided. Links work both ways, and <code style={{ color: "var(--text-primary)" }}>[[wiki links]]</code> count too.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
            {linkedExample.map((asset, index) => (
              <span key={asset.name} className="inline-flex items-center gap-1.5">
                {index > 0 && <Link2 className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden />}
                <AssetChip {...asset} />
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="tools" className="py-20 px-4 sm:px-6 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              Five tools. One project.
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Stop juggling a ticket tracker, a whiteboard, a wiki and a folder of ADRs. Keep them in one place, connected to each other.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tools.map((tool, index) => (
              // an odd last card spans both columns instead of sitting alone
              <div key={tool.name} className={`grid ${index === tools.length - 1 && tools.length % 2 === 1 ? "sm:col-span-2" : ""}`}>
                <ToolCard {...tool} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="canvas" className="py-20 px-4 sm:px-6 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              One canvas for everything
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              A moodboard like Milanote and a sketchpad like Excalidraw in one. Map out architecture, user flows and plans,
              with your issues and docs right next to them.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {canvasFeatures.map((feature) => (
              <ToolCard key={feature.title} icon={feature.icon} name={feature.title} description={feature.description} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6" style={{ background: "var(--bg-secondary)" }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <Feature icon={<Download className="w-6 h-6" />} title="Free, No Watermarks" tint="var(--accent-glow)" color="var(--accent)">
            Export boards, canvases, notes and whole projects. No limits, no sign-up required.
          </Feature>
          <Feature icon={<Globe className="w-6 h-6" />} title="Works Everywhere" tint="rgba(52,211,153,0.15)" color="var(--green)">
            Works without an account. Sign in to sync across devices, or self-host and save straight to a folder.
          </Feature>
          <Feature icon={<GithubIcon className="w-6 h-6" />} title="Open Source" tint="rgba(244,114,182,0.15)" color="var(--pink)">
            MIT licensed. View the source, contribute features, or fork it.
          </Feature>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
            Ready to plan your project?
          </h2>
          <p className="text-lg mb-8" style={{ color: "var(--text-secondary)" }}>
            Create a project, or start from the example to see how issues, diagrams and docs link together.
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

      <OtherAppPromo />

      <LandingFooter />
    </div>
  );
}

function Feature({ icon, title, tint, color, children }: { icon: React.ReactNode; title: string; tint: string; color: string; children: React.ReactNode }) {
  return (
    <div className="text-center p-6">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: tint, color }}>
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {children}
      </p>
    </div>
  );
}
