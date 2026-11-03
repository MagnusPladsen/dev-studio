"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

export const TOAST_MS = 4000;
/** Toasts with a list of details stay up longer, so there is time to read them. */
const DETAILS_TOAST_MS = 9000;
const MAX_DETAILS = 5;

export interface ToastOptions {
  message: string;
  action?: { label: string; href: string };
  /** Short follow-up lines under the message, e.g. import warnings. */
  details?: string[];
  tone?: "error";
}

interface ToastContextValue {
  showToast(options: ToastOptions): void;
}

interface ActiveToast extends ToastOptions {
  id: number;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

/** One toast at a time, shown for four seconds. A new toast replaces the current one. */
export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const showToast = useCallback((options: ToastOptions): void => {
    setToast((previous) => ({ ...options, id: (previous?.id ?? 0) + 1 }));
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.details?.length || toast.tone === "error" ? DETAILS_TOAST_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[210] w-max max-w-[calc(100vw-32px)] -translate-x-1/2 max-md:bottom-[calc(16px+env(safe-area-inset-bottom))]"
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 rounded-lg px-3 py-2 text-xs shadow-xl"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            <div>
              <span style={toast.tone === "error" ? { color: "var(--red)" } : undefined}>{toast.message}</span>
              {Boolean(toast.details?.length) && <ToastDetails details={toast.details!} />}
            </div>
            {toast.action && (
              <Link
                href={toast.action.href}
                onClick={() => setToast(null)}
                className="font-medium"
                style={{ color: "var(--accent)" }}
              >
                {toast.action.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

function ToastDetails({ details }: { details: string[] }): React.JSX.Element {
  const shown = details.slice(0, MAX_DETAILS);
  const hidden = details.length - shown.length;
  return (
    <ul className="mt-1 list-disc pl-4" style={{ color: "var(--text-secondary)" }}>
      {shown.map((detail) => (
        <li key={detail}>{detail}</li>
      ))}
      {hidden > 0 && <li>and {hidden} more</li>}
    </ul>
  );
}
