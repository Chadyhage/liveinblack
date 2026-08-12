'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, BarChart3, LockKeyhole, SlidersHorizontal } from 'lucide-react'
import { getCookieConsent, saveCookieConsent, type CookieConsentValue } from '@/lib/shared/cookieConsent'
import { Button } from '@/app/components/ui'
import styles from './CookieConsentBanner.module.css'

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
    <div
      ref={bannerRef}
      role="region"
      aria-labelledby="cookie-consent-title"
      className={`${styles.root} ${phase === 'leaving' ? styles.leaving : phase === 'visible' ? styles.visible : ''}`}
    >
      <div className={styles.panel}>
        <div className={styles.intro}>
          <span className={styles.privacyIcon}><LockKeyhole size={21} aria-hidden="true" /></span>
          <div>
            <p id="cookie-consent-title" className={styles.title}>Votre vie privée, votre choix.</p>
            <p className={styles.description}>Les cookies essentiels assurent la connexion, la sécurité et vos billets. Les autres restent désactivés sans votre accord.</p>
          </div>
        </div>

        <div className={styles.categories} aria-label="Catégories de cookies">
          <div className={styles.category}><LockKeyhole size={16} aria-hidden="true" /><span><strong>Essentiels</strong><small>Toujours actifs</small></span><i className={styles.required}>Requis</i></div>
          <div className={styles.category}><SlidersHorizontal size={16} aria-hidden="true" /><span><strong>Préférences</strong><small>Ambiance et confort</small></span><i>Optionnel</i></div>
          <div className={styles.category}><BarChart3 size={16} aria-hidden="true" /><span><strong>Audience</strong><small>Google Analytics</small></span><i>Optionnel</i></div>
        </div>

        <div className={styles.footer}>
          <p>Aucune publicité ni aucun reciblage tiers. <Link href="/cookies">Voir la politique <ArrowUpRight size={13} aria-hidden="true" /></Link></p>
          <div className={styles.actions}>
            <Button className={styles.choiceButton} variant="secondary" onClick={() => dismiss('refused')}>Essentiels uniquement</Button>
            <Button className={`${styles.choiceButton} ${styles.acceptButton}`} variant="secondary" onClick={() => dismiss('accepted')}>Tout autoriser</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
