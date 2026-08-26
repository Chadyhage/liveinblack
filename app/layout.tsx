import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import CookieConsentBanner from "./components/layout/CookieConsentBanner";
import GoogleAnalytics from "./components/layout/GoogleAnalytics";

// Police variable déjà distribuée avec la version verrouillée de Next.js.
// Elle est auto-hébergée au build : aucune requête à Google Fonts, aucun
// blocage réseau et aucun changement de police après le premier rendu.
const interfaceFont = localFont({
  src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-interface",
  weight: "100 900",
  display: "swap",
});

const siteUrl = process.env.PUBLIC_SITE_URL || "https://liveinblack.com";
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "LIVEINBLACK",
      url: siteUrl,
      logo: `${siteUrl}/opengraph-image`,
      areaServed: ["BJ", "TG", "CI", "SN", "BF", "ML", "NE", "GW", "FR"],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "LIVEINBLACK",
      inLanguage: "fr-BJ",
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "LIVEINBLACK — Événements, billets et prestataires au Bénin",
  description: "Découvre les meilleurs événements au Bénin et en Afrique de l’Ouest, réserve tes billets et trouve des prestataires événementiels vérifiés.",
  applicationName: "LIVEINBLACK",
  authors: [{ name: "LIVEINBLACK", url: siteUrl }],
  creator: "LIVEINBLACK",
  publisher: "LIVEINBLACK",
  category: "Événementiel",
  keywords: ["événements Bénin", "sortir à Cotonou", "billetterie en ligne Bénin", "soirées Cotonou", "concerts Bénin", "prestataires événementiels", "événements Afrique de l'Ouest"],
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "fr_BJ",
    url: "/home",
    siteName: "LIVEINBLACK",
    title: "LIVEINBLACK — La scène événementielle du Bénin",
    description: "Événements, billetterie et prestataires vérifiés au Bénin et en Afrique de l’Ouest.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "LIVEINBLACK — Événements au Bénin" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LIVEINBLACK — La scène événementielle du Bénin",
    description: "Découvre, réserve et vis les meilleurs événements près de toi.",
    images: ["/opengraph-image"],
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b0d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr-BJ" className={`${interfaceFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <Providers>{children}</Providers>
        <CookieConsentBanner />
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
