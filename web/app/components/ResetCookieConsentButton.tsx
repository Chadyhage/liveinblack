'use client'

import { resetCookieConsent } from '@/lib/shared/cookieConsent'

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
    <button
      onClick={reopenConsent}
      style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.9)',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 12,
        padding: '12px 18px',
        minHeight: 44,
        cursor: 'pointer',
      }}
    >
      Réinitialiser mes préférences cookies
    </button>
  )
}
