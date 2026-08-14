'use client'

import { useSyncExternalStore } from 'react'
import Script from 'next/script'
import { allowsAnalytics } from '@/lib/shared/cookieConsent'

// Charge gtag.js uniquement si l'utilisateur a cliqué "Tout accepter" dans
// CookieConsentBanner.tsx — jamais avant, conformément à la politique de
// cookies (app/(public)/cookies/page.tsx). Réagit en direct à un changement
// de consentement (accepter → charge le script sans reload, refuser après
// coup → le script reste chargé pour l'onglet en cours mais
// saveCookieConsent() a déjà supprimé les cookies _ga côté
// lib/shared/cookieConsent.ts ; un rechargement de page ne rechargera plus
// gtag.js tant que le refus tient).
export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  const enabled = useSyncExternalStore(
    (onStoreChange) => {
      if (!measurementId) return () => undefined
      window.addEventListener('lib:cookie-consent', onStoreChange)
      return () => window.removeEventListener('lib:cookie-consent', onStoreChange)
    },
    () => Boolean(measurementId) && allowsAnalytics(),
    () => false,
  )

  if (!measurementId || !enabled) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  )
}
