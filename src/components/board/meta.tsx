import {
  BookOpen,
  Bug,
  CheckSquare,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  FileText,
  Music,
  Paintbrush,
  PenTool,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ColumnCategory, IssuePriority, IssueType } from "@/types";
import { issueTypeLabel, issueTypesFor } from "@/lib/board";
import { parseTask } from "@/lib/task-list";
import { APP } from "@/lib/app-config";

export const TYPE_META: Record<IssueType, { icon: LucideIcon; color: string }> = {
  feature: { icon: Sparkles, color: "#34d399" },
  bug: { icon: Bug, color: "#f87171" },
  task: { icon: CheckSquare, color: "#60a5fa" },
  art: { icon: Paintbrush, color: "#a78bfa" },
  audio: { icon: Music, color: "#fbbf24" },
  design: { icon: PenTool, color: "#f472b6" },
  writing: { icon: BookOpen, color: "#fb923c" },
  chore: { icon: Wrench, color: "#94a3b8" },
  docs: { icon: FileText, color: "#fb923c" },
};

/** The types this app offers when creating or filtering issues. Saved issues keep whatever type they have. */
export const TYPES = issueTypesFor(APP.id);

/** A type's label, or the raw value for a type this version doesn't know. */
export function typeLabel(type: string): string {
  return issueTypeLabel(type, APP.id);
}

/** `TYPES`, plus `current` when an issue already has a type this app doesn't offer, so the picker still shows it. */
export function typeOptions(current: string): string[] {
  return TYPES.includes(current as IssueType) ? TYPES : [...TYPES, current];
}

export const PRIORITY_META: Record<IssuePriority, { label: string; icon: LucideIcon; color: string; rank: number }> = {
  highest: { label: "Highest", icon: ChevronsUp, color: "#f87171", rank: 5 },
  high: { label: "High", icon: ChevronUp, color: "#fb923c", rank: 4 },
  medium: { label: "Medium", icon: Equal, color: "#fbbf24", rank: 3 },
  low: { label: "Low", icon: ChevronDown, color: "#60a5fa", rank: 2 },
  lowest: { label: "Lowest", icon: ChevronsDown, color: "#94a3b8", rank: 1 },
};

export const CATEGORY_LABEL: Record<ColumnCategory, string> = { todo: "To do", doing: "In progress", done: "Done" };

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(iso);
}

export const fieldStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export const secondaryBtn: React.CSSProperties = {
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};

export function TypeIcon({ type, className = "w-3.5 h-3.5" }: { type: IssueType; className?: string }) {
  const m = TYPE_META[type] ?? TYPE_META.task;
  const Icon = m.icon;
  const label = typeLabel(type);
  return (
    <span title={label} aria-label={label} className="inline-flex shrink-0">
      <Icon className={className} style={{ color: m.color }} />
    </span>
  );
}

export function PriorityIcon({ priority, className = "w-3.5 h-3.5" }: { priority: IssuePriority; className?: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  const Icon = m.icon;
  return (
    <span title={`${m.label} priority`} aria-label={`${m.label} priority`} className="inline-flex shrink-0">
      <Icon className={className} style={{ color: m.color }} />
    </span>
  );
}

/**
 * Very small markdown → JSX for issue descriptions (headings, lists, task lists, bold/italic, code).
 * `onToggleTask` gets the line number of a ticked "- [ ]" item; without it the boxes are read-only.
 */
export function MiniMarkdown({ text, onToggleTask }: { text: string; onToggleTask?(line: number): void }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    out.push(
      ordered ? (
        <ol key={out.length} className="list-decimal pl-5 space-y-0.5">{list}</ol>
      ) : (
        <ul key={out.length} className="list-disc pl-5 space-y-0.5">{list}</ul>
      )
    );
    list = [];
  };
  const inline = (s: string, k: string): React.ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={k + i} style={{ color: "var(--text-primary)" }}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={k + i}>{part.slice(1, -1)}</em>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={k + i} className="px-1 rounded text-[0.9em]" style={{ background: "var(--bg-hover)" }}>{part.slice(1, -1)}</code>;
      return part;
    });
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      if (list.length && ordered !== !!ol) flush();
      ordered = !!ol;
      const task = parseTask(line, i);
      list.push(
        task ? (
          <li key={i} className="list-none -ml-5 flex items-start gap-2">
            <input
              type="checkbox"
              checked={task.done}
              disabled={!onToggleTask}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleTask?.(i)}
              className="mt-1 shrink-0"
              aria-label={task.text}
            />
            <span style={task.done ? { textDecoration: "line-through", color: "var(--text-muted)" } : undefined}>{inline(task.text, `t${i}`)}</span>
          </li>
        ) : (
          <li key={i}>{inline((ul ?? ol)![1], `l${i}`)}</li>
        )
      );
      return;
    }
    flush();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) out.push(<p key={i} className="font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{inline(h[2], `h${i}`)}</p>);
    else if (line.trim()) out.push(<p key={i}>{inline(line, `p${i}`)}</p>);
    else out.push(<div key={i} className="h-2" />);
  });
  flush();
  return <div className="text-sm leading-relaxed space-y-1" style={{ color: "var(--text-secondary)" }}>{out}</div>;
}
