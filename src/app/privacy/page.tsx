import type { Metadata } from "next";
import Link from "next/link";
import { APP } from "@/lib/app-config";
import { PRIVACY_FACTS } from "@/lib/privacy-facts";
import { englishPolicy, norwegianPolicy, type PrivacyPolicy } from "@/lib/privacy-policy";
import { PrivacySettingsButton } from "@/components/ConsentBanner";
import { LandingFooter } from "@/components/landing/LandingParts";
import { PolicyLanguageTabs } from "@/components/PolicyLanguageTabs";

export const metadata: Metadata = {
  title: `Privacy · ${APP.name}`,
  description: `How ${APP.name} handles your data: what is stored where, analytics consent, export and deletion. In English and Norwegian.`,
};

const LINK_PATTERN = /(https:\/\/\S+)/;

function withLinks(text: string) {
  return text.split(LINK_PATTERN).map((part, index) =>
    LINK_PATTERN.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: "var(--text-primary)" }}>
        {part}
      </a>
    ) : (
      part
    )
  );
}

const BUTTON_STYLE = { background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" };

function PolicyArticle({ policy }: { policy: PrivacyPolicy }) {
  return (
    <article>
      <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
        {policy.title}
      </h1>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        {policy.updated}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <PrivacySettingsButton label={policy.privacySettingsLabel} className="px-3 py-1.5 rounded-lg" style={BUTTON_STYLE} />
        <Link href="/projects" className="px-3 py-1.5 rounded-lg" style={BUTTON_STYLE}>
          {policy.openAppLabel}
        </Link>
      </div>
      {policy.sections.map((section) => (
        <section key={section.heading} className="mb-6">
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            {section.heading}
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed mb-2">
              {withLinks(paragraph)}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{withLinks(bullet)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

export default function PrivacyPage() {
  const policies = [englishPolicy(PRIVACY_FACTS, APP.name), norwegianPolicy(PRIVACY_FACTS, APP.name)];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 text-sm" style={{ color: "var(--text-secondary)" }}>
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: "var(--accent)", color: "white" }}>
            {APP.initials}
          </span>
          <span className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
            {APP.name}
          </span>
        </Link>
        <PolicyLanguageTabs
          tabs={policies.map((policy) => ({
            id: policy.language,
            label: policy.languageName,
            lang: policy.language === "no" ? "nb" : "en",
            content: <PolicyArticle policy={policy} />,
          }))}
        />
      </main>
      <LandingFooter />
    </div>
  );
}
