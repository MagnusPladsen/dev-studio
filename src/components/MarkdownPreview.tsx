"use client";

import { Check } from "lucide-react";
import type { MenuTriggerProps } from "@/components/AssetContextMenu";
import { ASSET_KINDS } from "@/lib/assets";

// Small Markdown renderer shared by the Notebook and the Decision log: headings, lists, clickable
// checklists, quotes, code, links and [[wiki links]] to notes and wiki pages.

const CHECK_LINE = /^(\s*[-*+] \[)( |x|X)(\])/;

/** Ticks or unticks the "- [ ] task" on line `lineIndex` (what `RenderCtx.onToggle` is given). */
export function toggleChecklistLine(content: string, lineIndex: number): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return content;
  lines[lineIndex] = line.replace(CHECK_LINE, (_, a, mark, b) => `${a}${mark === " " ? "x" : " "}${b}`);
  return lines.join("\n");
}

function isSafeUrl(url: string): boolean {
  return /^(https?:|mailto:|\/|#)/i.test(url);
}


export type WikiTarget = { type: "note" | "story"; id: string; title: string };

export interface RenderCtx {
  resolve(title: string): WikiTarget | undefined;
  triggerProps(target: WikiTarget): MenuTriggerProps;
  onWiki(title: string, target: WikiTarget | undefined): void;
  onToggle(lineIndex: number): void;
}

const INLINE =
  /(`[^`\n]+`)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

function renderInline(text: string, ctx: RenderCtx, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded text-[0.85em] font-mono" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
          {tok.slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      const inner = tok.slice(2, -2);
      const [titleRaw, alias] = inner.split("|");
      const title = titleRaw.trim();
      const target = ctx.resolve(title);
      out.push(
        <button
          key={key}
          {...(target ? ctx.triggerProps(target) : {})}
          onClick={() => ctx.onWiki(title, target)}
          className="inline px-1 rounded hover:underline"
          style={
            target
              ? { color: ASSET_KINDS[target.type].color, background: `color-mix(in srgb, ${ASSET_KINDS[target.type].color} 10%, transparent)` }
              : { color: "var(--red)", border: "1px dashed rgba(248,113,113,0.5)" }
          }
          title={target ? `Open ${target.type === "note" ? "note" : "story entry"} “${target.title}”` : `No note called “${title}” yet. Click to create it.`}
        >
          {(alias ?? titleRaw).trim()}
        </button>
      );
    } else if (m[3]) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = lm?.[1] ?? tok;
      const url = lm?.[2] ?? "";
      out.push(
        isSafeUrl(url) ? (
          <a key={key} href={url} target={url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="underline" style={{ color: "var(--blue)" }}>
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        )
      );
    } else if (m[4]) {
      out.push(
        <strong key={key} style={{ color: "var(--text-primary)" }}>
          {renderInline(tok.slice(2, -2), ctx, key)}
        </strong>
      );
    } else if (m[5]) {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), ctx, key)}</em>);
    }
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownPreview({ content, ctx }: { content: string; ctx: RenderCtx }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;

    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key} className="text-xs font-mono p-3 rounded-lg overflow-x-auto my-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base";
      blocks.push(
        <div key={key} className={`${size} font-semibold mt-4 mb-1.5`} style={{ color: "var(--text-primary)" }}>
          {renderInline(heading[2], ctx, key)}
        </div>
      );
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-3" style={{ borderColor: "var(--border)" }} />);
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="pl-3 my-2 italic" style={{ borderLeft: "3px solid color-mix(in srgb, var(--accent) 33%, transparent)", color: "var(--text-secondary)" }}>
          {renderInline(quote.join(" "), ctx, key)}
        </blockquote>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const li = lines[i];
        const lineIndex = i;
        const check = li.match(/^\s*[-*+] \[( |x|X)\]\s?(.*)$/);
        if (check) {
          const done = check[1] !== " ";
          items.push(
            <li key={`${key}-${i}`} className="flex items-start gap-2 py-0.5 list-none -ml-5">
              <button
                onClick={() => ctx.onToggle(lineIndex)}
                className="mt-[3px] w-4 h-4 rounded shrink-0 flex items-center justify-center transition-colors"
                style={{ background: done ? "var(--accent)" : "transparent", border: `1.5px solid ${done ? "var(--accent)" : "var(--border-hover)"}` }}
                aria-label={done ? "Mark as not done" : "Mark as done"}
              >
                {done && <Check className="w-3 h-3" style={{ color: "var(--on-accent)" }} strokeWidth={3} />}
              </button>
              <span
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("a,button")) ctx.onToggle(lineIndex);
                }}
                className="cursor-pointer select-none"
                style={{ color: done ? "var(--text-muted)" : "var(--text-secondary)", textDecoration: done ? "line-through" : undefined }}
              >
                {renderInline(check[2], ctx, `${key}-${i}`)}
              </span>
            </li>
          );
        } else {
          items.push(
            <li key={`${key}-${i}`} className="py-0.5">
              {renderInline(li.replace(/^\s*[-*+]\s+/, ""), ctx, `${key}-${i}`)}
            </li>
          );
        }
        i++;
      }
      blocks.push(
        <ul key={key} className="list-disc pl-5 my-1.5" style={{ color: "var(--text-secondary)" }}>
          {items}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(
          <li key={`${key}-${i}`} className="py-0.5">
            {renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, ""), ctx, `${key}-${i}`)}
          </li>
        );
        i++;
      }
      blocks.push(
        <ol key={key} className="list-decimal pl-5 my-1.5" style={{ color: "var(--text-secondary)" }}>
          {items}
        </ol>
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|\s*```|\s*>|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*(---|\*\*\*|___)\s*$)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    // never stall on a line no block rule claimed
    if (!para.length) para.push(lines[i++]);
    blocks.push(
      <p key={key} className="my-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {para.map((p, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(p, ctx, `${key}-${j}`)}
          </span>
        ))}
      </p>
    );
  }

  if (!blocks.length) {
    return (
      <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
        Nothing written yet.
      </p>
    );
  }
  return <div className="text-sm">{blocks}</div>;
}
