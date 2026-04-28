// src/components/CookieConsent.jsx
// Bandeau de consentement cookies — conforme CNIL
// - Boutons "Accepter" et "Refuser" de poids visuel équivalent
// - Choix mémorisé en localStorage pendant 6 mois
// - Pas de X trompeur, pas de "tout accepter" surdimensionné
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'lib_cookie_consent'
const CONSENT_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000 // 6 mois

function readConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - (parsed.ts || 0) > CONSENT_TTL_MS) return null
    return parsed
  } catch { return null }
}

function writeConsent(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ value, ts: Date.now() }))
  } catch {}
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Affiche après 800ms pour ne pas perturber le first paint
    const t = setTimeout(() => {
      if (!readConsent()) setVisible(true)
    }, 800)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  function accept() {
    writeConsent('accepted')
    setVisible(false)
  }
  function refuse() {
    writeConsent('refused')
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      style={{
        position: 'fixed',
        left: 16, right: 16, bottom: 16,
        zIndex: 999,
        maxWidth: 520, margin: '0 auto',
        background: 'rgba(8,10,20,0.96)',
        backdropFilter: 'blur(22px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: '18px 20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        fontFamily: "'DM Mono', monospace",
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        {/* Icône cookie SVG */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          <circle cx="9" cy="11" r="0.8" fill="#c8a96e" />
          <circle cx="14" cy="14" r="0.8" fill="#c8a96e" />
          <circle cx="13" cy="9" r="0.8" fill="#c8a96e" />
          <circle cx="16" cy="11" r="0.5" fill="#c8a96e" />
          <circle cx="11" cy="15" r="0.5" fill="#c8a96e" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p id="cookie-consent-title" style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.92)',
            margin: 0, marginBottom: 6, letterSpacing: '0.01em',
          }}>
            Quelques cookies pour bien fonctionner
          </p>
          <p style={{
            fontSize: 11, color: 'rgba(255,255,255,0.55)',
            margin: 0, lineHeight: 1.7, letterSpacing: '0.01em',
          }}>
            On utilise des cookies essentiels pour ta connexion et tes billets, plus quelques cookies de confort. <strong style={{ color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>Aucun pisteur publicitaire, aucune revente.</strong>{' '}
            <Link to="/cookies" style={{ color: '#c8a96e', textDecoration: 'underline', textDecorationColor: 'rgba(200,169,110,0.5)' }}>
              En savoir plus
            </Link>
          </p>
        </div>
      </div>

      {/* Actions — refuser et accepter ont un poids visuel équivalent */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={refuse}
          style={{
            flex: 1,
            padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
            fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', fontWeight: 500,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.72)',
          }}>
            Refuser
        </button>
        <button
          onClick={accept}
          style={{
            flex: 1,
            padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
            fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', fontWeight: 500,
            background: 'rgba(78,232,200,0.16)',
            border: '1px solid rgba(78,232,200,0.50)',
            color: '#4ee8c8',
          }}>
            Accepter
        </button>
      </div>
    </div>
  )
}
