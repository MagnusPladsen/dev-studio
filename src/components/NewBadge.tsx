/** Tool paths (`ASSET_KINDS[type].path`) that are new enough to point out in the sidebar and on the dashboard. */
const NEW_TOOL_PATHS: ReadonlySet<string> = new Set(["voxels", "board", "decisions"]);

export function isNewTool(path: string): boolean {
  return NEW_TOOL_PATHS.has(path);
}

export function NewBadge({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wider shrink-0 ${className}`}
      style={{
        background: "color-mix(in srgb, var(--green) 12%, transparent)",
        color: "var(--green)",
        border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
      }}
      title="New tool"
    >
      New
    </span>
  );
}
