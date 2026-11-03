/**
 * The visitor's analytics choice (ekomloven § 3-15 / GDPR): nothing that measures visits loads until they say yes.
 * Stored in this browser only. `null` means they haven't chosen yet, which counts as no.
 */
export type AnalyticsConsent = "granted" | "denied";

export const CONSENT_KEY = "gds-analytics-consent";
const CHANGE_EVENT = "gds-consent-change";
const OPEN_SETTINGS_EVENT = "gds-consent-open";

export function readConsent(): AnalyticsConsent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === "granted";
}

export function writeConsent(choice: AnalyticsConsent): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Hears consent changes from this tab and from other tabs. */
export function subscribeConsent(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => (e.key === CONSENT_KEY || e.key === null) && listener();
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Opens the consent banner again so the visitor can change their mind ("Privacy settings" links). */
export function openPrivacySettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function onOpenPrivacySettings(listener: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}
