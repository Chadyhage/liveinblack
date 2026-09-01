import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import CookieConsentBanner from "./components/layout/CookieConsentBanner";
import GoogleAnalytics from "./components/layout/GoogleAnalytics";
import GrowthAnalytics from "./components/layout/GrowthAnalytics";
import { STATIC_THEME } from "@/lib/shared/staticTheme";

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
const webmasterVerificationOther: Record<string, string> = {
  ...(process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : {}),
  ...(process.env.PINTEREST_SITE_VERIFICATION ? { "p:domain_verify": process.env.PINTEREST_SITE_VERIFICATION } : {}),
};
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
      knowsAbout: [
        "événements au Bénin",
        "billetterie en ligne au Bénin",
        "prestataires événementiels à Cotonou",
        "sorties et concerts en Afrique de l’Ouest",
      ],
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
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "LIVEINBLACK",
      url: siteUrl,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      inLanguage: "fr-BJ",
      isAccessibleForFree: true,
      publisher: { "@id": `${siteUrl}/#organization` },
      audience: {
        "@type": "Audience",
        geographicArea: {
          "@type": "Country",
          name: "Bénin",
        },
      },
      featureList: [
        "Découverte d’événements au Bénin",
        "Billetterie en ligne",
        "Recherche de prestataires événementiels",
        "Profils organisateurs",
        "Actualités et guides événementiels",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XOF",
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
  icons: {
    icon: [
      { url: "/branding/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/branding/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/branding/icon-192.png"],
    apple: [{ url: "/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      {
        rel: "search",
        url: "/opensearch.xml",
        type: "application/opensearchdescription+xml",
      },
    ],
  },
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
    yandex: process.env.YANDEX_SITE_VERIFICATION || undefined,
    other: Object.keys(webmasterVerificationOther).length > 0 ? webmasterVerificationOther : undefined,
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
  themeColor: STATIC_THEME.darkBackground,
  colorScheme: "dark",
};

const themeBootScript = `
try {
  window.localStorage.setItem('lib_theme', 'dark');
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
} catch (_) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr-BJ" data-theme="dark" style={{ colorScheme: 'dark' }} className={`${interfaceFont.variable} h-full antialiased`} suppressHydrationWarning>
      <head><style>{'nextjs-portal{display:none!important}'}</style></head>
      <body className="min-h-full flex flex-col">
        <Script id="lib-theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <Script
          id="lib-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <Providers>{children}</Providers>
        <CookieConsentBanner />
        <Suspense fallback={null}>
          <GrowthAnalytics />
        </Suspense>
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
