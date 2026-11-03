import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { APP } from "@/lib/app-config";
import { COPY } from "@/copy";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = { metadataBase: new URL(APP.url), ...COPY.meta };

/** Each app's brand colour, so the two sites can't be mixed up at a glance. */
const appTheme = {
  "--accent": APP.accent,
  "--accent-hover": APP.accentHover,
  "--accent-glow": `color-mix(in srgb, ${APP.accent} 15%, transparent)`,
} as React.CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={appTheme}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
