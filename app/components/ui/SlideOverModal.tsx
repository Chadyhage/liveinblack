'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import Button from './Button'
import styles from './SlideOverModal.module.css'

export interface SlideOverModalProps {
  children: ReactNode
  maxWidth?: number
  // Par défaut router.back() (routes interceptées @modal) — un appelant qui
  // pilote sa propre navigation (état local, paramètre d'URL applicatif type
  // AgentDossiersClient.tsx) passe sa propre fonction de fermeture à la
  // place, sans quoi fermer le tiroir naviguerait en arrière dans
  // l'historique au lieu de simplement retirer le paramètre.
  onClose?: () => void
  ariaLabel?: string
}

// Coquille de modal "tiroir" glissant depuis la droite, utilisée par les
// routes interceptées (app/(public)/@modal/(.)events/[id]/page.tsx et
// équivalents providers/organizers) pour afficher une carte cliquée depuis
// une liste sans quitter la page en cours, tout en gardant chaque page de
// détail link-based (voir ces page.tsx pour la version pleine page utilisée
// en visite directe / refresh / nouvel onglet). Contrairement à Modal.tsx
// (carte centrée, sans animation), cette coquille anime un panneau
// plein-hauteur ancré à droite — pas de lib d'animation dans ce repo, donc
// transition CSS pure pilotée par un état "monté" pour déclencher le
// slide-in au prochain frame.
export default function SlideOverModal({ children, maxWidth = 820, onClose, ariaLabel = 'Panneau de détails' }: SlideOverModalProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const raf = requestAnimationFrame(() => {
      setVisible(true)
      closeRef.current?.focus()
    })
    const { style } = document.body
    const prevOverflow = style.overflow
    style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      style.overflow = prevOverflow
      previouslyFocused?.focus()
    }
  }, [])

  const close = useCallback(() => {
    setClosing(true)
    setVisible(false)
    // Laisse la transition de sortie se jouer avant de dépiler la route (ou
    // d'appeler le onClose fourni) — évite le "saut" visuel d'une navigation
    // instantanée.
    window.setTimeout(() => (onClose ? onClose() : router.back()), 220)
  }, [router, onClose])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !closing) close()
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, closing])

  return (
    <div className={`${styles.root}${visible ? ` ${styles.visible}` : ''}${closing ? ` ${styles.closing}` : ''}`}>
      <Button variant="ghost" className={styles.backdrop} onClick={close} aria-label="Fermer le panneau" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={styles.panel}
        style={{ '--slide-over-width': `${maxWidth}px` } as CSSProperties}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <Button
          ref={closeRef}
          variant="ghost"
          className={styles.close}
          onClick={close}
          aria-label="Fermer"
        >
          <X size={18} strokeWidth={1.8} aria-hidden="true" />
        </Button>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
