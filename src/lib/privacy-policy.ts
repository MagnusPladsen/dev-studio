import type { PrivacyFacts } from "./privacy-facts";

export type PolicyLanguage = "en" | "no";

export interface PolicySection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface PrivacyPolicy {
  language: PolicyLanguage;
  title: string;
  updated: string;
  sections: PolicySection[];
}

const DATATILSYNET_URL = "https://www.datatilsynet.no";

function placeholders(facts: PrivacyFacts, language: PolicyLanguage) {
  const isNorwegian = language === "no";
  return {
    contact: facts.contactEmail ?? (isNorwegian ? "[e-postadresse ikke bekreftet ennå]" : "[contact email not confirmed yet]"),
    region:
      facts.supabaseRegion ??
      (isNorwegian ? "[EU-region ikke bekreftet ennå, trolig Stockholm, Sverige]" : "[EU region not confirmed yet, likely Stockholm, Sweden]"),
  };
}

/** The privacy policy in plain English. Both apps share it: they share one account and one database. */
export function englishPolicy(facts: PrivacyFacts, appName: string): PrivacyPolicy {
  const { contact, region } = placeholders(facts, "en");
  return {
    language: "en",
    title: "Privacy",
    updated: `Last updated ${facts.lastUpdated}.`,
    sections: [
      {
        heading: "The short version",
        bullets: [
          `You can use ${appName} without an account. Then your work stays in your browser or in a folder you pick, and never reaches us.`,
          "If you sign in, your projects are stored in your account so you can use them on any device.",
          "Visit statistics load only if you click Allow. No ads, no tracking cookies, and we never sell data.",
          "You can export everything and delete your account yourself, at any time, from the Account panel.",
        ],
      },
      {
        heading: "Who is responsible",
        paragraphs: [
          `${facts.controller} (${facts.website}), a private person in Norway, runs GameDev Studio and Dev Studio and is responsible for your data. Both apps share one account system and one database.`,
          `Contact: ${contact}`,
        ],
      },
      {
        heading: "What is stored, and where",
        bullets: [
          "In your browser: your projects and settings, if you don't sign in. They stay on your device.",
          "In a local folder: if you connect one, every project is also written there as JSON files on your computer. They stay on your device.",
          `In your account: your email address (or, with GitHub sign-in, your GitHub name, email and picture), your projects and their timestamps. They are stored with Supabase in ${region}. Supabase may handle some account and support data outside that region, under the EU's standard contractual clauses.`,
          "Hosting: Vercel serves the website. Like any web server it sees your IP address and browser details, and keeps short-lived logs to run and protect the service.",
          "Link previews: when you paste a web link (for example on the Canvas), our server fetches that page to show its title and image. The page you linked sees a request from our server, not from you.",
          "Visit statistics: only after you click Allow, Vercel Web Analytics records page views, the referring site, your country, and your browser, system and device type. It sets no cookies. It recognises a visit by a hash of the request that is thrown away after 24 hours.",
        ],
      },
      {
        heading: "Why, and on what legal basis",
        bullets: [
          "Your account and sync: to provide the service you asked for (GDPR art. 6(1)(b), contract).",
          "Saving your work in your browser: strictly necessary for the service you asked for, so it needs no consent (ekomloven § 3-15).",
          "Visit statistics: your consent (GDPR art. 6(1)(a) and ekomloven § 3-15). You can withdraw it at any time.",
          "Hosting logs and security: our legitimate interest in keeping the service running and safe (GDPR art. 6(1)(f)).",
        ],
      },
      {
        heading: "Visit statistics and your choice",
        paragraphs: [
          "The first time you visit, a small banner asks whether we may count visits. Nothing is measured before you choose, and No thanks is as easy as Allow.",
          "Your choice is saved in your browser. Use \"Privacy settings\" on this page or in the site footer to change it.",
        ],
      },
      {
        heading: "Who else handles your data",
        bullets: [
          "Supabase Inc.: stores accounts and projects for us, under a data processing agreement.",
          "Vercel Inc. (USA): hosts the website and, if you allow it, runs the visit statistics. Vercel is certified under the EU–US Data Privacy Framework.",
          "GitHub: only if you choose to sign in with GitHub.",
          "No one else. We don't sell or share data for advertising.",
        ],
      },
      {
        heading: "How long we keep it",
        bullets: [
          "Browser and folder data: until you delete it. Clear data in the Account panel removes it from this browser.",
          "Account data: for as long as you have an account. Delete account removes your projects and sign-in straight away; copies in Supabase's backups disappear as those backups expire.",
          "Hosting logs: briefly, as Vercel keeps them.",
          "Visit statistics: only as counts. The visitor hash is discarded after 24 hours.",
        ],
      },
      {
        heading: "Your rights",
        bullets: [
          "See and take your data: Export all in the Account panel downloads every project as one file you can import again. Each project can also be exported on its own.",
          "Correct it: edit anything in the app.",
          "Delete it: Delete account (signed in) or Clear data (not signed in) in the Account panel.",
          "Withdraw consent for visit statistics: Privacy settings.",
          "Object, restrict processing or ask questions: write to the contact address above.",
          `Complain: you can complain to Datatilsynet, the Norwegian Data Protection Authority: ${DATATILSYNET_URL}`,
        ],
      },
      {
        heading: "Changes",
        paragraphs: ["If this policy changes, the date at the top changes too. Big changes will be shown in the app."],
      },
    ],
  };
}

