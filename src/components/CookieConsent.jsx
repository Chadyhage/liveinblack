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
  const [phase, setPhase] = useState('entering') // entering | visible | leaving

  useEffect(() => {
    const t = setTimeout(() => {
      if (!readConsent()) {
        setVisible(true)
        // Petit délai pour que le DOM soit monté avant l'animation
        requestAnimationFrame(() => setPhase('visible'))
      }
    }, 800)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  function dismiss(value) {
    writeConsent(value)
    setPhase('leaving')
    setTimeout(() => setVisible(false), 400)
  }

  return (
    <>
      <style>{`
        .cc-root {
          position: fixed;
          left: 50%; bottom: 20px;
          transform: translateX(-50%) translateY(24px);
          opacity: 0;
          z-index: 999;
          width: calc(100% - 32px);
          max-width: 460px;
          border-radius: 16px;
          overflow: hidden;
          transition: transform 0.5s cubic-bezier(0.22,0.9,0.3,1),
                      opacity 0.5s cubic-bezier(0.22,0.9,0.3,1);
        }
        .cc-root.cc-visible {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        .cc-root.cc-leaving {
          transform: translateX(-50%) translateY(16px);
          opacity: 0;
          transition-duration: 0.35s;
        }

        .cc-stripe {
          height: 1px;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(132,68,255,0.6) 20%,
            rgba(255,77,166,0.5) 50%,
            rgba(132,68,255,0.6) 80%,
            transparent 100%
          );
        }

        .cc-body {
          background: rgba(10,10,18,0.88);
          backdrop-filter: blur(40px) saturate(1.6);
          -webkit-backdrop-filter: blur(40px) saturate(1.6);
          border: 1px solid rgba(255,255,255,0.06);
          border-top: none;
          padding: 20px 22px 18px;
        }

        .cc-title {
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.92);
          margin: 0 0 8px 0;
          letter-spacing: 0.01em;
        }

        .cc-desc {
          font-family: Inter, system-ui, sans-serif;
          font-size: 12.5px;
          color: rgba(255,255,255,0.44);
          margin: 0 0 16px 0;
          line-height: 1.65;
          letter-spacing: 0.005em;
        }
        .cc-desc strong {
          color: rgba(255,255,255,0.68);
          font-weight: 500;
        }
        .cc-desc a {
          color: rgba(255,255,255,0.52);
          text-decoration: none;
          transition: color 0.2s;
        }
        .cc-desc a:hover {
          color: rgba(255,255,255,0.85);
        }

        .cc-actions {
          display: flex;
          gap: 8px;
        }

        .cc-btn {
          flex: 1;
          padding: 10px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-family: Inter, system-ui, sans-serif;
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.2s ease;
          outline: none;
        }

        .cc-btn-refuse {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.48);
        }
        .cc-btn-refuse:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.14);
          color: rgba(255,255,255,0.72);
        }

        .cc-btn-accept {
          background: rgba(255,255,255,0.92);
          border: 1px solid transparent;
          color: #0a0a12;
        }
        .cc-btn-accept:hover {
          background: #fff;
          box-shadow: 0 0 20px rgba(255,255,255,0.12);
        }
        .cc-btn-accept:active {
          transform: scale(0.97);
        }
      `}</style>

      <div
        role="dialog"
        aria-labelledby="cookie-consent-title"
        className={`cc-root ${phase === 'leaving' ? 'cc-leaving' : phase === 'visible' ? 'cc-visible' : ''}`}
      >
        <div className="cc-stripe" />
        <div className="cc-body">
          <p id="cookie-consent-title" className="cc-title">
            Cookies & vie privée
          </p>
          <p className="cc-desc">
            Cookies essentiels pour ta connexion et tes billets.{' '}
            <strong>Aucun tracking, aucune pub.</strong>{' '}
            <Link to="/cookies">En savoir plus →</Link>
          </p>
          <div className="cc-actions">
            <button className="cc-btn cc-btn-refuse" onClick={() => dismiss('refused')}>
              Refuser
            </button>
            <button className="cc-btn cc-btn-accept" onClick={() => dismiss('accepted')}>
              Accepter
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
