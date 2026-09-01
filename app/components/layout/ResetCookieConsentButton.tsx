'use client'

import { resetCookieConsent } from '@/lib/shared/cookieConsent'
import { Button } from '@/app/components/ui'

// Port du bouton "Réinitialiser mes préférences cookies" de
// src/pages/PolitiqueCookiesPage.jsx — permet de rouvrir le bandeau de
// consentement.
export default function ResetCookieConsentButton() {
  function reopenConsent() {
    try {
      resetCookieConsent()
      window.location.reload()
    } catch {}
  }

  return (
    <Button
      variant="secondary"
      onClick={reopenConsent}
      style={{
        fontSize: 'var(--font-size-callout)',
        minHeight: 44,
      }}
    >
      Réinitialiser mes préférences cookies
    </Button>
  )
}
