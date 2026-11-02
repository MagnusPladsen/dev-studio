import { APP } from "@/lib/app-config";

export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wider ${className}`}
      style={{ background: "rgba(251,191,36,0.12)", color: "var(--yellow)", border: "1px solid rgba(251,191,36,0.3)" }}
      title={`${APP.name} is in beta: things may change or break. Export your projects now and then.`}
    >
      Beta
    </span>
  );
}
