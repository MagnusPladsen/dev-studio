/**
 * Facts the privacy policy states that only the owner can confirm. A `null` shows on /privacy as a visible
 * "[… not confirmed yet]" placeholder, so a missing fact is never silently made up.
 */
export interface PrivacyFacts {
  controller: string;
  website: string;
  /** Where people send privacy requests, e.g. "privacy@pladsen.dev". */
  contactEmail: string | null;
  /** The Supabase project's region as shown in the dashboard, e.g. "Stockholm, Sweden (eu-north-1)". */
  supabaseRegion: string | null;
  /** When the policy last changed, as YYYY-MM-DD. */
  lastUpdated: string;
}

export const PRIVACY_FACTS: PrivacyFacts = {
  controller: "Magnus Pladsen",
  website: "pladsen.dev",
  contactEmail: "magnus_pladsen@hotmail.com",
  supabaseRegion: "Zurich, Switzerland (eu-central-2)",
  lastUpdated: "2026-11-03",
};
