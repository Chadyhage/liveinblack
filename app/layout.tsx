import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import CookieConsentBanner from "./components/CookieConsentBanner";
import GoogleAnalytics from "./components/GoogleAnalytics";

// Police variable déjà distribuée avec la version verrouillée de Next.js.
// Elle est auto-hébergée au build : aucune requête à Google Fonts, aucun
// blocage réseau et aucun changement de police après le premier rendu.
const interfaceFont = localFont({
  src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-interface",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LIVEINBLACK",
  description: "Marketplace événementielle / nightlife",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${interfaceFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <CookieConsentBanner />
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
