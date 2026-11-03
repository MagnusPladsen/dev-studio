"use client";

import { useMemo } from "react";
import { Plus, Scale, Search, X } from "lucide-react";
import type { Decision, DecisionStatus } from "@/types";
import { DECISION_STATUSES, decisionCode, matchesDecisionQuery } from "@/lib/decisions";
import { useAssetMenu } from "@/components/AssetContextMenu";
import { AssetMenuButton, AssetPinButton, PasteButton } from "@/components/AssetMenuButton";
import { ExamplesBar } from "@/components/ExamplesBar";
import { HelpButton } from "@/components/HelpButton";
import { StatusBadge } from "./StatusBadge";

export type StatusFilter = DecisionStatus | "all";

interface Props {
  projectId: string;
  decisions: Decision[];
  openId: string | null;
  query: string;
  filter: StatusFilter;
  className: string;
  onQuery(query: string): void;
  onFilter(filter: StatusFilter): void;
  onOpen(id: string): void;
  onCreate(): void;
}

const inputStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" };

/** Left column of the Decision log: search, status filter and the numbered records, newest first. */
export function DecisionList({ projectId, decisions, openId, query, filter, className, onQuery, onFilter, onOpen, onCreate }: Props): React.JSX.Element {
  const { pasteTriggerProps } = useAssetMenu();
  const counts = useMemo(() => {
    const byStatus = new Map<StatusFilter, number>([["all", decisions.length]]);
    for (const d of decisions) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
    return byStatus;
  }, [decisions]);
  const shown = useMemo(
    () =>
      decisions
        .filter((d) => (filter === "all" || d.status === filter) && matchesDecisionQuery(d, query))
        .sort((a, b) => b.number - a.number),
    [decisions, filter, query]
  );

  return (
    <aside className={`${className} w-full md:w-72 shrink-0 flex-col border-r`} style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
      <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold flex-1" style={{ color: "var(--text-primary)" }}>
            Decision log
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {decisions.length}
          </span>
          <HelpButton topic="decisions" />
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={inputStyle}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search decisions"
            aria-label="Search decisions"
            className="flex-1 min-w-0 bg-transparent text-xs outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {query && (
            <button onClick={() => onQuery("")} style={{ color: "var(--text-muted)" }} title="Clear search" aria-label="Clear search">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <StatusFilterChips filter={filter} counts={counts} onFilter={onFilter} />
        <div className="flex gap-1.5">
          <button
            onClick={onCreate}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            New decision
          </button>
          <PasteButton type="decision" />
        </div>
      </div>

      <div {...pasteTriggerProps("decision")} className="flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="text-xs text-center px-4 py-8" style={{ color: "var(--text-muted)" }}>
            {decisions.length === 0 ? "No decisions yet." : "No decisions match."}
          </p>
        ) : (
          shown.map((d) => <DecisionRow key={d.id} decision={d} isActive={d.id === openId} onOpen={onOpen} />)
        )}
      </div>
      <div className="px-3 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
        <ExamplesBar projectId={projectId} collections={["decisions"]} />
      </div>
    </aside>
  );
}

function StatusFilterChips({ filter, counts, onFilter }: { filter: StatusFilter; counts: Map<StatusFilter, number>; onFilter(filter: StatusFilter): void }) {
  const options: { value: StatusFilter; label: string }[] = [{ value: "all", label: "All" }, ...DECISION_STATUSES];
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
      {options.map((o) => {
        const isActive = filter === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onFilter(o.value)}
            aria-pressed={isActive}
            className="px-2 py-0.5 rounded-full text-[11px] tabular-nums"
            style={{
              background: isActive ? "var(--bg-hover)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              border: `1px solid ${isActive ? "var(--border-hover)" : "var(--border)"}`,
            }}
          >
            {o.label} {counts.get(o.value) ?? 0}
          </button>
        );
      })}
    </div>
  );
}

function DecisionRow({ decision, isActive, onOpen }: { decision: Decision; isActive: boolean; onOpen(id: string): void }) {
  const { assetTriggerProps } = useAssetMenu();
  const ref = { type: "decision" as const, id: decision.id };
  const label = `${decisionCode(decision.number)} ${decision.title}`;
  return (
    <div className="group relative">
      <button
        {...assetTriggerProps(ref)}
        onClick={() => onOpen(decision.id)}
        className="w-full text-left px-2.5 max-md:pr-9 md:pr-7 py-2 rounded-lg mb-0.5 transition-colors hover:bg-[var(--bg-hover)]"
        style={{ background: isActive ? "var(--bg-hover)" : undefined, boxShadow: isActive ? "inset 2px 0 0 var(--accent)" : undefined }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>
            {decisionCode(decision.number)}
          </span>
          <StatusBadge status={decision.status} />
          <span className="ml-auto text-[10px] shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
            {decision.date}
          </span>
        </div>
        <div className="text-sm truncate mt-0.5" style={{ color: decision.status === "superseded" ? "var(--text-secondary)" : "var(--text-primary)" }}>
          {decision.title || "Untitled decision"}
        </div>
      </button>
      <div className="md:hidden absolute right-1 top-1/2 -translate-y-1/2">
        <AssetMenuButton asset={ref} label={label} />
      </div>
      <div className="max-md:hidden absolute right-2 top-1/2 -translate-y-1/2 flex">
        <AssetPinButton asset={ref} label={label} />
      </div>
    </div>
  );
}
