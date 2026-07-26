import type { Metadata } from "next";
import { Montserrat, Open_Sans, Anton } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import CookieConsentBanner from "./components/CookieConsentBanner";

// Migration typographique vers le design de référence
// (chillandgroovefestival.com, décision client) : Montserrat pour les
// titres, Open Sans pour le texte courant — remplace Inter partout.
// "Gagalin" (police du hero/compte à rebours du site de référence) est une
// police PAYANTE/propriétaire, non redistribuable sans licence achetée
// (confirmé, pas supposé) — Anton la remplace comme police d'AFFICHAGE
// (gros titres impact, style proche : caractères pleins, condensés,
// majuscules), décision validée avec le client.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const anton = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
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
    <html lang="fr" className={`${montserrat.variable} ${openSans.variable} ${anton.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <CookieConsentBanner />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
