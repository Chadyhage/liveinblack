'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getCookieConsent, saveCookieConsent, type CookieConsentValue } from '@/lib/shared/cookieConsent'

type Phase = 'entering' | 'visible' | 'leaving'

// Port de src/components/CookieConsent.jsx — bandeau de consentement cookies,
// conforme CNIL : boutons "Accepter"/"Refuser" de poids visuel équivalent,
// choix mémorisé 6 mois (localStorage + cookie de secours), pas de croix
// trompeuse, pas de "tout accepter" surdimensionné.
//
// Bandeau plein largeur ancré au bord bas du viewport (pas une carte
// flottante centrée) : sur /home, une carte flottante assez haute pour
// contenir titre + description + actions recouvrait entièrement les CTA du
// hero ("Créer mon compte", "Découvrir les événements", "Se connecter") au
// premier chargement. En largeur pleine et sur une seule ligne (texte à
// gauche, actions à droite) dès que l'écran est assez large, la hauteur
// occupée reste minimale et ne chevauche plus le contenu de la page.
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState<Phase>('entering')
  const bannerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!visible || !bannerRef.current) return
    const banner = bannerRef.current
    const updateHeight = () => {
      document.documentElement.style.setProperty('--cookie-consent-height', `${Math.ceil(banner.getBoundingClientRect().height)}px`)
    }
    updateHeight()
    document.body.classList.add('lb-cookie-consent-visible')
    const observer = new ResizeObserver(updateHeight)
    observer.observe(banner)
    return () => {
      observer.disconnect()
      document.body.classList.remove('lb-cookie-consent-visible')
      document.documentElement.style.removeProperty('--cookie-consent-height')
    }
  }, [visible])

  if (!visible) return null

  function dismiss(value: CookieConsentValue) {
    saveCookieConsent(value)
    setPhase('leaving')
    setTimeout(() => setVisible(false), 400)
  }

  return (
    <>
      <style>{`
        .cc-root {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          transform: translateY(100%);
          z-index: 999;
          transition: transform 0.4s cubic-bezier(0.22,0.9,0.3,1);
        }
        .cc-root.cc-visible {
          transform: translateY(0);
        }
        .cc-root.cc-leaving {
          transform: translateY(100%);
          transition-duration: 0.3s;
        }

        .cc-body {
          background: #12131c;
          border-top: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 -16px 40px rgba(0,0,0,0.5);
          padding: 14px 22px;
        }

        .cc-inner {
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .cc-text {
          flex: 1 1 240px;
          min-width: 240px;
        }

        .cc-title {
          font-family: Inter, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.92);
          margin: 0 0 4px 0;
          letter-spacing: 0.01em;
        }

        .cc-desc {
          font-family: Inter, system-ui, sans-serif;
          font-size: 12.5px;
          color: rgba(255,255,255,0.5);
          margin: 0;
          line-height: 1.5;
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
          flex-shrink: 0;
        }

        .cc-btn {
          min-height: 40px;
          padding: 10px 18px;
          border-radius: 10px;
          cursor: pointer;
          font-family: Inter, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          transition: all 0.2s ease;
          outline: none;
        }
        .cc-btn:focus-visible {
          outline: 2px solid var(--teal) !important;
          outline-offset: 3px !important;
          box-shadow: var(--focus-ring) !important;
        }

        .cc-btn-refuse {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.22);
          color: rgba(255,255,255,0.88);
        }
        .cc-btn-refuse:hover {
          background: rgba(255,255,255,0.14);
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.98);
        }
        .cc-btn-refuse:active {
          transform: scale(0.97);
        }

        .cc-btn-accept {
          background: rgba(78,232,200,0.08);
          border: 1px solid rgba(78,232,200,0.42);
          color: rgba(255,255,255,0.88);
        }
        .cc-btn-accept:hover {
          background: rgba(78,232,200,0.14);
          border-color: rgba(78,232,200,0.65);
          color: rgba(255,255,255,0.98);
        }
        .cc-btn-accept:active {
          transform: scale(0.97);
        }
      `}</style>

      <div
        ref={bannerRef}
        role="region"
        aria-label="Choix de confidentialité et de cookies"
        className={`cc-root ${phase === 'leaving' ? 'cc-leaving' : phase === 'visible' ? 'cc-visible' : ''}`}
      >
        <div className="cc-body">
          <div className="cc-inner">
            <div className="cc-text">
              <p id="cookie-consent-title" className="cc-title">
                Cookies & vie privée
              </p>
              <p className="cc-desc">
                Nécessaires au service : connexion, sécurité et billets. Tu peux aussi autoriser la mémorisation de tes préférences d’ambiance.{' '}
                <strong>Aucun traçage publicitaire ni audience tierce.</strong>{' '}
                <Link href="/cookies">En savoir plus</Link>
              </p>
            </div>
            <div className="cc-actions">
              <button className="cc-btn cc-btn-refuse" onClick={() => dismiss('refused')}>
                Tout refuser
              </button>
              <button className="cc-btn cc-btn-accept" onClick={() => dismiss('accepted')}>
                Tout accepter
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