/** Personvernerklæringen på bokmål. */
export function norwegianPolicy(facts: PrivacyFacts, appName: string): PrivacyPolicy {
  const { contact, region } = placeholders(facts, "no");
  return {
    language: "no",
    title: "Personvern",
    updated: `Sist oppdatert ${facts.lastUpdated}.`,
    sections: [
      {
        heading: "Kort fortalt",
        bullets: [
          `Du kan bruke ${appName} uten konto. Da blir arbeidet ditt i nettleseren eller i en mappe du velger, og kommer aldri til oss.`,
          "Logger du inn, lagres prosjektene dine på kontoen din, så du kan bruke dem på alle enhetene dine.",
          "Besøksstatistikk lastes bare hvis du trykker Tillat. Ingen reklame, ingen sporingskapsler, og vi selger aldri data.",
          "Du kan eksportere alt og slette kontoen din selv, når som helst, fra kontopanelet nederst i sidemenyen.",
        ],
      },
      {
        heading: "Hvem som er ansvarlig",
        paragraphs: [
          `${facts.controller} (${facts.website}), en privatperson i Norge, driver GameDev Studio og Dev Studio og er behandlingsansvarlig for dataene dine. De to appene deler ett kontosystem og én database.`,
          `Kontakt: ${contact}`,
        ],
      },
      {
        heading: "Hva som lagres, og hvor",
        bullets: [
          "I nettleseren: prosjektene og innstillingene dine, hvis du ikke logger inn. De blir på enheten din.",
          "I en lokal mappe: kobler du til en, skrives hvert prosjekt også dit som JSON-filer på datamaskinen din. De blir på enheten din.",
          `På kontoen din: e-postadressen din (eller, med GitHub-innlogging, GitHub-navn, e-post og bilde), prosjektene dine og tidspunktene for dem. De lagres hos Supabase i ${region}. Supabase kan behandle noen konto- og supportdata utenfor regionen, etter EUs standardkontraktsbestemmelser.`,
          "Drift: Vercel leverer nettsiden. Som alle nettservere ser den IP-adressen din og opplysninger om nettleseren, og lagrer logger en kort tid for å drive og beskytte tjenesten.",
          "Forhåndsvisning av lenker: limer du inn en nettlenke (for eksempel på Canvas), henter serveren vår siden for å vise tittel og bilde. Siden du lenket til, ser en forespørsel fra serveren vår, ikke fra deg.",
          "Besøksstatistikk: bare etter at du har trykket Tillat, registrerer Vercel Web Analytics sidevisninger, hvilken side du kom fra, land, og type nettleser, system og enhet. Den setter ingen informasjonskapsler. Et besøk kjennes igjen på en hash av forespørselen som slettes etter 24 timer.",
        ],
      },
      {
        heading: "Hvorfor, og med hvilket rettslig grunnlag",
        bullets: [
          "Konto og synkronisering: for å levere tjenesten du har bedt om (personvernforordningen art. 6 nr. 1 bokstav b, avtale).",
          "Lagring av arbeidet ditt i nettleseren: strengt nødvendig for tjenesten du har bedt om, og krever derfor ikke samtykke (ekomloven § 3-15).",
          "Besøksstatistikk: samtykket ditt (art. 6 nr. 1 bokstav a og ekomloven § 3-15). Du kan trekke det tilbake når som helst.",
          "Driftslogger og sikkerhet: vår berettigede interesse i å holde tjenesten i gang og trygg (art. 6 nr. 1 bokstav f).",
        ],
      },
      {
        heading: "Besøksstatistikk og ditt valg",
        paragraphs: [
          "Første gang du besøker siden, spør et lite banner om vi får telle besøk. Ingenting måles før du har valgt, og Nei takk er like enkelt som Tillat.",
          "Valget ditt lagres i nettleseren. Bruk «Privacy settings» på denne siden eller nederst på forsiden for å endre det.",
        ],
      },
      {
        heading: "Hvem andre som behandler dataene",
        bullets: [
          "Supabase Inc.: lagrer kontoer og prosjekter for oss, etter en databehandleravtale.",
          "Vercel Inc. (USA): leverer nettsiden og, hvis du tillater det, besøksstatistikken. Vercel er sertifisert under EU–US Data Privacy Framework.",
          "GitHub: bare hvis du velger å logge inn med GitHub.",
          "Ingen andre. Vi selger ikke data og deler dem ikke for reklame.",
        ],
      },
      {
        heading: "Hvor lenge vi lagrer",
        bullets: [
          "Data i nettleseren og mappen: til du sletter dem. Clear data i kontopanelet nederst i sidemenyen fjerner dem fra denne nettleseren.",
          "Kontodata: så lenge du har en konto. Delete account sletter prosjektene og innloggingen din med en gang; kopier i Supabases sikkerhetskopier forsvinner når kopiene går ut.",
          "Driftslogger: en kort tid, slik Vercel lagrer dem.",
          "Besøksstatistikk: bare som tall. Besøks-hashen slettes etter 24 timer.",
        ],
      },
      {
        heading: "Dine rettigheter",
        bullets: [
          "Innsyn og dataportabilitet: Export all i kontopanelet nederst i sidemenyen laster ned alle prosjektene som én fil du kan importere igjen. Hvert prosjekt kan også eksporteres for seg.",
          "Retting: endre hva som helst i appen.",
          "Sletting: Delete account (innlogget) eller Clear data (ikke innlogget) i kontopanelet nederst i sidemenyen.",
          "Trekke tilbake samtykke til besøksstatistikk: Privacy settings.",
          "Protestere, be om begrenset behandling eller stille spørsmål: skriv til kontaktadressen over.",
          `Klage: du kan klage til Datatilsynet: ${DATATILSYNET_URL}`,
        ],
      },
      {
        heading: "Endringer",
        paragraphs: ["Endres denne erklæringen, endres også datoen øverst. Store endringer vises i appen."],
      },
    ],
  };
}
