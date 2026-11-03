import { describe, expect, it } from "vitest";
import { PRIVACY_FACTS } from "./privacy-facts";
import { englishPolicy, norwegianPolicy } from "./privacy-policy";

const text = (policy: ReturnType<typeof englishPolicy>) =>
  policy.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])]).join("\n");

describe("privacy policy", () => {
  it("has the same sections in English and Norwegian", () => {
    expect(norwegianPolicy(PRIVACY_FACTS, "Dev Studio").sections).toHaveLength(englishPolicy(PRIVACY_FACTS, "Dev Studio").sections.length);
  });

  it("shows a visible placeholder for facts the owner hasn't confirmed", () => {
    const facts = { ...PRIVACY_FACTS, contactEmail: null, supabaseRegion: null };
    expect(text(englishPolicy(facts, "GameDev Studio"))).toContain("[contact email not confirmed yet]");
    expect(text(norwegianPolicy(facts, "GameDev Studio"))).toContain("[e-postadresse ikke bekreftet ennå]");
  });

  it("uses confirmed facts as given", () => {
    const facts = { ...PRIVACY_FACTS, contactEmail: "privacy@example.com", supabaseRegion: "Stockholm, Sweden (eu-north-1)" };
    for (const policy of [englishPolicy(facts, "GameDev Studio"), norwegianPolicy(facts, "GameDev Studio")]) {
      expect(text(policy)).toContain("privacy@example.com");
      expect(text(policy)).toContain("Stockholm, Sweden (eu-north-1)");
      expect(text(policy)).not.toContain("[");
    }
  });
});
