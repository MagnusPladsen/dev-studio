import { APP } from "@/lib/app-config";

/** The centred card that the sign-in pages outside the studio (Claude consent, CLI sign-in) sit in. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 max-md:p-4" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 sm:p-7" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm mx-auto mb-4" style={{ background: "var(--accent)", color: "white" }}>
          {APP.initials}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="text-center" role="status">
      <p className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      {children && (
        <div className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
