// src/components/CookieConsent.jsx
// Bandeau de consentement cookies — conforme CNIL
// - Boutons "Accepter" et "Refuser" de poids visuel équivalent
// - Choix mémorisé en localStorage pendant 6 mois
// - Pas de X trompeur, pas de "tout accepter" surdimensionné
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCookieConsent, saveCookieConsent } from '../utils/cookies'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState('entering') // entering | visible | leaving

  useEffect(() => {
    const t = setTimeout(() => {
      if (!getCookieConsent()) {
        setVisible(true)
        // Petit délai pour que le DOM soit monté avant l'animation
        requestAnimationFrame(() => setPhase('visible'))
      }
    }, 800)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  function dismiss(value) {
    saveCookieConsent(value)
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
          background: rgba(255,255,255,0.08);
        }

        .cc-body {
          background: #12131c;
          border: 1px solid rgba(255,255,255,0.10);
          border-top: none;
          box-shadow: 0 24px 64px rgba(0,0,0,0.55);
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
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          margin: 0 0 16px 0;
          line-height: 1.6;
        }
        .cc-desc strong {
          color: rgba(255,255,255,0.72);
          font-weight: 600;
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
          min-height: 44px;
          padding: 12px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-family: Inter, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s ease;
          outline: none;
        }

        .cc-btn-refuse {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          color: rgba(255,255,255,0.75);
        }
        .cc-btn-refuse:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.2);
          color: rgba(255,255,255,0.92);
        }

        .cc-btn-accept {
          background: rgba(255,255,255,0.92);
          border: 1px solid transparent;
          color: #0a0a12;
        }
        .cc-btn-accept:hover {
          background: #fff;
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
            Nécessaires au service : connexion, sécurité et billets. Tu peux aussi autoriser la mémorisation de tes préférences d’ambiance.{' '}
            <strong>Aucun traçage publicitaire ni audience tierce.</strong>{' '}
            <Link to="/cookies">En savoir plus</Link>
          </p>
          <div className="cc-actions">
            <button className="cc-btn cc-btn-refuse" onClick={() => dismiss('refused')}>
              Continuer sans préférences
            </button>
            <button className="cc-btn cc-btn-accept" onClick={() => dismiss('accepted')}>
              Accepter les préférences
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
