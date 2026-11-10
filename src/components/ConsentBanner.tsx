"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { onOpenPrivacySettings, openPrivacySettings, readConsent, subscribeConsent, writeConsent, type AnalyticsConsent } from "@/lib/consent";

const UNKNOWN = "unknown";

/** Server render and first paint know nothing, so nothing loads until the browser has read the stored choice. */
function useConsent(): AnalyticsConsent | null | typeof UNKNOWN {
  return useSyncExternalStore(subscribeConsent, readConsent, () => UNKNOWN);
}

/**
 * Loads Vercel Analytics only after the visitor said yes, and asks once with two equal buttons.
 * "Privacy settings" links reopen it.
 */
export function ConsentBanner() {
  const consent = useConsent();
  const [isReopened, setIsReopened] = useState(false);

  useEffect(() => onOpenPrivacySettings(() => setIsReopened(true)), []);

  function choose(choice: AnalyticsConsent) {
    const wasGranted = consent === "granted";
    writeConsent(choice);
    setIsReopened(false);
    // a loaded analytics script can't be unloaded; a reload leaves it out
    if (wasGranted && choice === "denied") window.location.reload();
  }

  const isAsking = consent === null || isReopened;

  return (
    <>
      {consent === "granted" && <Analytics />}
      {isAsking && (
        <div
          role="region"
          aria-label="Privacy choice"
          className="fixed z-[90] bottom-4 left-4 max-w-sm rounded-xl p-4 shadow-2xl text-sm max-md:left-3 max-md:right-3 max-md:bottom-3 max-md:max-w-none"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <p className="leading-relaxed mb-3">
            May we count visits with Vercel Analytics? It uses no cookies and no ads, and helps us see which tools people use.
            Nothing is measured unless you allow it.{" "}
            <Link href="/privacy" className="underline" style={{ color: "var(--text-primary)" }}>
              Privacy
            </Link>
          </p>
          {consent !== null && consent !== UNKNOWN && (
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Now: {consent === "granted" ? "allowed" : "not allowed"}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => choose("denied")}
              className="px-3 py-2 rounded-lg font-medium"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
            >
              No thanks
            </button>
            <button
              onClick={() => choose("granted")}
              className="px-3 py-2 rounded-lg font-medium"
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
            >
              Allow
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** A "Privacy settings" link that reopens the consent banner. */
export function PrivacySettingsButton({
  className,
  style,
  label = "Privacy settings",
}: {
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  return (
    <button type="button" onClick={openPrivacySettings} className={className} style={style}>
      {label}
    </button>
  );
}
