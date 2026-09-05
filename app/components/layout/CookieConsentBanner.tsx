'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Cookie } from 'lucide-react'
import { getCookieConsent, saveCookieConsent, type CookieConsentValue } from '@/lib/shared/cookieConsent'
import styles from './CookieConsentBanner.module.css'

type Phase = 'entering' | 'visible' | 'leaving'

// Petit modal ancré en bas à droite — conforme CNIL :
// boutons "Accepter"/"Refuser" de poids visuel équivalent,
// choix mémorisé 6 mois (localStorage + cookie de secours).
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState<Phase>('entering')
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!getCookieConsent()) {
        setVisible(true)
        requestAnimationFrame(() => setPhase('visible'))
      }
    }, 900)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  function dismiss(value: CookieConsentValue) {
    saveCookieConsent(value)
    setPhase('leaving')
    setTimeout(() => setVisible(false), 350)
  }

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-labelledby="cookie-consent-title"
      className={`${styles.root} ${phase === 'leaving' ? styles.leaving : phase === 'visible' ? styles.visible : ''}`}
    >
      <div className={styles.panel}>
        {/* Contenu texte à gauche */}
        <div className={styles.content}>
          <span className={styles.iconWrap} aria-hidden="true">
            <Cookie size={16} strokeWidth={2} />
          </span>
          <div className={styles.textWrap}>
            <span id="cookie-consent-title" className={styles.title}>Votre vie privée, votre choix.</span>
            <p className={styles.body}>
              Nous utilisons des cookies essentiels pour la connexion et la sécurité. Les cookies optionnels restent désactivés sans votre accord.{' '}
              <Link href="/cookies" className={styles.link} tabIndex={0}>En savoir plus</Link>
            </p>
          </div>
        </div>

        {/* Actions à droite sur la même ligne */}
        <div className={styles.actions}>
          <button className={styles.btnRefuse} onClick={() => dismiss('refused')}>
            Essentiels uniquement
          </button>
          <button className={styles.btnAccept} onClick={() => dismiss('accepted')}>
            Tout autoriser
          </button>
        </div>
      </div>
    </div>
  )
}
